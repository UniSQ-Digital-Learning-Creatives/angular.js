#!/usr/bin/env node
'use strict';

/**
 * Runs the whole karma suite against *minified* sources.
 *
 *   node scripts/verify-minified.js <outdir> [--aggressive]
 *   NG_ROOT=<outdir> MODE=jqlite|jquery npx karma start karma.conf.js        (harness in the scratchpad)
 *
 * Every src/**.js file is passed through terser with the same compress/mangle options as build-lib.js
 * (keep TERSER_OPTIONS below in sync) and written to <outdir>/src; everything else is symlinked. Locals are
 * mangled and compressed, top-level names are kept (the specs address them), so this exercises every
 * function-level transform of the minifier against ~6200 specs. Whole-bundle effects (top-level inlining,
 * dead-code removal) are covered by the browser A/B checks instead.
 */
var fs = require('fs');
var path = require('path');
var terser = require('./build-tools').require('terser');

var ROOT = path.resolve(__dirname, '..');
var out = path.resolve(process.argv[2]);
var options = {
  ecma: 2020,
  compress: {passes: 2, ecma: 2020, pure_funcs: ['valueFn', 'ngDirective', 'classDirective', 'formDirectiveFactory', 'minErr']},
  mangle: true,
  format: {comments: true}
};
if (process.argv.indexOf('--aggressive') !== -1) { options.compress.unsafe_methods = true; options.compress.pure_getters = true; }

fs.rmSync(out, {recursive: true, force: true});
fs.mkdirSync(out, {recursive: true});
fs.readdirSync(ROOT).forEach(function(f) {
  if (['src', 'build', 'node_modules', 'docs'].indexOf(f) === -1) fs.symlinkSync(path.join(ROOT, f), path.join(out, f));
});
fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(out, 'node_modules'));

var jobs = [];
(function walk(dir, to) {
  fs.mkdirSync(to, {recursive: true});
  fs.readdirSync(dir, {withFileTypes: true}).forEach(function(e) {
    var from = path.join(dir, e.name), dest = path.join(to, e.name);
    if (e.isDirectory()) return walk(from, dest);
    if (!/\.js$/.test(e.name)) return fs.copyFileSync(from, dest);
    var text = fs.readFileSync(from, 'utf8');
    jobs.push(terser.minify(text, options).then(function(r) { fs.writeFileSync(dest, r.code); }, function(err) {
      console.log('copied unminified (' + err.message + '): ' + path.relative(ROOT, from));   // e.g. src/angular.bind.js is a fragment
      fs.writeFileSync(dest, text);
    }));
  });
})(path.join(ROOT, 'src'), path.join(out, 'src'));
Promise.all(jobs).then(function() { console.log('minified ' + jobs.length + ' files into ' + out); });
