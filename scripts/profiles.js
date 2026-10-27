'use strict';

/**
 * Build "profiles": exclude whole features from the shipped angular.js / angular.min.js.
 *
 *   node scripts/build-lib.js --profile=suite            (scripts/profiles/suite.json)
 *   node scripts/build-lib.js --profile=/path/my.json
 *
 * A profile is just  { "description": "...", "exclude": ["featureId", ...] }.
 * Feature ids are defined in scripts/features.json. A feature is a recipe made of
 *
 *   files : src files that are not concatenated at all
 *   specs : spec files that only test this feature (blanked by profile-overlay.js when running the suite)
 *   lines : [{file, match, count?}]  remove every line of `file` that contains the text `match`
 *           (typically a registration line in AngularPublic.js / filter.js); the build fails if `match`
 *           is not found, or does not occur exactly `count` times (default: at least once)
 *   edits : [{file, find, replace}]  replace the first occurrence of the text `find` (build fails if missing)
 *           [{file, removeFunction: "name"}]   delete the (single) function declaration `name`
 *           [{file, removeProperty: "key"}]    delete the (single) object-literal property `key: ...` (and its comma)
 *           [{file, removeStatement: "text"}]  delete the (single) top-level-or-nested statement whose source starts with `text`
 *           [{file, removeConstructor: "Name"}]  delete function `Name` and all its top-level `Name.x = ...` / `Name.prototype... = ...` statements
 *           These are located with acorn (so they survive reformatting) and fail if not exactly one match,
 *           unless `count` is given.
 *
 * Most features are just the registration line: once nothing registers a directive/service/filter, the
 * minifier tree-shakes the (now unreferenced) implementation. Because every recipe is anchored on literal text,
 * a source change that moves the anchor fails the build loudly instead of silently shipping the feature.
 *
 * Excluding a feature is a BREAKING change for any page that uses it; see reports/build.md for the evidence list.
 */

var fs = require('fs');
var path = require('path');
var tools = require('./build-tools');

var ROOT = path.resolve(__dirname, '..');

function loadFeatures() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'features.json'), 'utf8'));
}

function loadProfile(nameOrPath) {
  var file = /[\\/]/.test(nameOrPath) || /\.json$/.test(nameOrPath) ?
    path.resolve(nameOrPath) : path.join(__dirname, 'profiles', nameOrPath + '.json');
  var profile = JSON.parse(fs.readFileSync(file, 'utf8'));
  profile.file = file;
  return profile;
}

function countOccurrences(text, needle) {
  var n = 0, i = -1;
  while ((i = text.indexOf(needle, i + 1)) !== -1) n++;
  return n;
}

function astRemove(text, edit, id, rel) {
  var acorn = tools.require('acorn');
  var walk = tools.require('acorn-walk');
  var ast = acorn.parse(text, {ecmaVersion: 'latest', sourceType: 'script'});
  var hits = [];
  walk.full(ast, function(node) {
    if (edit.removeFunction && node.type === 'FunctionDeclaration' && node.id.name === edit.removeFunction) hits.push(node);
    if (edit.removeProperty && node.type === 'Property' && !node.computed &&
        ((node.key.type === 'Identifier' && node.key.name === edit.removeProperty) ||
         (node.key.type === 'Literal' && node.key.value === edit.removeProperty))) hits.push(node);
    if (edit.removeConstructor) {
      // `function Name(){}` plus every top-level `Name.x = ...` / `Name.prototype[.x] = ...` statement.
      // (terser keeps an unreferenced constructor alive because of those assignments)
      if (node.type === 'FunctionDeclaration' && node.id.name === edit.removeConstructor) hits.push(node);
      if (node.type === 'ExpressionStatement' && node.expression.type === 'AssignmentExpression' &&
          node.expression.left.type === 'MemberExpression') {
        var root = node.expression.left;
        while (root.type === 'MemberExpression') root = root.object;
        if (root.type === 'Identifier' && root.name === edit.removeConstructor) hits.push(node);
      }
    }
    if (edit.removeStatement && /Statement$|Declaration$/.test(node.type) && node.type !== 'BlockStatement' &&
        text.slice(node.start, node.end).indexOf(edit.removeStatement) === 0) hits.push(node);
  });
  var what = edit.removeFunction || edit.removeProperty || edit.removeStatement || edit.removeConstructor;
  var expected = edit.count || (edit.removeConstructor ? hits.length : 1);
  if (edit.removeConstructor && !hits.some(function(n) { return n.type === 'FunctionDeclaration'; })) hits.length = 0;
  if (hits.length !== expected) {
    throw new Error('feature "' + id + '": ' + JSON.stringify(what) + ' matched ' + hits.length + ' node(s) in ' + rel + ', expected ' + expected);
  }
  hits.sort(function(a, b) { return b.start - a.start; });   // back to front
  hits.forEach(function(node) {
    var start = node.start, end = node.end;
    if (node.type === 'Property') {
      var m = /^\s*,/.exec(text.slice(end));
      if (m) {
        end += m[0].length;
      } else {
        var before = text.slice(0, start), c = /,\s*$/.exec(before);
        if (c) start -= c[0].length;
      }
    }
    // swallow the rest of the line if the node is alone on it
    var lineStart = text.lastIndexOf('\n', start - 1) + 1, lineEnd = text.indexOf('\n', end);
    if (lineEnd === -1) lineEnd = text.length;
    if (!text.slice(lineStart, start).trim() && !text.slice(end, lineEnd).trim()) { start = lineStart; end = lineEnd + 1; }
    text = text.slice(0, start) + text.slice(end);
  });
  return text;
}

