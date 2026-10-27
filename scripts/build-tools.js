'use strict';

/**
 * Resolves the build-time dev tools (terser, acorn, acorn-walk, magic-string, eslint-scope). They live in
 * their own small package, scripts/build-tools (`npm run build:tools` installs them), so building doesn't
 * need the repo's legacy Grunt/Karma devDependencies. NG_BUILD_TOOLS=/path/to/node_modules can point at
 * another install instead; anything resolvable from the repo itself also works.
 */
var path = require('path');

var LOCAL_TOOLS = path.join(__dirname, 'build-tools');

exports.require = function(name) {
  var extra = process.env.NG_BUILD_TOOLS;
  var searchPaths = (extra ? [path.resolve(extra, '..')] : []).concat(LOCAL_TOOLS);

  for (var i = 0; i < searchPaths.length; i++) {
    try { return require(require.resolve(name, {paths: [searchPaths[i]]})); } catch (e) { /* fall through */ }
  }
  try {
    return require(name);
  } catch (e) {
    if (e.code !== 'MODULE_NOT_FOUND') throw e;
    throw new Error('Build tool "' + name + '" is not installed. Run `npm run build:tools` once ' +
      '(installs terser, acorn, acorn-walk, magic-string and eslint-scope into scripts/build-tools),\n' +
      'or point NG_BUILD_TOOLS at a node_modules directory that has them, or build with the legacy ' +
      '`--minifier=closure` which only needs Java.');
  }
};
