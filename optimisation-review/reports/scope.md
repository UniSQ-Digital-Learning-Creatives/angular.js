# scope worker report: digest / watch / expression / utility layer

Working copy: `$S/opt/scope/angular.js`. SAFE patch: `$S/opt/reports/scope.patch` (src/Angular.js, src/ng/rootScope.js + specs; apply with `patch -p1` from the fork root, diff made with `diff -ruN base/angular.js scope/angular.js`).
BREAKING patches (each independent, paths are `a/` `b/`, apply with `patch -p1` from the fork root): `scope-breaking-filter-memo.patch`, `scope-breaking-applyasync-microtask.patch`.
Benches: `$S/opt/scope-bench/` (README.md there says how to rerun).

## Summary

The big finding: in a real nested-scope page the digest was dominated by **megamorphic property loads on scope objects**, not by watcher evaluation. Every scope that has children (an ng-repeat row with an ng-if/ng-include/nested repeat in it, which is most rows in this suite) is the prototype of its children, so it gets its own hidden class (`ChildScope` is created per parent). The digest's traversal read `$$watchers/$$suspended/$$watchersCount/$$childHead/$$nextSibling/$parent` off those scopes, about 8 loads per scope visit, all megamorphic. Moving the tree bookkeeping (watchers, tree links, suspended flag, watcher count, listeners, listener counts) into a per-scope `DigestNode` object (all nodes share one hidden class), and walking the nodes in `$digest`/`$broadcast`/`$emit`/`$on`/`incrementWatchersCount`, made an idle digest about 2x faster on the real-template pages, made scope creation/destroy 2x cheaper on its own, and shrank each scope object. The old `$$` names stay readable/writable as accessors on `Scope.prototype`, so ngMock, the spec suite and any third party reading `$$childHead`, `$$watchers`, `$$watchersCount` keep working (ui-grid only touches `$$phase`; no app touches any of them).

Second: `angular.equals` (used for every deep watch every digest) was allocation heavy (`createMap` + a key set per object, two `toString.call` per object); rewritten, about 1.6x faster.

Everything SAFE is applied; tests green in both modes plus Firefox. Cost: angular.min.js +743 B (177,251 -> 177,994), gzip +174 B (61,545 -> 61,719 measured on the base min in the tree).

## Findings

Ratios are new/base, interleaved A/B in one browser process, fresh page per run, medians of 5-15 runs, minified builds unless noted (`libs/basemin.js` vs `libs/s6min.js`). The machine is loaded; treat 5% as noise.

