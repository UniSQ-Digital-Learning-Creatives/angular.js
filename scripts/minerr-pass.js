'use strict';

/**
 * Pure-Node port of ng-closure-runner's `--minerr_pass` (vendor/ng-closure-runner, MinerrPass.java).
 *
 * What the Java pass does (and so what this does, byte-for-byte equivalent in effect):
 *  1. The `function minErr(module, ErrorConstructor) {...}` definition in the bundle is replaced by the tiny
 *     runtime in `minerr-runtime.js` (no message template, no objectMaxDepth / urlErrorParamsEnabled handling:
 *     the production message is "[ns:code] https://errors.angularjs.org/<version>/ns/code?p0=..&p1=..").
 *  2. Every call `xxxMinErr('code', 'template {0}', a, b)` (callee is an identifier ending in `MinErr`
 *     that was initialised from `minErr('ns')`, or a direct `minErr('ns')('code', 'template', ...)`) has its
 *     template argument removed -> `xxxMinErr('code', a, b)`, and the template text is written to
 *     <errors.json> as { ns: { code: template } } so the docs site / devs can still look it up.
 *
 * It works by splicing the source text (magic-string) so that a source map for the transform is produced and
 * can be chained in front of the minifier's map. Parsing uses acorn.
 *
 * transform(code, {url, filename}) -> {code, map, errors}
 */

var fs = require('fs');
var path = require('path');
var tools = require('./build-tools');
var acorn = tools.require('acorn');
var walk = tools.require('acorn-walk');
var MagicString = tools.require('magic-string');
MagicString = MagicString.default || MagicString;

var RUNTIME = fs.readFileSync(path.join(__dirname, 'minerr-runtime.js'), 'utf8');

function staticString(node, src) {
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'BinaryExpression' && node.operator === '+') {
    var l = staticString(node.left, src), r = staticString(node.right, src);
    if (l !== null && r !== null) return l + r;
  }
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) return node.quasis[0].value.cooked;
  return null;
}

function isMinErrDirectCall(node) {
  return node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'minErr' &&
    node.arguments.length >= 1 && node.arguments[0].type === 'Literal';
}

exports.transform = function(code, options) {
  options = options || {};
  var url = options.url;
  var ast = acorn.parse(code, {ecmaVersion: 'latest', sourceType: 'script', ranges: true});
  var ms = new MagicString(code, {filename: options.filename});
  var errors = {};
  var instanceNs = {};   // identifier name -> namespace
  var minErrDef = null;

  // pass 1: minErr definition + instances (`var fooMinErr = minErr('foo')`, also chained assignments)
  walk.full(ast, function(node) {
    if (node.type === 'FunctionDeclaration' && node.id.name === 'minErr') {
      if (minErrDef) throw new Error('minErr is defined in multiple locations');
      minErrDef = node;
    }
  });
  function noteInstance(nameNode, init) {
    // unwrap `a = b = minErr('ns')`
    var names = [];
    var cur = init;
    while (cur && cur.type === 'AssignmentExpression') {
      if (cur.left.type === 'Identifier') names.push(cur.left.name);
      cur = cur.right;
    }
    if (cur && isMinErrDirectCall(cur)) {
      if (nameNode && nameNode.type === 'Identifier') names.push(nameNode.name);
      names.forEach(function(n) {
        if (/MinErr$/.test(n)) instanceNs[n] = cur.arguments[0].value;
      });
    }
  }
  walk.full(ast, function(node) {
    if (node.type === 'VariableDeclarator' && node.init) noteInstance(node.id, node.init);
    else if (node.type === 'AssignmentExpression') noteInstance(node.left, node.right);
  });

  // pass 2: strip template args
  walk.full(ast, function(node) {
    if (node.type !== 'CallExpression') return;
    var ns;
    if (node.callee.type === 'Identifier' && /MinErr$/.test(node.callee.name)) {
      ns = instanceNs[node.callee.name];
      if (ns === undefined) return;   // not a minErr instance (e.g. a local helper); Java pass warns, leaves alone
    } else if (isMinErrDirectCall(node.callee)) {
      ns = node.callee.arguments[0].value;
    } else {
      return;
    }
    if (node.arguments.length < 2) return;
    var codeNode = node.arguments[0], tplNode = node.arguments[1];
    var codeStr = staticString(codeNode, code), tpl = staticString(tplNode, code);
    if (codeStr === null || tpl === null) {
      throw new Error('minerr: non-static code/template at offset ' + node.start + ': ' + code.slice(node.start, node.end).slice(0, 120));
    }
    (errors[ns] = errors[ns] || {})[codeStr] = tpl;
    ms.remove(codeNode.end, tplNode.end);   // ", 'template'"
  });

  // (module bundles such as angular-route.js use angular.$$minErr and have no definition of their own)
  if (minErrDef) {
    var def = RUNTIME.replace(/MINERR_URL/g, url).replace(/MINERR_SEPARATOR/g, '/').trim();
    ms.overwrite(minErrDef.start, minErrDef.end, def);
  }

  // deterministic errors.json
  var sorted = {};
  Object.keys(errors).sort().forEach(function(ns) {
    sorted[ns] = {};
    Object.keys(errors[ns]).sort().forEach(function(c) { sorted[ns][c] = errors[ns][c]; });
  });
  return {code: ms.toString(), map: ms.generateMap({hires: 'boundary', includeContent: false, source: options.filename, file: options.filename}), errors: sorted};
};
