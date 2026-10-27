# build worker report: minifier replacement, source-level wins, feature-removal profiles

Working copy: `$S/opt/build/angular.js` (default build already run, root `angular.min.js` there is the new one).
Patches: `build.patch` (SAFE, apply with `patch -p2` from the fork root), `build-breaking-profile.patch` (profile mechanism + two profiles, applies on top of build.patch).
Pre-built outputs for inspection: `build-artifacts/` (default, suite, suite-extended min files + maps).
All sizes: bytes of `angular.min.js`; gz = `gzip -9`; br = brotli q11 (window 24). The brief's 61,685 B is `gzip -6` (61,670 here); `gzip -9` of the same file is 61,530. Version string pinned to `1.8.3-local.54c44ffb5` (`NG_VERSION` env override added) so the numbers are comparable.

## 1. Headline

| build | min | gz-9 | br-11 | gz vs baseline | br vs baseline |
|---|---:|---:|---:|---:|---:|
| baseline (Closure 2014 + minerr pass, byte-identical to base copy) | 177,251 | 61,530 | 54,118 | | |
| **terser** (replacement for Closure 2014), SAFE | 177,217 | 60,029 | 53,232 | -1,501 (-2.4%) | -886 (-1.6%) |
| + injected CSS shrink + no jqLite in the style injection, SAFE = **new default** | **177,192** | **60,012** | **53,143** | **-1,518 (-2.5%)** | **-975 (-1.8%)** |
| default + `--aggressive` (unsafe_methods + pure_getters), opt-in | 173,559 | 59,731 | 52,948 | -1,799 | -1,170 |
| profile `suite` (BREAKING, high-confidence unused features) | 161,055 | 54,242 | 48,158 | **-7,288 (-11.8%)** | **-5,960 (-11.0%)** |
| `suite` + `--aggressive` | 157,703 | 53,985 | 47,999 | -7,545 | -6,119 |
| profile `suite-extended` (adds $location, XSRF, CSP interpreter; needs 2 app edits) | 149,046 | 50,714 | 45,166 | **-10,816 (-17.6%)** | **-8,952 (-16.5%)** |
| `suite-extended` + `--aggressive` | 146,122 | 50,454 | 44,992 | -11,076 | -9,126 |

Other effects of the new pipeline: build of the main bundle in ~2 s instead of ~9 s for all targets (Closure took ~1.5 s for the main file alone but needs a JVM), source map 302 KB instead of 471 KB, no Java needed.

Script parse+compile+execute time (fresh page, 60 interleaved runs, median ms; ratio vs Closure build): Closure 2014 6.00 | terser 6.10 (102%) | terser --aggressive 6.00 (100%) | suite 5.50 (92%) | suite --aggressive 5.30 (88%). So the minifier swap is parse-time neutral (within noise) and the profile buys -8..-12% script eval time. Runtime ("bench.html", 500 rows, interleaved, 5 runs, medians): total 915.1 vs 915.8 ms (jQuery) and 819.4 vs 833.8 ms (jqLite): within noise, no per-scenario shift beyond the ±20% jitter of this loaded box.

## 2. Closure `--minerr_pass` (what it does) and its replacement

Read from the jar (`MinerrPass.class` strings + embedded `minErr.js`) and confirmed by diffing outputs:

1. The `function minErr(module, ErrorConstructor)` definition is **replaced** by the tiny production runtime embedded in `ngcompiler.jar` (`vendor/ng-closure-runner` `minErr.js`): message = `"[ns:code] https://errors.angularjs.org/<version>/ns/code?p0=..&p1=.."` with args stringified via `JSON.stringify` (functions via `toString().replace(/ \{[\s\S]*$/,"")`). It has no template text, no `objectMaxDepth`/`urlErrorParamsEnabled` handling (so `angular.errorHandlingConfig()` is a no-op in every minified build, today and after this change).
2. Every call `xxxMinErr('code', 'template {0}', a, b)` whose callee identifier ends in `MinErr` (initialised from `minErr('ns')`), or `minErr('ns')('code', ...)`, has its 2nd argument (the template, string literal or `+` concatenation of literals) deleted; the pair is written to `angular-errors.json` as `{ns:{code:template}}`. Non-static templates are a hard error.

