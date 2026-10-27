#!/usr/bin/env node
'use strict';

/**
 * Materialises a profile as a source tree so the karma suite can be run against it:
 *
 *   node scripts/profile-overlay.js <outdir> --profile=suite     (or --exclude=a,b)
 *   NG_ROOT=<outdir> npx karma start karma.conf.js              (harness in the scratchpad)
 *
 * <outdir> gets symlinks to everything in the repo except src/ and css/, which are copied with the profile
 * applied (same edits as build-lib.js, files dropped by the profile are deleted). Specs for excluded features are
 * expected to fail; every other spec must still pass.
 */
var fs = require('fs');
var path = require('path');
var profiles = require('./profiles');

var ROOT = path.resolve(__dirname, '..');
var out = path.resolve(process.argv[2]);
var args = process.argv.slice(3);
function arg(n) { var h = args.filter(function(a) { return a.indexOf('--' + n + '=') === 0; })[0]; return h ? h.slice(n.length + 3) : null; }
var profile = arg('profile') ? profiles.loadProfile(arg('profile')) : {exclude: (arg('exclude') || '').split(',').filter(Boolean)};
var P = profiles.create(profile);

fs.rmSync(out, {recursive: true, force: true});
fs.mkdirSync(out, {recursive: true});
fs.readdirSync(ROOT).forEach(function(f) {
  if (['src', 'css', 'build', 'test'].indexOf(f) !== -1) return;
  fs.symlinkSync(path.join(ROOT, f), path.join(out, f));
});
function copy(rel) {
  var from = path.join(ROOT, rel), to = path.join(out, rel);
  fs.mkdirSync(path.dirname(to), {recursive: true});
  if (fs.statSync(from).isDirectory()) {
    fs.readdirSync(from).forEach(function(f) { copy(path.join(rel, f)); });
  } else if (P.dropFiles[rel]) {
    fs.writeFileSync(to, '');
  } else if (P.dropSpecs[rel]) {
    fs.writeFileSync(to, '');
  } else if (/\.(js|css)$/.test(rel)) {
    fs.writeFileSync(to, P.transform(rel, fs.readFileSync(from, 'utf8')));
  } else {
    fs.copyFileSync(from, to);
  }
}
copy('src');
copy('css');
copy('test');
console.log('profile overlay (' + P.exclude.length + ' features) written to ' + out);