| id | title | class | measured gain | bytes | files |
|---|---|---|---|---|---|
| S1 | DigestNode: digest, broadcast, emit, $on, watcher counting walk monomorphic nodes instead of scopes | SAFE | idle digest gd.html (real group-discussion rows, 10k watchers) **0.51x**, mc.html (media-catalogue gallery, 7k watchers) **0.44x**, deep.html 0.52x (with S2), synthetic nested tree 0.12x-0.19x, flat tree unchanged (1.0x). `$applyAsync` storm + digest 0.49x / 0.48x, toggling one item 0.53x | + ~500 B min | rootScope.js |
| S1b | Scope objects slimmer: tree/listener/suspended state lives on the node, ChildScope ctor sets 2 own props instead of 10 | SAFE | scope build+destroy churn (1500 scopes) **0.43x**; gd create 0.85x, mc create 0.80x, mc append page 0.66x, tb create 0.93x, list.html create 0.89x. jQuery and jqLite alike | included | rootScope.js |
| S2 | `equals`: no per-object key map (cursor over key list), prototype test instead of 2x `toString.call` for plain objects, inline `===` per property | SAFE | node microbench: 2.1-2.4x on 3-50 object graphs; in page deep watchers (editor `$root.data`, parent `newIlar`, 200 hotspots, 300 overlayIcons tiles) idle digest 0.52x-0.57x together with S1, editing 0.56-0.64x | + ~150 B | Angular.js |
| S3 | `copy`: `Map` instead of `indexOf` over two arrays (O(n^2) on big graphs), helpers hoisted out of the per-call closure, `$$hashKey` skipped instead of copy-then-delete, no `toString` dispatch for arrays/plain objects | SAFE | node microbench 0.75-0.98x on 3-50 object graphs, 0.5-0.64x on a 500-object graph (quadratic -> linear). Runs only when a deep watch fires, so small in the pages | + ~60 B | Angular.js |
| R1 | local/closure index instead of `watchers.$$digestWatchIndex` in the digest loop | REJECTED | 1.00x-1.18x (not faster, maybe slower) | | |
| R2 | primitive fast path in `expressionInputWatch` (skip `expressionInputDirtyCheck` when unchanged primitive) | REJECTED | 0.96x-1.00x, V8 already inlines it | | |
| R3 | filter: cache lowercased expected string between comparisons | REJECTED | filter_str 0.95-1.00x, one outlier 0.76x, within noise | | |
| R4 | Object.create / `{__proto__: parent}` literal / setPrototypeOf instead of per-parent ChildScope class | REJECTED | create 1.7x faster for the literal form but property reads 2.4x slower; Object.create no gain | | |
| R5 | `equals` via `Object.keys` | REJECTED | 1.2-1.4x slower than the for-in version | | |
| R6 | skip `$$checkUrlChange` / `$location` / `$http` work when unused (coordinator question) | REJECTED | see below: nothing worth skipping at digest time | | |
| R7 | CSP (interpreter) `$parse` or tiering to avoid `new Function` at startup | REJECTED as default | cold parse of the suite's 1,810 real expressions 82 ms -> 32 ms with ng-csp, but steady-state digest 2x slower (gd idleDigest 0.62 -> 1.20 ms). `new Function` costs ~19 us per expression regardless of source length (compacting generated code 20% saved only 15%) | | |
| R8 | lazy `listeners/listenerCount` objects, `$watch` push instead of unshift | NOT DONE | create path is dominated by DOM/compile; watcher arrays per scope are small (the big master scope does ~1500 unshifts once) | | |
| B1 | stateless-filter pipeline memo in `$watchCollection` | BREAKING | see below | | rootScope.js |
| B2 | `$applyAsync` flush on microtask instead of `setTimeout(0)` | BREAKING | see below | | rootScope.js |

### Answers to the coordinator's $location / $http question

Measured on an empty-ish scope tree (`fixed.html`): a digest costs about 0.5 us fixed, 0.6 us with `$location` instantiated, 0.65 us with `$location + $http + $anchorScroll + $templateRequest` instantiated. The `$locationWatch` is a few property reads; `$$checkUrlChange` is the cheap URL compare from the previous round (reads `history.state` and `location.href`). There is nothing worth skipping per digest. One-time init: `$location` about 0.6 ms cold (timer resolution is 0.1 ms), `$anchorScroll` about 0.2 ms, `$http`/`$templateRequest` provider init below the timer resolution (<0.1 ms). So making `$location` lazy saves a one-off ~0.6-0.8 ms plus the `popstate`/`hashchange` window listeners and the `$rootElement` click handler per page, not per-digest time. My changes don't depend on, or alter, any of that.

