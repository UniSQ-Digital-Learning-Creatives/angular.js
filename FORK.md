# This fork of AngularJS 1.8.3

`github:Shane-Gadsby/angular.js` is AngularJS 1.8.3 (upstream ended support in January 2022), tuned
for one consumer: the StudyDesk Toolbox apps suite (`../../apps`). It targets **2020+ browsers only**
(current Chrome, Edge, Firefox, Safari; no IE or legacy Edge). Every change here was measured against
what the suite's 46 live pages actually use.

The suite does not install this package from npm. **The shipped file is
`si-manager/public/angular/angular.min.js`** (plus `.map`), and every app loads it as
`/angular/angular.min.js`.

## Quick reference

```sh
npm run build:tools         # once: installs terser, acorn, acorn-walk, magic-string, eslint-scope into scripts/build-tools/
npm run build:suite         # the shipped build (suite profile) -> build/ and the package root
npm run release:si-manager  # build:suite, then copy angular.min.js(.map) into ../../apps/si-manager/public/angular/
                            #   (SI_MANAGER=/path/to/si-manager to point elsewhere; then deploy si-manager)
npm run build:lib           # full build with every feature (no profile); what the test suite describes.
                            #   Also overwrites the package-root angular*.js - rerun build:suite before releasing
npm run build:lib:closure   # the old 2014 Closure Compiler build (needs Java), kept as a fallback
npm run check:profile       # dangling-reference check of the suite profile
npm run measure:features    # bytes each removable feature costs (min + gzip)
node scripts/verify-minified.js   # Karma against the minified output
```

| | upstream 1.8.3 | this fork (full build) | this fork (shipped `suite` build) |
|---|---|---|---|
| `angular.min.js` | 177 KB / 61.5 KB gz | about 178 KB / 60 KB gz | **150 KB / 51.1 KB gz** |

## How it differs from upstream

### Behaviour that changed (read this before using the fork anywhere else)

- **No jQuery binding.** `angular.element` and every directive's `element`/`$element` are always
  jqLite, even if jQuery is on the page.
  - `bindJQuery`, `ng-jq`, the jQuery `cleanData` patch and jQuery fallbacks are gone.
  - jqLite's `find()` accepts any CSS selector (it uses `querySelectorAll`).
  - Events reaching `element.on(...)` handlers are native, so there is no `originalEvent`, and a
    jQuery `.trigger('change')` won't reach ng-model.
  - jqLite has no `offset`/`width`/`closest`/`each`/plugins.
- **Shipped build only (the `suite` profile, `scripts/profiles/suite.json`):** these are compiled out.
  Taking an entry out of the profile puts the feature back.
  - **Directives:** `ng-switch`, `ng-pluralize`, `ng-list`, `ng-non-bindable`, `ng-bind-template`,
    `ng-class-even/odd`, `ng-ref`, `ng-pattern`/`pattern`, `ng-minlength`/`minlength`.
  - **Events:** `ng-dblclick`, `ng-mouseup`, `ng-mousemove`, `ng-keyup`, `ng-keypress`, `ng-copy`,
    `ng-cut`, `ng-paste`.
  - **`$compile` features:** `ng-prop-*`/`ng-on-*`, comment directives, and multi-element
    `-start`/`-end` directives.
  - **Input types:** date, time, datetime-local, week, month, range, email, url.
  - **Filters:** `currency`, `number`, `json`, `lowercase`, `uppercase`.
  - **`$http`:** JSONP, `$httpParamSerializerJQLike`, and the XSRF cookie header.
  - **Services:** `$location` and `$locationProvider`; `$anchorScroll` and ng-include `autoscroll`;
    `$$testability`/`angular.getTestability`; and the core helpers only the separate ngAnimate module
    used (`$$animateJs`, `$$forceReflow`, `$$jqLite`, `$$Map`, and the `.ng-animate-shim`/`.ng-anchor`
    CSS). As a result, `angular-animate.js` can't be loaded on top of it.
  - **The CSP expression interpreter:** a page served under a CSP without `unsafe-eval` won't evaluate
    expressions.
  - **`angular.*` helpers:** `reloadWithDebugInfo`, `errorHandlingConfig`,
    `UNSAFE_restoreLegacyJqLiteXHTMLReplacement`.
- **Filter pipelines in `$watchCollection` / ng-repeat are memoised.**
  - `x in list | filter:q | orderBy:'f'` re-runs only when the list reference, its length/elements
    (shallow), or a filter argument changes. Upstream re-ran it on every digest.
  - Editing a field *inside* an item no longer re-sorts or re-filters by itself; replace the array
    (`list = list.slice()`) after such an edit.
