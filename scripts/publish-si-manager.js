#!/usr/bin/env node
'use strict';

/**
 * Copies the release build (the `suite` profile, see scripts/profiles/suite.json) into the apps suite's
 * si-manager, whose public/ folder is served at the site root - every app loads AngularJS from
 * /angular/angular.min.js, and gets si-manager's version stamp and ETag revalidation like /utilities.js.
 * Run `npm run release:si-manager`, which builds first.
 *
 * The si-manager checkout defaults to ../../apps/si-manager (libs/angular.js next to apps/); set
 * SI_MANAGER=/path/to/si-manager to point elsewhere. Committing and deploying si-manager is left to you.
 */

var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var siManager = path.resolve(process.env.SI_MANAGER || path.join(ROOT, '..', '..', 'apps', 'si-manager'));
var dest = path.join(siManager, 'public', 'angular');
var FILES = ['angular.min.js', 'angular.min.js.map'];

if (!fs.existsSync(path.join(siManager, 'public', 'utilities.js'))) {
  console.error('si-manager not found at ' + siManager + ' (set SI_MANAGER to its checkout)');
  process.exit(1);
}

fs.mkdirSync(dest, {recursive: true});
FILES.forEach(function(file) {
  var src = path.join(ROOT, 'build', file);
  if (!fs.existsSync(src)) {
    console.error('Missing build/' + file + ' - run the suite build first (npm run build:suite)');
    process.exit(1);
  }
  fs.copyFileSync(src, path.join(dest, file));
  console.log('Copied build/' + file + ' to ' + path.relative(process.cwd(), path.join(dest, file)));
});