Assumption for the compile worker: no code outside rootScope.js reads or writes `scope.$$watchers/$$childHead/...` directly; all of those names still work as accessors (a scope's tree fields are on `scope.$$digestNode`). Anything that creates a "scope" without the Scope/ChildScope constructors would not have a node; nothing in src does.

### Where the time goes now (profiles, `$S/opt/scope-bench/prof.js`)

- Idle digest, gd.html after S1: `$digest` loop self ~34%, `expressionInputWatch` 17%, generated expression fns 11%, `$watchCollectionInterceptor`/`interceptedExpression`/`depurifier`/`sceValueOf` ~17% (the three `ng-repeat="a in boolToArray(...)"` per message plus ng-bind-html). What is left is per-watcher memory traffic (10k watch objects + closures) and user expressions. Remaining megamorphism: generated `s.x` loads inside bindings that live under a per-row child scope. Not fixable without changing scope inheritance.
- App-side note (not a library change): an `ng-if` on the same element as `ng-repeat` (toolbox-group-discussion/public/index.html:118-119, toolbox-generators cards/index.html:75, buttons-and-tiles/index.html:76) gives every row an extra child scope class. Removing it from the gd rows made the idle digest 25-30% cheaper (0.77 -> 0.45 ms vs base 1.13 on the same page).
- Cold start of a student embed (embed.html, jqLite): 22 ms of which 35% is V8 compile/GC, ~12% `$parse` (of which `new Function` is most). No lever in this layer; bootstrapSync base 22.8 vs 22.0 ms.
- Creating 200 rows/400 photos is >80% DOM + jQuery/jqLite + compile (compile worker's area); the scope part is now `$new` ~3%.

## BREAKING candidates

### B1. Memoize stateless filter/orderBy/limitTo pipelines inside `$watchCollection` (`scope-breaking-filter-memo.patch`)

What: `ng-repeat="x in list | filter:q | orderBy:'name'"` currently re-runs the whole filter pipeline on **every digest** (`$watchCollection` makes the expression `$stateful`; measured: 2 pipeline runs per digest for 2 repeats, even with nothing changed). The patch re-runs it only when an input changes shallowly (identity, or array length/elements). Gain: list.html (300 items, filter|orderBy|track by): idle digest 0.54x, update 0.58x; the whole pipeline cost scales with list size (500 objects: filter ~0.4-0.7 ms, orderBy ~0.13 ms per digest per repeat).
What breaks: a change *inside* an item (an item field the filter matches on or orderBy sorts by) no longer re-filters/re-sorts until the list or a filter argument is replaced. Spec added in the patch; the existing suite stays green.

Affected (every `ng-repeat` with a pipe, verified by grep; **risky** = item fields are mutated in place):
- risky: `toolbox-generators/public/cards/sys/themes/{flip-card.html:4, link-card.html:7, plain-card.html:7}` and `buttons-and-tiles/sys/themes/{standard-button.html:6, large-button.html:6, tile.html:7}` `| orderBy:'index'`. `card.index`/`button.index` is rewritten in place at `cards/sys/js/main.js:172,316` and `buttons-and-tiles/sys/js/main.js:188,290` (drag reorder). Fix: after setting indexes assign a new array (`m.$root.data.objects = m.$root.data.objects.slice()`), or keep the array sorted in code and drop the orderBy.
- risky (check): `toolbox-pronunciation-guide/public/sys/pages/item-selection.html:12` (`filter:{active:true} | orderBy:'-playCou...'`), `home.html:201`, `home.html:50`; `toolbox-photospheres/public/admin/sys/pages/gallery.html:20,32` (`filter: $root.galleryFilter`); `podcast-manager/html/sys/pages/{dashboard.html:7, gallery.html:3}`, `si-studydesk-styles/website/sys/pages/gallery.html:7`, `toolbox-suggest-feature/public/index.html:30` (`orderBy: [voteSort,'_id']` and votes change in place), `si-admin/public/sys/pages/{toolbox.html:42, manage-access.html:32,54}`, `toolbox-group-discussion/public-admin/sys/pages/list.html:17`, `toolbox-generators/public/{cards,buttons-and-tiles}/index.html:75/76` (templates gallery), `toolbox-3d-model-viewer/public/sys/pages/edit-annotation-modal.html:60,70` and `all-models.html:8`.
- fine (sort key or filter arg is replaced, or the list is rebuilt): `media-catalogue/public/sys/pages/{my-history-shared-log.html:17, my-history-recent-searches.html:17, my-history-recently-viewed.html:17, my-collections.html:40 (function call input), header.html:84,96,106, home.html:9}`, `toolbox/public/index.html:86` (`limitTo:3:($index*3)` over `$root.displayItems`, replaced by updateDisplayItems).
Smallest app fix: replace the array (`list = list.slice()` or `angular.copy` of the changed item) whenever an item field that a filter/sort depends on is edited, or leave the page on the old behaviour (feature is global, no per-page switch in the patch).

### B2. `$applyAsync` flush on a microtask (`scope-breaking-applyasync-microtask.patch`)

What: `scheduleApplyAsync` uses `$browser.defer` = `setTimeout(0)`. Measured headless Chrome (`latency.html`): 4.1 ms from `$applyAsync()` to the digest running (nested timers are clamped), vs 0.0 ms for a microtask. CPU cost is unchanged (batching stays); it saves 1-4 ms of UI latency per `m.$applyAsync()` burst (`$applyAsync` is in 417 places, top files: toolbox/public/sys/js/main.js 37, media-catalogue 28, cards 27, buttons-and-tiles 27, podcast-player 25, 3d-model-viewer 25, group-discussion 21).
What breaks: ordering. (1) code that does `m.$applyAsync()` and then `await`s/`.then`s something already resolved will now see the updated DOM, before it saw the stale one; (2) a `setTimeout(fn,0)` registered **before** the `$applyAsync()` used to run before the digest, now after; (3) the batch no longer spans a whole macrotask of several separate promise continuations, so a burst from several `fetch().then` callbacks in the same turn can digest more than once. ngMock `$browser.defer.flush()`-based specs for `$applyAsync` break (9 specs in 5 `describe` entries fail in each mode, not adjusted in the patch). Apps to audit: any `$applyAsync()` followed by a DOM read inside the same async function, e.g. toolbox-group-discussion/public/sys/js/main.js around :450 (`setTimeout` after applyAsync), the iframe editors that call `window.parent.m.$applyAsync()` from watch listeners (cards main.js:1210ish, buttons-and-tiles main.js:1207ish, tables, introduction-text, counter-button-editor). Fix to make it safe: none needed if no such DOM-after-await reads exist; otherwise wrap the read in `setTimeout`.

### Not implemented, estimates only
- `$templateRequest` cached-template fast path (skip the `$http` promise chain, ~6 asyncQueue hops, per ng-include of an already cached SVG; 87 icon includes, `item.iconFile` includes per card): SAFE only if no `$httpProvider` interceptors; I did not measure it (it is in templateRequest.js, outside my file list).
- `$$hashKey` via WeakMap instead of mutating repeated objects: breaks apps that rely on native `JSON.stringify` of repeated data containing `$$hashKey` (and slower per lookup). Not worth it.

## Tests

- jqlite: 6235/6235 (baseline 6207 + 28 new specs), jquery: 6240/6240 (baseline 6212), Firefox 158 jqlite 6187/6187. Lint: no new problems vs base (harness eslint v4).
- New specs: `test/AngularSpec.js` equals (key order, extra keys, `$`/function/undefined handling, class instances, inherited props, nested Date/RegExp/array mismatch, Scope/Window identity) and copy (class prototypes, 200-node shared/circular graph, own `cloneNode`, nested `$$hashKey`); `test/ng/rootScopeSpec.js` "scope tree bookkeeping" (tree-link accessors through create/destroy, `$$watchers/$$listeners/$$listenerCount/$$watchersCount` accessors, isolate scopes, depth-first digest order, scope created/destroyed during the digest, scope destroying itself, watchers added/removed during a pass, broadcast/emit order, listener count after nested destroy). All the new specs also pass against the unmodified base, i.e. they pin existing behaviour.
- `scope-breaking-filter-memo.patch` adds one spec (suite stays green with it: 6236 jqlite); the microtask patch leaves 9 existing `$applyAsync` specs failing per mode (they flush `$browser.defer`).