- **ng-include:**
  - Gets `$anchorScroll` lazily, so `$location` isn't instantiated on include pages. An app that
    relied on `$location`'s digest after a hash change has to digest itself.
  - Compiles a template included more than once only once, then clones and links it. The cache is
    capped at 100 templates, and templates containing `<script>` are skipped.
- **`$templateRequest`** answers already-cached templates without going through `$http`, so
  interceptors and `pendingRequests` don't see repeat loads.
- **IE-only code is removed:**
  - `msie` and the IE9 wrap map, the `iequirks` `$sce` check and IE/IPv6 url branches;
  - the sniffer's IE paths and the input `keydown` fallback;
  - `getBaseUrl` uses `document.baseURI`.

### Speed (all behaviour-neutral for the suite)

- **Scope tree bookkeeping** (watchers, child links, listeners, counts) lives on one per-scope
  `DigestNode` with a single hidden class.
  - `$digest`, `$broadcast`, `$emit`, `$on` and watcher counting walk those nodes, and the old `$$`
    names are accessors.
  - Idle digests take about half the time on the suite's real templates, and scope create/destroy
    runs at about 0.43x.
- **`angular.equals`** no longer builds a key map per object (about 2x faster). **`angular.copy`**
  tracks visited objects in a `Map` instead of `indexOf` (no more O(n²) on big graphs).
- **jqLite:** `cleanData` is one pass with no per-type `removeEventListener`. `inheritedData` has a
  fast path. `triggerHandler` and the event wrappers no longer reallocate closures.
- **`$animate`:** native `domInsert`, a lazy completed runner, and class diffs read
  `getAttribute('class')`.
- **`orderBy`:** a default-comparator fast path with precomputed keys. **`filter`:** a hoisted
  comparator.
- **Smaller items:** native `Map` instead of the shim; a cheaper url check per digest in `$browser`;
  `$emit`'s no-listener early return; hoisted event objects; `$watchCollection` uses `Object.keys`;
  `ngClass` `toClassString`; `$http` interceptor arrays hoisted; and the compile `directiveNormalize`
  skip.

### Build

- **Minifier:** terser 5 with ES2020 output replaces the 2014 Closure Compiler, so Java isn't
  needed. Closure's minErr pass (error text out of the bundle, codes into `build/*-errors.json`) is
  reimplemented as an acorn pre-pass (`scripts/minerr-pass.js`) with identical output.
- **`src/` may use ES2015+ syntax.** Keep top-level helpers as `var`/`function`: Karma loads the files
  as globals, and a top-level `let`/`const`/`class` collides with the module files' redeclarations.
- **Profiles:**
  - `scripts/profiles/*.json` lists feature ids to exclude, and `scripts/features.json` holds the
    recipe for each. Recipes are anchored on literal source text or AST names, so a source change
    that moves an anchor fails the build loudly; update the recipe.
  - Every profile build runs an eslint-scope dangling-reference check.
  - Output stays in `build/` unless `--install` is passed.
- **The full build** (`build:lib`) still has every feature, and it is what the Karma suite describes.

## Tests

The Karma + Jasmine harness used for this work isn't part of the repo. Any Karma 6 + Jasmine config
that loads `angularFiles.mergeFilesFor('karma')` (jqLite) or `('karmaJquery')` (jQuery on the page)
works. Exclude `test/**/* (2).js` if a sync tool has left conflict copies.
- **Last result:** 6242/6242 (jqLite), 6236/6236 (jQuery present), Chrome headless.
- **jQuery-mode note:** jQuery mode now means "jQuery is loaded on the page but Angular ignores it",
  which is how most suite pages run.
- **What changed in the specs:**
  - Retired with the jQuery binding: `test/jQueryPatchSpec.js` and the jQuery-only specs in animate,
    ngInclude and input.
  - Added: new specs for the fast paths.

## Checking a change against the real apps

`optimisation-review/suite-ab/` serves every suite page with fixture backends and runs any two builds
side by side in headless Chrome.
- It includes scripted interactions, DOM and error diffs, and timing.
- `compare-runs.py` diffs two runs, e.g. a frozen copy of the apps (`SUITE_APPS=`) before an app edit
  against the live apps after it.
- Always pass `--real-time`.
- See its README, and `optimisation-review/DECISIONS.md` for how this round was verified, every
  decision, the app-side changes and the future options.

## History

- **Before 2026-10-24:** the committed `perf(...)` changes in `git log` (rootScope, jqLite, filter,
  orderBy, `$http`, compile), plus the standalone Node build script (`scripts/build-lib.js`).
- **2026-10-24, round 1:** IE removal, native `Map`, the `$animate`/orderBy/url fast paths.
- **2026-10-25, round 2:** everything else above, from a usage inventory of the suite. Details,
  measurements and per-worker reports are in `optimisation-review/`.
