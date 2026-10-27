#!/usr/bin/env node
'use strict';

/**
 * Standalone, Node-22-native replacement for the parts of `grunt build`/`grunt minall` that
 * actually produce the shipped library (concat + version-stamp + minify). It reads the same
 * source of truth as the Grunt build (angularFiles.js, src/*.prefix|*.suffix) so the output is
 * structurally identical to what the official toolchain would produce.
 *
 * Deliberately skips everything in Gruntfile.js/lib/grunt that doesn't affect the shipped
 * library: docs generation (dgeni), Protractor/Selenium e2e, SauceLabs/Firebase deploy, the
 * mandatory `yarn install` Gruntfile.js runs on load, and the network-dependent CDN version
 * lookup in lib/versions/version-info.js. None of that changes what a consuming app receives.
 *
 * Usage: node scripts/build-lib.js [--no-minify]
 */

var fs = require('fs');
var path = require('path');
var childProcess = require('child_process');

var ROOT = path.resolve(__dirname, '..');
var angularFiles = require(path.join(ROOT, 'angularFiles')).files;

var MINIFY = process.argv.indexOf('--no-minify') === -1;

function argValue(name) {
  var hit = process.argv.filter(function(a) { return a.indexOf('--' + name + '=') === 0; })[0];
  return hit ? hit.slice(name.length + 3) : null;
}

// --out-dir=<dir>: write build output elsewhere than ./build (parallel experiments)
var BUILD_DIR = argValue('out-dir') ? path.resolve(argValue('out-dir')) : path.join(ROOT, 'build');

// --profile=<name|path>: exclude features listed in scripts/profiles/<name>.json (see scripts/profiles.js)
var PROFILE = null;
var profiles = require('./profiles');
if (argValue('profile')) {
  PROFILE = profiles.create(profiles.loadProfile(argValue('profile')));
}
// --exclude=a,b,c: ad-hoc profile (used for measuring the cost of individual features)
if (argValue('exclude') !== null) {
  PROFILE = require('./profiles').create({exclude: argValue('exclude').split(',').filter(Boolean)});
}
// --targets=angular,angular-loader: only build/minify these targets (dest without .js)
var ONLY_TARGETS = argValue('targets') ? argValue('targets').split(',') : null;

function abs(relPath) {
  return path.join(ROOT, relPath);
}

function read(relPath) {
  var text = fs.readFileSync(abs(relPath), 'utf8');
  return PROFILE ? PROFILE.transform(relPath, text) : text;
}

// ---------------------------------------------------------------------------
// Version string (cosmetic only -- embedded in angular.version and error-message URLs,
// not consulted by any runtime behavior, so a simplified local computation is safe).
// ---------------------------------------------------------------------------

function git(args) {
  var result = childProcess.spawnSync('git', args, {cwd: ROOT, encoding: 'utf8'});
  return result.status === 0 ? result.stdout.trim() : null;
}

function getVersion() {
  if (process.env.NG_VERSION) {
    var vm = process.env.NG_VERSION.match(/^(\d+)\.(\d+)\.(\d+)/);
    return {full: process.env.NG_VERSION, major: +vm[1], minor: +vm[2], patch: +vm[3],
      cdn: process.env.NG_VERSION, codeName: /-/.test(process.env.NG_VERSION) ? 'snapshot' : 'release'};
  }
  var describe = git(['describe', '--tags']);
  var shortSha = git(['rev-parse', '--short', 'HEAD']) || 'unknown';

  var tag = describe ? describe.match(/^v?(\d+)\.(\d+)\.(\d+)/) : null;
  var major = tag ? Number(tag[1]) : 0;
  var minor = tag ? Number(tag[2]) : 0;
  var patch = tag ? Number(tag[3]) : 0;
  var exactTag = describe ? !/-\d+-g[0-9a-f]+$/.test(describe) : false;

  var full = major + '.' + minor + '.' + patch + (exactTag ? '' : '-local.' + shortSha);

  return {
    full: full,
    major: major,
    minor: minor,
    patch: patch,
    cdn: full,
    codeName: exactTag ? 'release' : 'snapshot'
  };
}

// ---------------------------------------------------------------------------
// build(): concat + wrap + version-substitute + strict-dedupe
// (mirrors lib/grunt/utils.js's build()/process()/singleStrict()/addStyle())
// ---------------------------------------------------------------------------