Replacement: `scripts/minerr-pass.js` (acorn + magic-string, text splicing, so a source map of the transform is produced and chained into terser's map) with the runtime in `scripts/minerr-runtime.js` (copied from the jar, so messages stay byte-compatible). **Verified**: the generated errors JSON is `deepStrictEqual` to the Java pass's JSON (25 namespaces, 87 codes), and Closure 2014 fed the pre-passed source (no `--minerr_pass`) produces the same bytes as the Java pipeline except for the licence banner. The kitchen-sink A/B (below) compares 20+ real minErr messages (including `$parse`, `$injector`, `$sce`, `orderBy`, `$http` ...) old vs new: identical.

## 3. Minifier comparison (all fed the same pre-passed source, ES5 input)

| minifier | min | gz-9 | br-11 | time | verdict |
|---|---:|---:|---:|---:|---|
| Closure 2014 (current, Java, SIMPLE ES5) | 177,186 | 61,483 | 54,078 | 2.8 s | baseline |
| **terser 5.51 passes=2 `ecma:2020`** | 177,165 | 60,007 | 53,199 | 2.0 s | **recommended; wired in** |
| terser passes=1 / 3 | 177,483 / 177,165 | 60,094 / 60,009 | 53,327 / 53,136 | | p2 is the knee |
| terser + unsafe_methods + pure_getters | 173,532 | 59,727 | 52,937 | | passes whole suite; opt-in `--aggressive` (-0.5% gz) |
| terser + unsafe_arrows + unsafe_methods | 167,036 | 59,464 | 52,826 | | **fails 14 specs** (see below) -> REJECTED |
| terser + `mangle.properties` `/^\$\$/` | 170,912 | 59,246 | 52,498 | | REJECTED: -1.3% gz but renames 157 `$$` names (would also lose the `$`-prefix that `toJson`/`$$hashKey` rely on; needs a reserved list audited against ui-grid, ngMock, ngAnimate) |
| swc 1.16 minify passes=3 | 175,882 | 59,993 | 53,143 | 0.15 s | same size as terser (native binary dependency; not verified further) -> REJECTED as alternative, not worse |
| esbuild 0.28 `--minify` es2020 | 181,627 | 64,222 | 56,970 | 0.06 s | REJECTED: +7% gz |
| Closure Compiler 2026 (v20261021, native) SIMPLE out=ES2020 | 179,123 | 64,034 | 56,443 | 2.2 s | REJECTED: larger than the 2014 one (its ES-transpile/polyfill-aware passes) |
| Closure 2026 SIMPLE out=ES5 | 196,044 | 68,985 | 60,817 | | REJECTED |
| Closure 2026 ADVANCED | 150,118 | 59,103 | 52,222 | 3.4 s | REJECTED: renames every property (`$watch`, `$digest`, ...), not viable for a public-API library without a full externs/exports file; and even so only -1.5% gz vs terser |

Why terser: pure JS (no JVM, no native binary), maintained, accepts an input source map (chains with the minErr splice map), options are documented per transform, and its output is a gz win over every other candidate that is safe. Gains are modest because the source is ES5 `function` heavy and Closure 2014 was already good; the real size levers are the feature profiles (section 5).

**Correctness of the terser output** (done three ways):
1. `scripts/verify-minified.js`: every `src/**.js` file individually minified with the exact build options (local mangling + full compress, top-level names kept because specs address them) and the whole Karma suite run on it: **6207/6207 (jqLite) and 6212/6212 (jQuery) pass**, for the default options and for `--aggressive`.
2. Per-option results: `unsafe_arrows` -> 14 failures (12 are ngMock `TzDate` `new` on a function that became an arrow, plus `$provide.provider({value: valueFn(...)})` and the `date` filter "declaration exception" spec: `new` on a converted function expression) => REJECTED. `unsafe_methods` passes (opt-in). `pure_getters:true` passes. `booleans_as_integers` would turn strict `=== true` results into 1/0: not tried in the suite, REJECTED by inspection (-148 B gz). `unsafe`, `unsafe_comps`, `unsafe_proto`, `hoist_funs/vars`, `keep_fargs=false`, `inline`, `toplevel`, `side_effects=false`: measured, each within +-30 B gz or negative (see `exp2.js` results in the scratchpad: hoist_vars +790 B gz, join_vars=false +280): nothing else to gain.
3. Whole-bundle browser A/B (old Closure min vs new min), both jQuery and jqLite: `verify/ks-ab.js` kitchen sink (72 API/error-message probes + 6 DOM snapshots: forms, all input types, ng-options, ng-repeat variants, ng-switch/pluralize/include/bind-html, components/transclusion, $http against a local server incl. JSON/404/bad JSON/timeout/cache/jsonp, $q, $timeout/$interval, $location, $parse errors, injector errors, filters, jqLite/jQuery element API): **0 differences** except the intentionally shortened injected `<style>` text. `hotpath/app.html` (5 scenarios): identical DOM, 0 errors. `bench.html`: no page errors. The real `toolbox-suggest-feature` app through the sf-harness server (`verify/run-sf.sh`, 13 steps x 2 visit modes): identical DOM, 0 errors. ui-grid 4.12.7 with the course-development-reports module set (core, pagination, selection, resizeColumns, exporter; sort, filter, page, select, CSV export): identical.

### Does the replacement let `src/` use ES2015+?
Yes. `minerr-pass.js` parses with acorn `ecmaVersion: latest`, terser handles any ES2020 input, Karma runs `src/*.js` directly in Chrome. Spike (`$S/opt/build/es6-spike`, not in the patch): converted a few real functions to arrow functions, default params, spread, a class with getter and template literal, `??`, `?.`, destructuring; built with the new pipeline and ran the suite: 6207/6207 + 6212/6212 and ks-ab 0 diffs. What this changes for the other workers:
* The "src must stay ES5" constraint in the brief is lifted **once this build change is merged** (their copies are still compiled by whatever build runs on them; Closure 2014 cannot parse ES6, so `--minifier=closure` remains ES5-only).
* **Gotcha found**: do not use top-level `const`/`let`/`class` for names that other files also declare. The Karma setup loads each src file as a classic global script, and the module files (ngAnimate etc.) re-declare `var isString = angular.isString`, which makes `const isString` a SyntaxError ("Identifier 'isString' has already been declared") and aborts the run. Top-level helpers should stay `var`/function declarations; `const`/`let`/arrows/classes inside functions are fine.
* ESLint config for `src/` (`.eslintrc-browser.json`) needs `parserOptions.ecmaVersion: 2020` / `env.es2020`, and the "no-var"-style rules (if any) must stay off for the top-level `var` rule above. Not changed by me (file not owned).
* Gain from modernising syntax is small: converting *all* function expressions to arrows (`unsafe_arrows` upper bound) is -263 B gz (-0.4%); and arrows change `new`-ability / `this`, so do it only where behaviour is reviewed. Do not expect a size win from ES2015 syntax; the benefit is readability.
* Angular's implicit-annotation injector reads `fn.toString()`; internal functions must keep explicit `$inject`/array annotation if they become arrows/methods (the suite covers this).

## 4. SAFE changes (in `build.patch`)

| id | change | gain | class |
|---|---|---|---|
| B1 | `scripts/build-lib.js`: terser minifier (default), `--minifier=closure` keeps the legacy Java path, `--no-minify`, `--targets=`, `--out-dir=`, `NG_VERSION=` override; Promise-based main | -1,501 B gz / -886 B br, Java no longer required | SAFE |
| B2 | `scripts/minerr-pass.js` + `minerr-runtime.js` (port of `--minerr_pass`; errors JSON identical to the Java pass) | enables B1 | SAFE |
| B3 | licence banner shrunk to one line (`/*! AngularJS vX | (c) 2010-2020 Google LLC | MIT | http://angularjs.org */`), ascii-only output (no non-ASCII bytes in the min file, same as before) | ~-70 B raw, ~0 gz | SAFE |
| B4 | injected `<style>`: drop `@charset` (meaningless in a `<style>` text), trailing `;`, space before `!important`, and inject with plain DOM (`document.head.prepend(Object.assign(createElement('style'),{textContent}))`) instead of `angular.element(head).prepend(angular.element('<style>').text())` (identical effect, jqLite- and jQuery-independent) | -25 B raw, -17 gz, -89 br | SAFE (the style *text* differs, nothing else) |
| B5 | `pure_funcs` for `valueFn, ngDirective, classDirective, formDirectiveFactory, minErr` so unused `var x = helper()` can be tree-shaken (needed by the profiles; 0 B on the full build) | 0 | SAFE |
| B6 | `package.json`: scripts `build:lib:closure`, devDependencies `terser, acorn, acorn-walk, magic-string`; `scripts/build-tools.js` gives a readable error (and `NG_BUILD_TOOLS=<node_modules>` override) if they are not installed | | SAFE |
| B7 | `scripts/verify-minified.js`: runs the Karma suite against minified sources | verification | SAFE |
| B8 | `--aggressive` flag: unsafe_methods + pure_getters (passes the suite) | -281 B gz / -195 br on default build, -257 / -159 on suite | **BREAKING-low-risk, opt-in** (a method-shorthand function cannot be `new`ed; observable only via `new angular.x.y()`; nothing in the suite or ui-grid does) |

Considered, REJECTED, with numbers:
* error URL / version string shortening (`1.8.3-local.54c44ffb5` appears 3x: banner, `angular.version.full`, error URL once): <30 B gz and the message format is user visible.
* `$sniffer` dead code (Chrome-packaged-app / Boxee / Android<4 `history` checks): ~60 B gz; `$sniffer.android` itself is live (input composition handling on any Android) so only the `history` expression could be simplified; left to the compile worker's file.
* Strip JSDoc from the committed unminified `angular.js` (1.37 MB, `main` of the package via `index.js`): would cut the git/npm payload by ~0.8 MB but it is the only readable source in `node_modules`; no runtime effect. Optional, not done.
* `$$`-property mangling: see table above.
* Locale data: `ngLocale` en-us is only 159 B min; nothing to gain.
* Remaining long identifiers that survive minification are property names (`$modelValue`, `$$element`, `$watch`...), i.e. public API surface; `$$element` 38x is the largest at 342 B raw, nothing safe to do.

## 5. Feature-removal mechanism (`build-breaking-profile.patch`)

```
node scripts/build-lib.js --profile=suite              # scripts/profiles/suite.json, output stays in build/
node scripts/build-lib.js --profile=suite --install    # also copies to the package root
node scripts/build-lib.js --exclude=ngPluralize,form   # ad-hoc list (used for measuring)
node scripts/check-profile.js --profile=suite          # dangling-reference check (also runs inside every profile build)
node scripts/measure-features.js [--profile=suite] [ids]  # per-feature cost table (parallel, ~30 s)
node scripts/profile-overlay.js <dir> --profile=suite  # src/test tree with the profile applied, for Karma
```
* `scripts/profiles/<name>.json` = `{description, exclude:[featureIds]}` (data the lead edits). Feature ids and recipes live in `scripts/features.json` (generated once from `$S/opt/build/gen-features.py`, now hand-editable: 88 recipes + 2 groups `input.dates`, `filters.all-but-core`).
* A recipe is anchored on **literal text / AST names** in `src/` (registration lines in `AngularPublic.js` / `filter.js`, plus `edits` for `$http` JSONP/XSRF, `component()`, CSP interpreter, comment/class/ng-prop/ng-on/multi-element handling in `compile.js`, input-type table entries, `FormController`, `$location` prototype wiring...). Ops: remove line containing text, find/replace, `removeFunction`, `removeProperty`, `removeStatement`, `removeConstructor` (acorn-located). If a source change moves an anchor the build **fails loudly** (checked: all recipes still apply to the compile-worker and scope-worker copies as of now).
* Once nothing registers a feature, terser tree-shakes the implementation; side-effectful top-level statements that keep code alive (`forEach([LocationHtml5Url,...])`, `FormController.prototype = ...`, `addSetValidityMethod(...)`) have explicit recipe edits. (`files:` drops exist as a mechanism but are unused: they left dangling references.)
* **Safety net**: every profile build analyses the un-minified bundle with eslint-scope and fails if the profile leaves a reference to a symbol that no longer exists (`check-profile.js`; this caught `stripHash` in `$browser`, `nullFormCtrl` in ngModel while developing the recipes).
* Specs: `profile-overlay.js` blanks spec files that only test excluded features (`specs` in recipes). Running the Karma suite on the `suite` profile: 6070 specs run, 1061 fail in jqLite mode (1061 in jQuery mode, 6075 run), **all** in the removed features or in modules that depend on removed core services (ngAnimate module tests need `$$jqLite/$$Map/$$forceReflow/$$animateJs`, ngView needs `$anchorScroll`, ngMock needs nothing removed): I classified every failing group by error message (Unknown provider ... for a removed service, date/range/email/url input fallbacks, removed filters, ng-ref/pattern/minlength/ngSwitch/ngList/ngPluralize specs, multi-element `ng-*-start`, ng-prop/ng-on, `ng-keyup/keypress`, `UNSAFE_restoreLegacy...`). No failing spec outside those groups. (Spot-checked the 4 ambiguous ones: ng-ref, email, ng-pattern based specs.) `angular.callbacks` is **not** removable: ngMock's cleanup writes `angular.callbacks.$$counter` (10 B gz, left in).
* Also verified on profile builds: sf-harness real app identical (13/13 steps, both modes) for `suite` and `suite-extended`; ui-grid page identical for both (8/8 checks); `check-profile` OK.

### Evidence for the `suite` profile (from `$S/opt/reports/inventory.json`, high confidence unless noted; caveats from the lead applied: ui-grid needs $http/$q/$interval/$injector/$provide.decorator/ng-transclude/replace:true/$emit/$broadcast/$new/$$observers/angular.version; ng-hide, ng-not-empty, $$hashKey/toJson, $watchGroup and the deprecated `*Whitelist` aliases are untouched; the runtime-`$compile` caveat was lifted by the lead: the 13 pages only compile static templates / the app's own strings)

| removed feature (ids) | gz saved alone | evidence | class |
|---|---:|---|---|
| `input.dates` (date, datetime-local, time, month, week) | 965 | inventory unused[] "input[type=date|datetime-local|time|month|week]": 0 uses in markup, templates, JS strings; ui-grid does not use them | BREAKING |
| `filter.currency/number/json/lowercase/uppercase` | ~165 | inventory: 0 uses in markup/JS; ui-grid's only filter use is `cellFilter:'percentageFilter'` (custom, course-development-reports `main.js:100-194`) and `GridRowColumn` injects `$filter` for it; `date`, `filter`, `orderBy`, `limitTo` are kept | BREAKING (a dynamic `$filter(name)` with a built-in name would fail) |
| `jsonp` | 479 | 0 JSONP uses (one `jsonp-polling` socket.io comment) | BREAKING |
| `$anchorScroll` (+ ng-include `autoscroll`) | 369 | 177 ng-include sites, none with `autoscroll` | BREAKING |
| `$$testability` + `angular.getTestability` | 305 | no references | BREAKING |
| `compile.ngPropNgOn` | 229 | 0 `ng-prop-*`/`ng-on-*` | BREAKING |
| `input.range`, `input.email`, `input.url` | 313 / 108 / 91 | 0 uses (`type=email/url/range` never appear; fall back to a plain text input handler) | BREAKING |
| `compile.multiElement` | 105 | 0 `ng-*-start/-end` | BREAKING |
| `compile.commentDirectives` | 79 | 0 `restrict:'M'` / `<!-- directive: -->` (class directives ARE used: 13 defs, kept) | BREAKING |
| `ngPluralize`, `ngSwitch`(3), `ngList`, `ngRef`, `ngNonBindable`, `ngBindTemplate`, `ngClassEvenOdd` | 297, 219, 97, 141, 15, 85, 13 | all "not used", high | BREAKING |
| `ngPattern` (`pattern`+`ng-pattern`), `ngMinlength` (`minlength`+`ng-minlength`) | 196, 45 | unused; plain `maxlength` IS used with ng-model so `maxlength` directive stays; `ng-required` is the same directive object as `required` (used) so not touched | BREAKING |
| `ngEvents.unused-names` (dblclick, mouseup, mousemove, keyup, keypress, copy, cut, paste) | 28 | not used | BREAKING |
| `$httpParamSerializerJQLike` | 118 | 0 references | BREAKING |
| `$$animateJs`, `$$forceReflow`, `$$jqLite`, `$$Map` | 14, 57, 61, 27 | inventory: core never injects them. **Correction to the inventory note**: they ARE injected by the *separate* ngAnimate module (`$$Map <- $$animateQueue`, `$$jqLite <- $$animation/$$animateCssDriver`), so this cut makes ngAnimate unusable. No page loads ngAnimate (only `angular.min.js` + ui-grid). | BREAKING for any future ngAnimate use |
| `angular.errorHandlingConfig`, `reloadWithDebugInfo`, `UNSAFE_restoreLegacyJqLiteXHTMLReplacement` | 85, 47, 52 | inventory "angular-global ... not used" (errorHandlingConfig is a no-op in minified builds anyway) | BREAKING (only if an app calls them) |
| `css-ngAnimate-anchors` (`.ng-animate-shim`, `.ng-anchor` CSS rules) | 35 | only used by the ngAnimate module | BREAKING (same condition as above) |

Total `suite`: -16,196 B min, -7,288 B gz, -5,960 B br vs baseline (includes the -1.5 kB from the minifier).

`suite-extended` adds (needs a decision or an app edit):

| feature | gz alone | why not in `suite` | app-side fix |
|---|---:|---|---|
| `$location` | 2,003 | inventory high, but 2 pages inject `$locationProvider` at config time and would fail with "Unknown provider": `toolbox-pronunciation-guide/public/sys/js/main.js:343-349` (`$locationProvider.html5Mode({enabled:true, requireBase:false, rewriteLinks:false})`) and `si-studydesk-styles/website/sys/js/main.js:365-368` (injected, unused). Also verify pronunciation-guide does not depend on the URL-change digest `$location` installs (it uses `?query` URLs; inventory says nothing reads `$location`) | delete the two `.config` blocks (the second only needs `$locationProvider` removed from the injection list) |
| `csp-interpreter` (ASTInterpreter) | 1,071 | inventory "medium": `csp()` auto-detects a CSP without `unsafe-eval` and switches parsers; no `ng-csp` attribute or CSP header exists in the apps' own code, but a hosting LMS could send one | none if no CSP is enforced on the hosts; otherwise keep |
| `xsrf` (`$$cookieReader` + header injection) | 233 | inventory "medium": no app/server in scope uses `XSRF-TOKEN` cookies, hosts' servers not visible | none if the APIs do not use XSRF cookies |

### Cost table: every removable piece (gz -9 saved when only that feature is excluded; "in profile" says where it is cut)
Measured by `scripts/measure-features.js` (one full build per row). Some rows are structurally required by other features (e.g. `$sce`, `$cacheFactory`, `ngRepeat`, `ngIf`, `$interval` (ui-grid), `$log`, `select`/`ngOptions` pair): the number is the byte cost, not a recommendation; removing them breaks callers (the dangling check only covers *code* references, not DI-by-string). Brotli deltas of tiny rows are noisy (+-100 B). Grouped rows not shown above: `input.dates` (all five date types) 2,729 min / 965 gz / 894 br; `filters.all-but-core` (currency, date, number, json, limitTo, filter) 4,807 / 2,036 / 1,805.

| feature | what | min B | gz B | br B | in profile |
|---|---|---:|---:|---:|---|
| `$location` | $location service ($anchorScroll, ngRoute etc. inject it; $browser URL machinery stays) | 5681 | 2003 | 1749 | suite-extended |
| `ngOptions` | ng-options | 4268 | 1322 | 1128 |  |
| `select` | select directive (non-ngOptions) + option directive (ngOptions also needs selectDirective/optionDirective; remove select only if no <select ng-model>) | 4404 | 1132 | 975 |  |
| `csp-interpreter` | CSP (ng-csp / no-unsafe-eval) expression interpreter in $parse (any page under a CSP without unsafe-eval (needs ng-csp) would fail to evaluate expressions) | 5410 | 1072 | 950 | suite-extended |
| `$sce` | $sce/$sceDelegate (needed by interpolate, ngInclude, ngBindHtml) | 3028 | 879 | 746 |  |
| `ngRepeat` | ng-repeat | 2000 | 822 | 687 |  |
| `filter.orderBy` | orderBy filter | 2120 | 746 | 672 |  |
| `form` | form / ng-form directive + FormController (ngModel requires ^?form (optional); form validity (ng-submit gating, $valid) lost) | 2895 | 656 | 549 |  |
| `filter.date` | date filter | 1439 | 652 | 627 |  |
| `jsonp` | JSONP: $http.jsonp, JSONP url sanitising, <script> transport in $httpBackend, $jsonpCallbacks ($http({method:"JSONP"}) / $http.jsonp() would then POST/GET as a normal XHR with method JSONP (invalid)) | 1377 | 479 | 401 | suite |
| `ngInclude` | ng-include (+ fill-content) | 1135 | 392 | 320 |  |
| `$cacheFactory` | $cacheFactory (also backs $templateCache and $http cache) (removes $templateCache too: breaks $templateRequest/ngInclude/templateUrl) | 1046 | 388 | 333 |  |
| `$anchorScroll` | $anchorScroll service + ng-include autoscroll (ng-include autoscroll attribute and $anchorScroll()/yOffset/$location hash scrolling lost) | 917 | 369 | 272 | suite |
| `filter.filter` | filter filter | 1088 | 363 | 308 |  |
| `ngSwitch` | ng-switch / when / default | 1168 | 334 | 243 | suite |
| `input.range` | <input type=range> | 1139 | 312 | 248 | suite |
| `$interval` | $interval + $$intervalFactory ($$intervalFactory also used by $timeout? (measured)) | 904 | 310 | 241 |  |
| `$$testability` | $$testability + angular.getTestability | 831 | 304 | 210 | suite |
| `ngPluralize` | ng-pluralize directive | 670 | 298 | 239 | suite |
| `xsrf` | XSRF header injection ($$cookieReader + xsrfTrustedOrigins check) in $http (same-origin POSTs would no longer send X-XSRF-TOKEN from an XSRF-TOKEN cookie) | 620 | 232 | 147 | suite-extended |
| `compile.ngPropNgOn` | ng-prop-* / ng-on-* (addPropertyDirective / addEventDirective) | 596 | 228 | 139 | suite |
| `ngPattern` | pattern / ng-pattern validator | 648 | 197 | 149 | suite |
| `ngTransclude` | ng-transclude | 545 | 190 | 176 |  |
| `component` | $compileProvider.component() / module.component() (module.component(...) calls $compileProvider.component at config time -> throws if used) | 610 | 178 | 125 |  |
| `$animateCss` | $animateCss (core, CSS-less stub) | 463 | 162 | 152 |  |
| `ngRef` | ng-ref / ng-ref-read | 469 | 152 | 59 | suite |
| `input.number` | <input type=number> | 675 | 148 | 112 |  |
| `ngEventDirectives` | ALL ng-click/ng-dblclick/ng-submit/ng-focus... event directives (each additional event name costs only ~8 B gz; this row is the shared machinery) | 361 | 136 | 78 |  |
| `ngIf` | ng-if | 445 | 130 | 95 |  |
| `filter.limitTo` | limitTo filter | 320 | 121 | 14 |  |
| `input.checkbox` | <input type=checkbox> | 475 | 119 | 107 |  |
| `input.week` | <input type=week> | 340 | 118 | 125 |  |
| `$httpParamSerializerJQLike` | $httpParamSerializerJQLike | 344 | 117 | 85 | suite |
| `ngModelOptions` | ng-model-options (ngModel reads ngModelOptions via require: ? so stays functional) | 386 | 116 | 61 |  |
| `$log` | $log service (default $exceptionHandler uses $log) | 359 | 114 | 100 |  |
| `hiddenInputCache` | hidden-input browser-cache workaround directive | 400 | 109 | 81 |  |
| `input.email` | <input type=email> | 322 | 109 | 42 | suite |
| `compile.multiElement` | ng-repeat-start/-end style multi-element directives (-start/-end attrs) (ng-repeat-start/-end stop working) | 241 | 105 | 36 | suite |
| `ngList` | ng-list directive | 365 | 98 | 98 | suite |
| `compile.classDirectives` | restrict:"C" class directives (class="my-dir: x") (suite uses 13 restrict:"C" directives (see inventory)) | 193 | 97 | 60 |  |
| `ngShowHide` | ng-show / ng-hide | 400 | 93 | 7 |  |
| `ngSrcHref` | ng-src / ng-srcset / ng-href | 348 | 92 | 50 |  |
| `input.url` | <input type=url> | 247 | 91 | 13 | suite |
| `filter.currency` | currency filter | 276 | 89 | 66 | suite |
| `angular.errorHandlingConfig` | angular.errorHandlingConfig (no-op in production builds: minErr is replaced) | 298 | 87 | 89 | suite |
| `ngBindTemplate` | ng-bind-template | 289 | 85 | 78 | suite |
| `ngBindHtml` | ng-bind-html | 329 | 85 | 86 |  |
| `ngValue` | ng-value | 299 | 84 | 82 |  |
| `compile.commentDirectives` | restrict:"M" comment directives (<!-- directive: x -->) ($compileProvider.commentDirectivesEnabled(true) becomes a no-op) | 199 | 79 | 4 | suite |
| `input.radio` | <input type=radio> | 303 | 76 | 27 |  |
| `$$isDocumentHidden` | $$isDocumentHidden (used by $$rAF/animate) | 250 | 74 | 75 |  |
| `htmlAnchor` | <a href=""> preventDefault directive | 272 | 72 | 45 |  |
| `ngRequired` | required / ng-required validator | 335 | 67 | 80 |  |
| `ngBooleanAttrs` | ng-checked/ng-disabled/ng-readonly/ng-selected/ng-open/ng-multiple... boolean attr aliases | 245 | 64 | 58 |  |
| `$$jqLite` | $$jqLite service | 234 | 61 | 118 | suite |
| `$$forceReflow` | $$forceReflow | 164 | 56 | 14 | suite |
| `ngStyle` | ng-style | 134 | 51 | 21 |  |
| `angular.UNSAFE_restoreLegacyJqLiteXHTMLReplacement` | UNSAFE_restoreLegacyJqLiteXHTMLReplacement | 89 | 51 | 74 | suite |
| `ngMaxlength` | maxlength / ng-maxlength validator | 323 | 48 | 30 |  |
| `script` | <script type=text/ng-template> template-cache directive | 168 | 47 | 28 |  |
| `angular.reloadWithDebugInfo` | angular.reloadWithDebugInfo() | 95 | 47 | 3 | suite |
| `ngMinlength` | minlength / ng-minlength validator | 326 | 44 | 26 | suite |
| `ngChange` | ng-change | 136 | 35 | 25 |  |
| `css-ngAnimate-anchors` | CSS rules .ng-animate-shim / .ng-anchor (only used by the separate ngAnimate module) | 64 | 35 | 93 | suite |
| `ngCloak` | ng-cloak directive (the CSS rule stays) | 94 | 34 | 61 |  |
| `filter.number` | number filter | 168 | 34 | 8 | suite |
| `ngClassEvenOdd` | ng-class-even / ng-class-odd | 60 | 32 | 44 | suite |
| `input.datetime-local` | <input type=datetime-local> | 181 | 32 | 74 |  |
| `ngInit` | ng-init | 99 | 31 | 55 |  |
| `ngController` | ng-controller directive (ngController attr; $controller service stays (needed by $compile controllers)) | 91 | 31 | 27 |  |
| `ngEvents.unused-names` | ng-dblclick, ng-mouseup, ng-mousemove, ng-keyup, ng-keypress, ng-copy, ng-cut, ng-paste | 57 | 28 | 23 | suite |
| `ngNonBindable` | ng-non-bindable | 51 | 26 | -50 | suite |
| `filter.json` | json filter | 76 | 26 | 16 | suite |
| `$$Map` | $$Map service | 60 | 26 | -9 | suite |
| `input.time` | <input type=time> | 109 | 24 | 16 |  |
| `input.month` | <input type=month> | 75 | 24 | 7 |  |
| `input.date` | <input type=date> | 90 | 23 | 45 |  |
| `angular.merge` | angular.merge | 60 | 19 | 33 |  |
| `filter.uppercase` | uppercase filter | 26 | 14 | -37 | suite |
| `$$animateJs` | $$animateJs (core no-op JS animation service) | 42 | 14 | 9 | suite |
| `filter.lowercase` | lowercase filter | 26 | 12 | 11 | suite |
| `angular.callbacks` | angular.callbacks (JSONP counter) | 24 | 10 | 25 |  |
| `angular.fromJson` | angular.fromJson | 36 | 8 | 12 |  |
| `angular.equals` | angular.equals | 10 | 7 | -75 |  |
| `angular.isDate` | angular.isDate | 9 | 6 | -23 |  |
| `angular.copy` | angular.copy | 8 | 5 | -19 |  |
| `angular.injector` | angular.injector (standalone injector) | 12 | 5 | -47 |  |
| `angular.bind` | angular.bind | 8 | 4 | -47 |  |


Not itemised (no cheap anchor, or owned by other workers): jqLite method table (jquery worker), `$rootScope` methods (`$watchGroup` is used by media-catalogue and by interpolation), `$parse` literal/one-time machinery, `ngModel` internals, `$animate` core, `$sce` sub-parts, `ngEvents` per-event cost (~8 B gz each; the shared machinery row `ngEventDirectives` is 135 B gz).

## 6. Consumption path (`npm install github:Shane-Gadsby/angular.js`)
* `package.json` `files`: `index.js, angular.js, angular.min.js, angular.min.js.map, angular-csp.css`; no `install`/`prepare`/`postinstall` script (the "build on install" attempts in `e6078148d`/`0d75c3987` were reverted by `63a88234c`, which committed the built root artifacts). So an app install just copies the committed files: **my changes do not touch that path as long as the root `angular.min.js`/`.map` (and `angular.js`) are rebuilt and committed** (`node scripts/build-lib.js` copies them to the root as before; a profile/partial/`--out-dir` build deliberately does not, unless `--install`).
* The new build tools are devDependencies only; nothing runs at install time. To build: `npm install --no-save terser acorn acorn-walk magic-string eslint-scope` in the fork (the fork's `node_modules` is empty and its huge devDependency list is not meant to be installed), or `--minifier=closure` with Java as before.
* Committed map is now 302 KB (was 471 KB); `//# sourceMappingURL=angular.min.js.map` is unchanged; map `sources` is `angular.js` (the concatenated bundle, as before).
* The apps load only `/node_modules/angular/angular.min.js` (49 script tags) plus ui-grid on 2 pages; `angular-animate` etc. are never loaded, so the module bundles (still built, now by terser, and not shipped) are irrelevant to consumers.
* Do **not** commit a profile build over the root files without the app-side decisions above; recommended flow: merge SAFE patches -> rebuild default -> separately decide each BREAKING profile item.

## 7. Findings table

| id | title | class | measured gain |
|---|---|---|---|
| B1/B2 | terser + acorn minErr pass replace Closure 2014 / Java | SAFE | -1,501 B gz, -886 br, no JVM |
| B3-B7 | banner, injected CSS/style, pure_funcs, tooling | SAFE | -17 gz more, enables profiles |
| B8 | `--aggressive` (unsafe_methods, pure_getters) | BREAKING (low) opt-in | -281 B gz |
| M1 | terser unsafe_arrows | REJECTED | -263 gz but 14 spec failures (`new` on arrow) |
| M2 | `mangle.properties` for `$$` | REJECTED | -763 gz, breaks `$` prefix contract, large audit |
| M3 | Closure 2026 SIMPLE / ADVANCED, esbuild, swc | REJECTED | +4% gz (Closure 2026 SIMPLE, esbuild) / unusable (ADVANCED) / equal (swc) |
| M4 | `booleans_as_integers` | REJECTED | -148 gz, changes strict-boolean results |
| F1 | profile `suite` | BREAKING (provisional lifted) | -5.8 kB gz (-9.6%) vs new default; -7.3 kB vs old baseline; -8..-12% script eval |
| F2 | profile `suite-extended` | BREAKING | additional -3.5 kB gz ($location 2.0k, CSP interpreter 1.1k, XSRF 0.2k) |
| F3 | ES2015+ in `src/` possible after merge | info | see section 3 |

## 8. Test results
* Karma on minified sources (`verify-minified.js`): default 6207/6207 jqLite, 6212/6212 jQuery; `--aggressive` same; unminified-source suite is unchanged by my patches (build files only).
* ES2020 spike: 6207/6207 + 6212/6212.
* Profile `suite` / `suite-extended`: only specs of removed features (and of the ngAnimate/ngRoute modules that depend on removed core services) fail: 1061 / 1148 of ~6070 / 5873 run.
* Browser A/B old vs new (jqLite and jQuery): ks-ab 0 behavioural diffs; hp-ab identical; sf harness identical; ui-grid identical; bench no errors.
* A generic "load all 46 pages statically" smoke (`verify/pages-ab.js`) is included but weak: without backends the pages stop before rendering (all 46: identical console errors for old/new/suite).

## 9. Files
`scripts/build-lib.js`, `scripts/minerr-pass.js`, `scripts/minerr-runtime.js`, `scripts/build-tools.js`, `scripts/verify-minified.js`, `package.json` (SAFE); `scripts/profiles.js`, `scripts/features.json`, `scripts/profiles/{suite,suite-extended}.json`, `scripts/check-profile.js`, `scripts/measure-features.js`, `scripts/profile-overlay.js` and the profile hooks in `build-lib.js` (profile patch). Scratch tooling: `$S/opt/build/verify/*` (ks.html, ks-ab.js, hp-ab.js, grid-ab.js, run-sf.sh, parse-time.js, pages-ab.js), `$S/opt/build/exp*.js`, `$S/opt/build-tools/` (installed tools).
