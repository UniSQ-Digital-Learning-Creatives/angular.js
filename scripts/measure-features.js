#!/usr/bin/env node
'use strict';

/**
 * Per-feature cost table: builds the main bundle once with each feature of scripts/features.json excluded on its
 * own (in parallel), and prints the min / gzip -9 / brotli-11 delta against the full build.
 *
 *   node scripts/measure-features.js [--profile=suite] [--json=out.json] [id ...]
 *
 * With --profile the deltas are measured against that profile (i.e. "what does this feature still cost once the
 * profile is applied"); features already in the profile are skipped.
 */
var fs = require('fs');
var os = require('os');
var path = require('path');
var zlib = require('zlib');
var cp = require('child_process');

var ROOT = path.resolve(__dirname, '..');
var features = require('./profiles').loadFeatures();
var args = process.argv.slice(2);
var profileArg = (args.filter(function(a) { return /^--profile=/.test(a); })[0] || '').slice(10);
var jsonOut = (args.filter(function(a) { return /^--json=/.test(a); })[0] || '').slice(7);
var ids = args.filter(function(a) { return a.indexOf('--') !== 0; });
var base = profileArg ? require('./profiles').loadProfile(profileArg).exclude : [];
if (!ids.length) ids = Object.keys(features).filter(function(id) { return base.indexOf(id) === -1; });

function sizes(file) {
  var b = fs.readFileSync(file);
  return {
    raw: b.length,
    gz: cp.execFileSync('gzip', ['-9', '-c'], {input: b, maxBuffer: 1e9}).length,
    br: zlib.brotliCompressSync(b, {params: {
      [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_LGWIN]: 24,
      [zlib.constants.BROTLI_PARAM_SIZE_HINT]: b.length}}).length
  };
}

var tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ngfeat-'));
function build(name, exclude) {
  return new Promise(function(resolve) {
    var out = path.join(tmp, name.replace(/[^\w.-]/g, '_'));
    var p = cp.spawn('node', [path.join(__dirname, 'build-lib.js'), '--targets=angular', '--out-dir=' + out,
      '--exclude=' + exclude.join(',')], {cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe']});
    var err = '';
    p.stderr.on('data', function(d) { err += d; });
    p.on('close', function(code) {
      if (code !== 0) return resolve({error: err.split('\n').filter(Boolean).slice(0, 3).join(' ')});
      resolve(sizes(path.join(out, 'angular.min.js')));
    });
  });
}

(async function() {
  var baseline = await build('__base', base);
  var results = {};
  var queue = ids.slice(), running = [];
  async function worker() {
    while (queue.length) {
      var id = queue.shift();
      var r = await build(id, base.concat([id]));
      results[id] = r.error ? r : {raw: baseline.raw - r.raw, gz: baseline.gz - r.gz, br: baseline.br - r.br};
    }
  }
  var n = Math.max(1, Math.min(8, os.cpus().length - 2));
  for (var i = 0; i < n; i++) running.push(worker());
  await Promise.all(running);
  console.log('baseline: ' + baseline.raw + ' min / ' + baseline.gz + ' gz / ' + baseline.br + ' br');
  console.log('feature'.padEnd(46) + 'min'.padStart(8) + 'gz'.padStart(8) + 'br'.padStart(8));
  Object.keys(results).sort(function(a, b) { return (results[b].gz || -1) - (results[a].gz || -1); }).forEach(function(id) {
    var r = results[id];
    console.log(id.padEnd(46) + (r.error ? ('  ERROR ' + r.error) : String(r.raw).padStart(8) + String(r.gz).padStart(8) + String(r.br).padStart(8)));
  });
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({baseline: baseline, results: results}, null, 1));
  fs.rmSync(tmp, {recursive: true, force: true});
})();