/**
 * Returns {dropFiles: Set, transform: function(relPath, text) -> text, applied: [ids]}
 */
exports.create = function(profile, features) {
  features = features || loadFeatures();
  var exclude = [];
  (function expand(ids) {
    ids.forEach(function(id) {
      if (!features[id]) throw new Error('profile ' + (profile.file || '') + ': unknown feature "' + id + '" (see scripts/features.json)');
      if (features[id].includes) expand(features[id].includes);
      else if (exclude.indexOf(id) === -1) exclude.push(id);
    });
  })(profile.exclude || []);
  var dropFiles = {};
  var dropSpecs = {};
  var lineRules = {};   // file -> [{match,count,id}]
  var editRules = {};   // file -> [{find,replace,id}]

  exclude.forEach(function(id) {
    var f = features[id];
    if (!f) throw new Error('profile ' + (profile.file || '') + ': unknown feature "' + id + '" (see scripts/features.json)');
    (f.files || []).forEach(function(file) { dropFiles[file] = id; });
    (f.specs || []).forEach(function(file) { dropSpecs[file] = id; });
    (f.lines || []).forEach(function(r) { (lineRules[r.file] = lineRules[r.file] || []).push({match: r.match, count: r.count, id: id}); });
    (f.edits || []).forEach(function(r) { (editRules[r.file] = editRules[r.file] || []).push(Object.assign({id: id}, r)); });
  });

  var touched = {};

  function transform(rel, text) {
    var lr = lineRules[rel], er = editRules[rel];
    if (!lr && !er) return text;
    (er || []).forEach(function(r) {
      if (r.removeFunction || r.removeProperty || r.removeStatement || r.removeConstructor) { text = astRemove(text, r, r.id, rel); return; }
      var n = countOccurrences(text, r.find);
      if (n === 0) throw new Error('feature "' + r.id + '": edit anchor not found in ' + rel + ': ' + JSON.stringify(r.find.slice(0, 80)));
      text = text.replace(r.find, function() { return r.replace; });
    });
    (lr || []).forEach(function(r) {
      var lines = text.split('\n'), kept = [], removed = 0;
      lines.forEach(function(line) {
        if (line.indexOf(r.match) !== -1) removed++; else kept.push(line);
      });
      if (removed === 0 || (r.count && removed !== r.count)) {
        throw new Error('feature "' + r.id + '": line anchor ' + JSON.stringify(r.match) + ' matched ' + removed +
          ' line(s) in ' + rel + (r.count ? ' (expected ' + r.count + ')' : ''));
      }
      text = kept.join('\n');
    });
    touched[rel] = true;
    return text;
  }

  return {
    exclude: exclude,
    dropFiles: dropFiles,
    dropSpecs: dropSpecs,
    transform: transform,
    unusedFileDrops: function(allFiles) {
      return Object.keys(dropFiles).filter(function(f) { return allFiles.indexOf(f) === -1; });
    }
  };
};

/**
 * Names that are referenced but not declared in `profiledSrc` and were not already free in `baselineSrc`
 * (i.e. dangling references created by cutting features out). Used as a build-time safety net.
 */
exports.danglingReferences = function(profiledSrc, baselineSrc) {
  var acorn = tools.require('acorn');
  var escope = tools.require('eslint-scope');
  function free(src) {
    var ast = acorn.parse(src, {ecmaVersion: 'latest', sourceType: 'script', ranges: true});
    var out = {};
    escope.analyze(ast, {ecmaVersion: 2020, sourceType: 'script'}).globalScope.through.forEach(function(ref) {
      out[ref.identifier.name] = (out[ref.identifier.name] || 0) + 1;
    });
    return out;
  }
  var base = free(baselineSrc), prof = free(profiledSrc);
  return Object.keys(prof).filter(function(n) { return !(n in base); });
};

exports.loadFeatures = loadFeatures;
exports.loadProfile = loadProfile;
