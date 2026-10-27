#!/usr/bin/env node
'use strict';

/**
 * Dangling-reference check for a profile build.
 *
 *   node scripts/check-profile.js --profile=suite        (or --exclude=a,b)
 *
 * Builds the un-minified bundle with and without the profile and reports every identifier that is referenced
 * but no longer declared once features were cut (what would be a ReferenceError the moment that code path runs).
 * Exit code 1 if any are found.
 */
var fs = require('fs');
var os = require('os');
var path = require('path');
var cp = require('child_process');
var tools = require('./build-tools');
var acorn = tools.require('acorn');
var escope = tools.require('eslint-scope');

var ROOT = path.resolve(__dirname, '..');
var passThrough = process.argv.slice(2).filter(function(a) { return /^--(profile|exclude)=/.test(a); });
var tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ngcheck-'));

function unresolved(dir) {
  var code = fs.readFileSync(path.join(dir, 'angular.js'), 'utf8');
  var ast = acorn.parse(code, {ecmaVersion: 'latest', sourceType: 'script', ranges: true});
  var manager = escope.analyze(ast, {ecmaVersion: 2020, sourceType: 'script'});
  var out = {};
  manager.globalScope.through.forEach(function(ref) { out[ref.identifier.name] = (out[ref.identifier.name] || 0) + 1; });
  return out;
}
function build(name, extra) {
  var dir = path.join(tmp, name);
  var r = cp.spawnSync('node', [path.join(__dirname, 'build-lib.js'), '--targets=angular', '--no-minify', '--out-dir=' + dir].concat(extra),
    {cwd: ROOT, encoding: 'utf8'});
  if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(2); }
  return dir;
}

var base = unresolved(build('base', []));
var prof = unresolved(build('prof', passThrough));
var bad = Object.keys(prof).filter(function(n) { return !(n in base); });
fs.rmSync(tmp, {recursive: true, force: true});
if (bad.length) {
  console.log('Dangling references introduced by the profile:');
  bad.forEach(function(n) { console.log('  ' + n + ' (x' + prof[n] + ')'); });
  process.exit(1);
}
console.log('OK: no dangling references (' + Object.keys(base).length + ' browser globals unchanged).');