function wrap(files, name) {
  return [path.join('src', name + '.prefix')].concat(files, [path.join('src', name + '.suffix')]);
}

function substituteVersion(src, version) {
  return src
    .replace(/(['"])NG_VERSION_FULL\1/g, version.full)
    .replace(/(['"])NG_VERSION_MAJOR\1/, version.major)
    .replace(/(['"])NG_VERSION_MINOR\1/, version.minor)
    .replace(/(['"])NG_VERSION_DOT\1/, version.patch)
    .replace(/(['"])NG_VERSION_CDN\1/, version.cdn)
    .replace(/(['"])NG_VERSION_CODENAME\1/, version.codeName);
}

function singleStrict(src, insert) {
  return src
    .replace(/\s*("|')use strict("|');\s*/g, insert)
    .replace(/(\(function\([^)]*\)\s*\{)/, '$1\'use strict\';');
}

function processSource(src, version, strict) {
  var processed = substituteVersion(src, version);
  if (strict !== false) processed = singleStrict(processed, '\n\n');
  return processed;
}

function escapeCssForJs(css) {
  return css
    .replace(/\\/g, '\\\\')
    .replace(/'/g, '\\\'')
    .replace(/\r?\n/g, '\\n');
}

function minifyCss(css) {
  return css
    .replace(/\r?\n/g, '')
    .replace(/\/\*.*?\*\//g, '')
    .replace(/:\s+/g, ':')
    .replace(/\s*\{\s*/g, '{')
    .replace(/\s*\}\s*/g, '}')
    .replace(/\s*,\s*/g, ',')
    .replace(/\s*;\s*/g, ';')
    // injected into a <style> element: @charset is meaningless there, the last ';' of a block and the space
    // before !important are redundant
    .replace(/^@charset "[^"]*";/, '')
    .replace(/;}/g, '}')
    .replace(/\s+!important/g, '!important');
}

function addStyle(src, cssFiles, generateCspCssFile) {
  var jsParts = [src];
  var cssParts = [];

  cssFiles.forEach(function(cssFile) {
    var css = read(cssFile);
    cssParts.push(css);
    // same effect as angular.element(document.head).prepend(angular.element('<style>').text(css)), without
    // going through the (jqLite or jQuery) wrapper
    var jsInjection = '!window.angular.$$csp().noInlineStyle&&document.head.prepend(Object.assign(' +
      'document.createElement(\'style\'),{textContent:\'' + escapeCssForJs(minifyCss(css)) + '\'}));';
    jsParts.push(jsInjection);
  });

  if (generateCspCssFile) {
    var cspHeader = '/* Include this file in your html if you are using the CSP mode. */\n\n';
    fs.writeFileSync(path.join(BUILD_DIR, 'angular-csp.css'), cspHeader + cssParts.join('\n'));
  }

  return jsParts.join('\n');
}

function buildTarget(target, version) {
  var files = PROFILE ? target.files.filter(function(f) { return !PROFILE.dropFiles[f]; }) : target.files;
  var src = files.map(read).join('\n');
  if (PROFILE && target.dest === 'angular.js') {
    // safety net: cutting features must not leave references to code that no longer exists
    var baselineSrc = target.files.map(function(f) { return fs.readFileSync(abs(f), 'utf8'); }).join('\n');
    var dangling = profiles.danglingReferences(src, baselineSrc);
    if (dangling.length) {
      throw new Error('profile leaves dangling references (a kept file uses code that was cut): ' + dangling.join(', ') +
        '\nFix the feature recipe in scripts/features.json (or exclude the dependent feature too).');
    }
  }
  var processed = processSource(src, version, target.strict);
  if (target.styles) {
    processed = addStyle(processed, target.styles, true);
  }
  var destPath = path.join(BUILD_DIR, target.dest);
  fs.writeFileSync(destPath, processed);
  console.log('File build/' + target.dest + ' created.');
  return destPath;
}

// ---------------------------------------------------------------------------
// min(): two interchangeable minifiers.
//
//  * terser (default): pure Node, no Java. The minErr pass (message text -> angular-errors.json) is done
//    by scripts/minerr-pass.js (an acorn port of ng-closure-runner's `--minerr_pass`), then terser
//    minifies for ES2020 browsers, chaining the source maps.
//  * closure (`--minifier=closure`): the original vendored 2014 Closure Compiler + ng-closure-runner (Java).
// ---------------------------------------------------------------------------

var MINIFIER = (process.argv.filter(function(a) { return /^--minifier=/.test(a); })[0] || '--minifier=terser').split('=')[1];

// Compact replacement for the license banner (MIT only requires the notice to be retained).
function licenseBanner(version) {
  return '/*! AngularJS v' + version.full + ' | (c) 2010-2020 Google LLC | MIT | http://angularjs.org */\n';
}

// Options chosen by measurement (see reports/build.md); only options verified against the whole
// karma suite (scripts/verify-minified.js) are enabled. Notably NOT enabled: unsafe_arrows /
// unsafe_methods (-0.4% gz but `new` on a converted function breaks 2 specs), booleans_as_integers
// (breaks strict === on returned booleans), mangle.properties.
var TERSER_OPTIONS = {
  ecma: 2020,
  // these top-level helpers only build closures/arrays, so an unused `var x = helper(...)` can be dropped
  // (this is what lets excluded features -- see scripts/profiles.js -- be tree-shaken)
  compress: {passes: 2, ecma: 2020, pure_funcs: ['valueFn', 'ngDirective', 'classDirective', 'formDirectiveFactory', 'minErr']},
  mangle: true,
  format: {ascii_only: true, comments: false}
};

function minifyTargetTerser(filePath, version) {
  var tools = require('./build-tools');
  var terser = tools.require('terser');
  var minerr = require('./minerr-pass');

  var minFile = filePath.replace(/\.js$/, '.min.js');
  var mapFile = minFile + '.map';
  var errorFile = filePath.replace(/\.js$/, '-errors.json');
  var code = fs.readFileSync(filePath, 'utf8');

  var pre = minerr.transform(code, {
    url: 'https://errors.angularjs.org/' + version.full + '/',
    filename: path.basename(filePath)
  });
  fs.writeFileSync(errorFile, JSON.stringify(pre.errors));

  var options = JSON.parse(JSON.stringify(TERSER_OPTIONS));
  if (process.argv.indexOf('--aggressive') !== -1) {
    // opt-in, passes the whole karma suite: {a: function(){}} -> {a(){}} (a method cannot be `new`ed) and
    // property reads assumed side-effect free. Worth ~0.4% gzip; not enabled by default.
    options.compress.unsafe_methods = true;
    options.compress.pure_getters = true;
  }
  options.format.preamble = licenseBanner(version).trim();
  options.sourceMap = {
    content: JSON.stringify(pre.map),
    filename: path.basename(minFile),
    url: path.basename(mapFile)
  };
  return terser.minify(pre.code, options).then(function(result) {
    fs.writeFileSync(minFile, result.code + '\n');
    var map = JSON.parse(result.map);
    delete map.sourcesContent;
    fs.writeFileSync(mapFile, JSON.stringify(map));
    console.log(path.relative(ROOT, filePath) + ' minified (terser) into ' + path.relative(ROOT, minFile));
  });
}

function minifyTargetClosure(filePath, version) {
  var minFile = filePath.replace(/\.js$/, '.min.js');
  var mapFile = minFile + '.map';
  var mapFileName = path.basename(mapFile);
  var errorFile = filePath.replace(/\.js$/, '-errors.json');
  var isMessageFormat = path.basename(filePath) === 'angular-message-format.js';
  var compilationLevel = isMessageFormat ? 'ADVANCED_OPTIMIZATIONS' : 'SIMPLE_OPTIMIZATIONS';
  var classpathSep = process.platform === 'win32' ? ';' : ':';

  var args = [
    '-Xmx2g',
    '-cp', abs('vendor/closure-compiler/compiler.jar') + classpathSep + abs('vendor/ng-closure-runner/ngcompiler.jar'),
    'org.angularjs.closurerunner.NgClosureRunner',
    '--compilation_level', compilationLevel,
    '--language_in', 'ECMASCRIPT5_STRICT',
    '--minerr_pass',
    '--minerr_errors', errorFile,
    '--minerr_url', 'https://errors.angularjs.org/' + version.full + '/',
    '--source_map_format=V3',
    '--create_source_map', mapFile,
    '--js', filePath,
    '--js_output_file', minFile
  ];

  var result = childProcess.spawnSync('java', args, {cwd: ROOT, encoding: 'utf8'});
  if (result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
    throw new Error('Error minifying ' + filePath);
  }

  // Closure creates the source map relative to build/, strip those references (matches original).
  var mapContent = fs.readFileSync(mapFile, 'utf8')
    .replace('"file":"build/', '"file":"')
    .replace('"sources":["build/', '"sources":["');
  fs.writeFileSync(mapFile, mapContent);

  var minContent = fs.readFileSync(minFile, 'utf8');
  minContent = singleStrict(minContent, '\n') + '//# sourceMappingURL=' + mapFileName + '\n';
  fs.writeFileSync(minFile, minContent);

  console.log(path.relative(ROOT, filePath) + ' minified into ' + path.relative(ROOT, minFile));
  return Promise.resolve();
}

function minifyTarget(filePath, version) {
  return MINIFIER === 'closure' ? minifyTargetClosure(filePath, version) : minifyTargetTerser(filePath, version);
}

// ---------------------------------------------------------------------------
// Target definitions (mirrors Gruntfile.js's `build`/`min` config, lines 197-324)
// ---------------------------------------------------------------------------

function defineTargets() {
  var m = angularFiles.angularModules;
  var moduleTarget = function(name, key) {
    return {dest: 'angular-' + name + '.js', files: wrap(m[key], 'module'), minify: true};
  };

  return [
    {
      dest: 'angular.js',
      files: wrap(angularFiles.angularSrc, 'angular'),
      styles: ['css/angular.css'],
      minify: true
    },
    {dest: 'angular-loader.js', files: wrap(angularFiles.angularLoader, 'loader'), minify: true},
    {dest: 'angular-mocks.js', files: wrap(m.ngMock, 'module'), strict: false, minify: false},
    moduleTarget('touch', 'ngTouch'),
    moduleTarget('sanitize', 'ngSanitize'),
    moduleTarget('resource', 'ngResource'),
    moduleTarget('message-format', 'ngMessageFormat'),
    moduleTarget('messages', 'ngMessages'),
    moduleTarget('animate', 'ngAnimate'),
    moduleTarget('route', 'ngRoute'),
    moduleTarget('cookies', 'ngCookies'),
    moduleTarget('aria', 'ngAria'),
    {dest: 'angular-parse-ext.js', files: wrap(m.ngParseExt, 'module'), minify: false}
  ];
}

function main() {
  var version = getVersion();
  console.log('Building AngularJS ' + version.full + ' (Node ' + process.version + ')');

  if (PROFILE) {
    var allFiles = angularFiles.angularSrc;
    var missing = PROFILE.unusedFileDrops(allFiles);
    if (missing.length) throw new Error('profile drops files that are not in angularFiles.angularSrc: ' + missing.join(', '));
    console.log('Profile excludes ' + PROFILE.exclude.length + ' feature(s): ' + PROFILE.exclude.join(', '));
  }

  fs.rmSync(BUILD_DIR, {recursive: true, force: true});
  fs.mkdirSync(BUILD_DIR, {recursive: true});

  var targets = defineTargets();
  if (ONLY_TARGETS) {
    targets = targets.filter(function(t) { return ONLY_TARGETS.indexOf(t.dest.replace(/\.js$/, '')) !== -1; });
  }
  var builtPaths = targets.map(function(target) { return buildTarget(target, version); });

  var done = Promise.resolve();
  if (MINIFY) {
    targets.forEach(function(target, i) {
      if (target.minify) done = done.then(function() { return minifyTarget(builtPaths[i], version); });
    });
  } else {
    console.log('Skipping minification (--no-minify)');
  }
  return done.then(function() { finish(); });
}

function finish() {
  if ((PROFILE || ONLY_TARGETS || argValue('out-dir')) && process.argv.indexOf('--install') === -1) {
    console.log('Profile/partial build: output left in build/ (pass --install to also copy to the package root).');
    return;
  }
  // Also expose the files consumers expect to find at the package root
  // (e.g. `node_modules/angular/angular.js`), alongside package.json.
  ['angular.js', 'angular.min.js', 'angular.min.js.map', 'angular-csp.css'].forEach(function(file) {
    var src = path.join(BUILD_DIR, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, abs(file));
      console.log('Copied build/' + file + ' to ' + file + '.');
    }
  });

  console.log('Done.');
}

main().catch(function(e) { console.error(e); process.exit(1); });
