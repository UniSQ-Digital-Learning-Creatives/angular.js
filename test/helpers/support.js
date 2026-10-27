'use strict';

// IE support was removed from the library. Specs that still branch on it see `undefined`,
// so their IE-only paths stay skipped.
// eslint-disable-next-line no-unused-vars
var msie;

var supportTests = {
  classes: '/^class\\b/.test((class C {}).toString())',
  fatArrows: 'a => a',
  shorthandMethods: '({ fn(x) { return; } })'
};

var support = {};

for (var prop in supportTests) {
  if (supportTests.hasOwnProperty(prop)) {
    try {
      // eslint-disable-next-line no-eval
      support[prop] = !!eval(supportTests[prop]);
    } catch (e) {
      support[prop] = false;
    }
  }
}
