# jquery worker report: can the fork drop jQuery support?

Scratch root S = /tmp/claude-1000/-mnt-109313D2109313D2-sync-www-work-libs-angular-js/17fd069a-7c9d-4c88-9345-d3423566c242/scratchpad
Detailed per-directive audit tables (file:line, every non-OK call): `$S/opt/jquery-work/audit-A.md` (toolbox, 3d viewer, group-discussion, reaction-bar, notes, small apps, si-admin, podcast-manager select2), `audit-B.md` (all toolbox-generators), `audit-C.md` (photospheres, podcast-player, photography, media-catalogue, pronunciation, inline tracker, gift-quiz, course-dev-reports and the rest). I spot-checked every BREAKING line cited below against the source.
Experiments/prototype: `$S/opt/jquery-work/` (angular.js = drop prototype, safe/ = SAFE find patch, s2/ = select2 test, grid/ = ui-grid test, bench/ = A/B bench, adds/ = jqLite addition sizing).

## 1. Verdict

**Yes, the fork can stop binding to jQuery, and it is worth it, but only together with a small set of app-side fixes (17 pages in 12 apps break silently or loudly without them).** None of the breakage is in the library: every item is an app calling a jQuery-only method on an Angular-provided element, or a jQuery plugin whose `.trigger('change')` never reaches Angular's native listeners. With those ~18 fixes applied, 25 of the 38 jQuery-loading pages (12 with zero change, 13 with a handful of lines) can additionally drop the `jquery.min.js` tag (87.5 KB min / 30.2 KB gz, 3.4-4.9 ms load+eval on this desktop, more on phones).

Library-side win is small (-782 B min / -374 B gz, plus ~6-12% faster on the app-shaped bench because Angular runs on jqLite instead of jQuery). The real win is page-level (the jQuery tag).

Recommended order: (a) apply SAFE `jquery.patch` (jqLite `find` takes CSS selectors, -20 B); (b) fix the app items below while Angular still binds jQuery (all fixes are valid in both modes, so they can ship first and independently); (c) then flip the fork with `jquery-breaking-drop.patch`; (d) then remove jQuery tags page by page.

## 2. Findings table

| id | title | class | gain | files |
|---|---|---|---|---|
| J1 | Angular never binds `window.jQuery` (remove `bindJQuery`, `ngJq`, jQuery branches) | BREAKING | -782 B min / -374 B gz (177,251 -> 176,469 / 61,685 -> 61,311); bench total -6..-8% (25 runs) / -9..-12% (15 runs) | `jquery-breaking-drop.patch` (src/Angular.js, angular.bind.js, jqLite.js, ng/animate.js, ng/compile.js, .eslintrc.json, test/AngularSpec.js, test/helpers/testabilityPatch.js) |
| J2 | jqLite `find()` uses `querySelectorAll` (selectors, not only tag names) | SAFE | -20 B min / -22 B gz; removes 5 of the J1 app fixes | `jquery.patch` (src/jqLite.js + 1 spec) |
| J3 | jqLite additions (each, first/last, closest, offset/width/height, scrollTop/position, show/hide, trigger) | REJECTED | would cost +78..+253 B min each, ~+1,000 B min / +440 B gz in total, cancelling J1's savings; app-side fixes are 1-3 lines each | none (sized in `adds/`) |
| J4 | ui-grid 4.12.7 on jqLite only | SAFE (tested) | n/a | none |
| J5 | Global shim so jQuery `.trigger('change'/'input')` also dispatches a native event (alternative to per-directive select2 fix) | optional app-side | 0 B in library | app |
| J6 | Drop the `jquery.min.js` tag from pages (needs J1 + per-page fixes) | BREAKING (per page) | 87,533 B min / 30.2 KB gz per page, 3.4-4.9 ms eval | apps, see section 5 |
| J7 | Revisit the jqLite "expando store" idea | recommend revisit | not measured here (compile worker) | see section 8 |

## 3. Library side (item 7)

Code that exists only for jQuery support, all removed in the prototype:
- `bindJQuery()` + `bindJQueryFired` (Angular.js ~1877-1927): jQuery detection, `extend(jQuery.fn, {scope,isolateScope,controller,injector,inheritedData})`, `jqLite = jQuery`, and the cleanData monkey-patch. The patch's real job (fire `$destroy` before cleanup) is still needed on jqLite, so it was folded into `JQLite.cleanData` (jqLite.js): same behaviour, no wrapper. `jqLite = JQLite` is now set in jqLite.js; `angular.element` still comes from `publishExternalAPI`.
- `jq()` + the `ngJq` directive docs (Angular.js ~1138-1189): a `document.querySelector` per ng-prefix (4) at library load, now gone (tiny startup saving too). `jq`, `jQuery`, `bindJQuery` removed from `src/.eslintrc.json` globals.
- `$animate.domInsert` jQuery fallback: `jqLite !== JQLite && containsScript(nodes)` and the `containsScript` helper (ng/animate.js). The fast native-insert branch now always applies (still falls back to `after()/prepend()` for multi-node targets and strings).
- `compile.js`: `$rootElement.context` jQuery shim (3970) and the `JQLitePrototype.clone.call(...)` workaround (2471) -> `$compileNodes.clone()`.
- `isArrayLike`: `jqLite && obj instanceof jqLite` -> `obj instanceof JQLite`.
- Left alone on purpose: `isElement()` duck-typing (`prop && attr && find`) is generic; `JQLite._data` / `$$jqLite` are used by ngMock/ngAnimate.
- Test infrastructure that becomes dead if J1 is adopted: `karma-jquery*.conf.js` (3), `angularFiles.js` `karmaJquery*` blocks, `test/jquery_remove.js`, `test/jquery_alias.js`, ~17 `_jqLiteMode` branches (jqLiteSpec 14, animateSpec 1, inputSpec 1), Gruntfile `test:jquery*` tasks. Not removed in the patch (only the 9 `jq()` specs and the two `bindJQuery()` calls in `test/helpers/testabilityPatch.js` were).

Tests (harness `$S/harness`, MODE=jqlite): drop prototype 6198/6198 (the 9 `angular jq` specs deleted because the function no longer exists; baseline 6207). SAFE find patch: 6208/6208 jqlite (+1 new spec) and 6213/6213 jquery (baseline 6207/6212 +1). Jquery mode is not meaningful for the drop prototype.

### Runtime: jqLite vs jQuery (same angular build, interleaved, medians, ratios)
`$S/opt/jquery-work/bench/run.js` on bench.html (1k-row ng-repeat|filter|orderBy, ng-class, ng-if, ng-show, ng-model, ng-click, debug info off), configs interleaved per run: A = base build + jQuery 3.7.1 loaded, B = same build, no jQuery, C = drop prototype, no jQuery.

| 25 runs | A (jQuery) | B (jqLite) | C (drop proto) |
|---|---|---|---|
| render | 1.00 | 0.94 | 0.92 |
| updateAll x10 | 1.00 | 0.94 | 0.91 |
| filter x10 | 1.00 | 0.90 | 0.88 |
| churn x10 | 1.00 | 0.91 | 0.92 |
| teardown | 1.00 | 0.85 | 0.80 |
| total | 1.00 | 0.94 | 0.92 |

A first 15-run pass gave total 0.88 / 0.91 (machine was noisier). B vs C is within noise (the prototype adds nothing beyond removing dead branches). Conclusion: Angular is ~6-12% faster on jqLite on this workload, even though the previous round's native `domInsert` already removed the biggest jQuery cost. Not run: `$S/hotpath/app.html` profiler variant.

Page cost of the jQuery script itself (cached, parse+eval, 30 fresh loads on a loaded desktop): min 3.4 ms, median 4.9 ms.

## 4. What breaks when Angular stops binding jQuery (per app, jQuery tag still present)

"Fix" is app-side and works in BOTH modes unless noted. N = number of independent breakages.

### 4.1 select2 (4 apps; the one that fails silently) - BREAKING
`element.select2(...)` is called on the Angular element (jQuery object). Under jqLite it is `undefined` -> TypeError in the link fn. Wrapping with `$(element[0]).select2()` is WORSE: it fails silently. select2 4.1.0-rc.0 writes the chosen value and fires `this.$element.trigger('input').trigger('change')` (select2/src/js/select2/data/select.js:39,60,66,85,103; selection/allowClear.js:77; core.js:552). jQuery `.trigger` only calls jQuery-registered handlers and native *methods*; it does not dispatch a DOM event, so the native `change` listener that jqLite registered for `select`/ngModel/ngOptions never runs: `ng-model` and `ng-change` stop updating.

Verified in a browser (`s2/run.js`, real select2 UI picks on a single select, a ng-options select and a multiple select, plus ng-change):
- jQuery-bound (today): model x="1" y=2 z=[p,q], ng-change fired.
- jqLite + `$(element[0]).select2()`: x="" y=null z=[], ng-change never fired (silent).
- jqLite + relay shim: UI picks work; a *programmatic* `$(sel).val('1').trigger('change')` does not reach ng-model.
- jqLite + global shim J5: identical to today in every case.

Affected (directive line; templates with `select2` + `ng-model`):
- toolbox/public/sys/js/main.js:2814; templates toolbox/public/sys/pages/podcast-player.html:12, :25
- toolbox-3d-model-viewer/public/sys/js/main.js:871 (also `$()` at :857 for the icon template, fine while jQuery stays); sys/pages/edit-annotation-modal.html:17, :29, :39
- si-admin/public/sys/js/main.js:370 (inside setTimeout, so uncaught); sys/pages/manage-access.html:18, :23, :44; sys/pages/toolbox.html:27, :32 (all `ng-model`+`ng-options`)
- podcast-manager/html/sys/js/main.js:298; sys/pages/create-podcast.html:14, :41; edit-episode.html:18; edit-podcast.html:12; upload-episode.html:23

Fix option 1 (per directive, 4 files, 3 lines each): `let el = element[0]; $(el).select2(cfg); $(el).on('select2:select select2:unselect select2:clear', () => el.dispatchEvent(new Event('change', {bubbles: true})))`. Must use the `select2:*` events, not `change` (it would loop).
Fix option 2 (J5, once per page, covers any jQuery-triggered change, ~3 lines, e.g. in /utilities.js guarded by `window.jQuery`):
```js
['change','input'].forEach(t => jQuery.event.special[t] = {trigger() { if (this.dispatchEvent) { this.dispatchEvent(new Event(t, {bubbles: true})); return false } }})
```
jQuery handlers still fire (through jQuery's own native listener). Still needs `$(element[0]).select2()` in the 4 directives. Caveat: loses `trigger('change', [extra])` args and namespaces (`change.select2`); none used in the apps.
These four pages cannot drop jQuery regardless (select2 requires it; toolbox still ships select2 only for podcast-player.html, since the layout picker was already replaced by `tbDropdown`).
Lifecycle check: I tested a `<select ng-if select2>` removal; the `.select2-container` is removed in both modes (no leak), so the earlier "select2 leaks without patched cleanData" suspicion is NOT reproduced.

### 4.2 Directives using jQuery-only element methods / event fields - BREAKING

| app / page | file:line | what | fix |
|---|---|---|---|
| toolbox-reaction-bar index.html, injector.html, modal.html (tooltip fires from index.html:51,57,63 / injector.html:35,41,47) | toolbox-reaction-bar/public/sys/js/main.js:387 | `element.offset()` on every mouseover -> TypeError, `showTooltip` never posted | `let r = element[0].getBoundingClientRect(); {top: r.top + scrollY, left: r.left + scrollX}` |
| si-manager/public/toolbox-feedback/index.html | si-manager/public/toolbox-feedback/main.js:97 `element.find('.stars-filled .star')` (empty under old jqLite find; fixed by J2), :100/:115/:144 `.each` (missing), :110/:172 `.position().left`, :111/:173 `.width()` | `stars` directive link throws, no handlers attach | `querySelectorAll` + `forEach`, `getBoundingClientRect()` |
| toolbox-podcast-player | main.js:510-513 progressBar `element.on('touchstart mousedown')` reads `e.originalEvent.touches` + `element.offset().left` + `element.width()` | throws | `e = e.originalEvent \|\| e`; `getBoundingClientRect()` |
| toolbox-podcast-player | main.js:530-531 (inside `$(document).on('touchmove mousemove')`, real jQuery event, so `originalEvent` ok) `element.offset()`, `element.width()` | seek-bar drag throws | `getBoundingClientRect()` |
| toolbox-podcast-player | main.js:771 volume `element.on('touchstart mousedown')` `e.originalEvent.touches` | volume/speed sliders cannot start drag | `e.originalEvent \|\| e` |
| toolbox-photospheres index.html | main.js:1161-1163 viewer `element.on('mousemove', e => e.originalEvent.clientX ...)` | throws on every mousemove | `(e.originalEvent \|\| e)` |
| toolbox-photospheres (debug mode only, `m.debug`) | main.js:1128 `templateUrl: .../new-hotspot.html`, whose line 2 is `<script src=".../dropzone.min.js">`; jQuery's `.html()` executes it, jqLite does not | dropzone not loaded in debug-mode hotspot template | load dropzone from index.html |
| toolbox-pronunciation-guide | main.js:360-361 `element.find('.play-button')[0]`, `.find('.stop-button')[0]` (fixed by J2); :383 `playButton.onclick =` throws otherwise | player dead | `element[0].querySelector(..)` (or J2) |
| toolbox-pronunciation-guide | main.js:450 `$element.scrollTop()` in `ngScroll` | throws on every scroll, lazy loading dead | `$element[0].scrollTop` |
| toolbox-inline-completion-tracker public/index.html (non-toolbox mode only) | main.js:176-177 `element.offset()`, `element.width()` | tooltip throws | `getBoundingClientRect()` |
| si-photography-catalogue | main.js:684 `element.offset()` in `tooltip` directive | no template uses `tooltip=` (dead code) | delete or `getBoundingClientRect()` |
| toolbox-generators/counter-button-editor index.html | main.js:243-244 `element.find('.inc-button')`, `.dec-button` (class find; fixed by J2) | +/- steppers silently dead | `element[0].querySelector(..)` (or J2) |
| toolbox-generators/tables index.html:81,85 | main.js:636-637 same code in `ilarNumberInput` (fixed by J2) | Columns/Rows steppers dead | `angular.element(element[0].querySelector(..))` (or J2). introduction-text main.js:293-294 is the same copy but the directive is unused there |
| toolbox-generators/profile-image-generator | main.js:683 `element.closest('svg')[0]` | TypeError on every wheel zoom | `element[0].closest('svg')` |
| toolbox-generators/banner-generator (frozen app) | main.js:355 `e.originalEvent.key` in `element.on('keydown')` | throws once contenteditable has 3+ divs | `e.key` |

Benign difference: toolbox-photospheres main.js:309 `element.find('.hotspot-title-label')` returns empty under old jqLite (element was just emptied; harmless; J2 makes it correct).

Per-app breakage count (independent app-side fixes; items J2 would also fix are in brackets):
toolbox 1 (select2); toolbox-3d-model-viewer 1 (select2); si-admin 1 (select2); podcast-manager 1 (select2); toolbox-reaction-bar 1 (3 pages); si-manager toolbox-feedback 1 [+1]; toolbox-podcast-player 3; toolbox-photospheres 1 (+1 debug-only template script); toolbox-pronunciation-guide 1 [+1]; toolbox-inline-completion-tracker 1; si-photography-catalogue 1 (dead code); toolbox-generators: counter-button-editor 0 [+1], tables 0 [+1], profile-image 1, banner-generator 1.
Totals: 17 pages in 12 repos are affected (toolbox, 3d viewer, si-admin, podcast-manager, reaction-bar index/injector/modal, toolbox-feedback, podcast-player, photospheres, pronunciation-guide, inline tracker, photography-catalogue, counter-button-editor, tables, profile-image, banner-generator). 16 independent app fixes (15 + the photospheres debug case) with J2 applied, 20 without it.

Everything else is **SAFE** with zero changes: media-catalogue, course-development-checklist, course-development-reports (ui-grid, section 7), toolbox-group-discussion (+admin; already jqLite+cash), toolbox-previews, toolbox-gift-quiz-converter, toolbox-notes, toolbox-sample-app, toolbox-suggest-feature, toolbox/content-template-access-modal, toolbox-reaction-bar/dashboard, inline-completion-tracker/config, si-studydesk-styles, si-manager/status-dashboard, si-analytics and toolbox-course-roadmap (stubs: `sys/js/main.js` missing / empty dirs), toolbox-photospheres/admin, and all generators except the four above, including buttons-and-tiles / cards / counter-button-editor `embed.html` (already on jqLite; audit-B section 1 traces every code path that runs there: no `$`, `$.get`, `jQuery` is reachable, protection is structural via `m.editing`).

### 4.3 Event semantics (item 3)
- Under jqLite handlers get the native event. Reads of `e.originalEvent` on Angular-registered listeners: the six rows above (reaction-bar none; photospheres 1162; podcast-player 510/771; banner 355). Everywhere else `originalEvent` is read on events from `$(window)/$(document).on(...)` (real jQuery; fine while jQuery stays loaded): toolbox-reaction-bar main.js:245-256, 300-301; podcast-player 528, 715, 783; profile-image 632, 643; photospheres 985. gift-quiz (262) and rive-player-editor (414) already use `(e.originalEvent || e).dataTransfer`; banner 400 same.
- `e.which`: group-discussion 585, 1260-1291, banner 381, photospheres 1245 are all native-safe. No `isDefaultPrevented`, `delegateTarget`, namespaces (`click.foo`), event data, or `$event.originalEvent` anywhere. All `$event` uses in templates are `stopPropagation()/preventDefault()` (toolbox/public/index.html:103, si-photography-catalogue home.html:12 / modal.html:53, podcast-player mobile-player.html:53, b&t/cards partials) and native-safe. `return false` in jqLite handlers is ignored (banner 358, profile; both have explicit preventDefault).
- Reverse direction (`$(el).trigger(...)` reaching Angular listeners): the only jQuery `.trigger` in the whole suite besides select2 is `$(block).trigger('usq.setbadge')` in si-manager/public/ilar-manager.js:5124, which runs in Moodle with the host's jQuery and has no Angular involvement. `$('form').submit()` (banner/course-banner/profile-image) calls the native submit. No `.val(x).change()` anywhere. select2 is the only plugin; verified above.

### 4.4 `.scope()` / `.isolateScope()` / `.controller()` / `.injector()` / `.inheritedData()` (item 4)
Zero calls in any in-scope app file, in ui-grid.js, or in the shared scripts (grep across 303 front-end files). `angular.element(...)` appears only in course-development-reports main.js:843-844 (modal; works on jqLite). Debug info is disabled via `debugInfoEnabled(false)` in every app's main.js except toolbox-inline-completion-tracker/public (irrelevant, nothing reads it).

### 4.5 Lifecycle (item 5)
No app calls jQuery `.remove()/.empty()/.html(x)/.replaceWith()` on Angular-managed DOM (ng-repeat/ng-if/ng-include/$compile output), so nothing depends on the patched `jQuery.cleanData`. Calls found are on detached clones (resource-templates 123-182, tables 432-462), browser-made contenteditable children (banner-generator 375, 413), pannellum nodes (photospheres 1222), own style tag (course-banner 302, executes in host page), or `$modalElm.remove()` (course-development-reports 833-840) which is `angular.element(html)` and fires `$destroy` on jqLite too. Angular's own `$destroy` firing is preserved (folded into `JQLite.cleanData`; spec suite green). The select2 leak hypothesis was tested and is not real (4.1).
Existing, unrelated leaks seen in passing: window listeners never removed (counter-button-editor 291-293, profile-image 623/642/655), tippy poppers not destroyed on scope destroy (b&t/cards).

## 5. Pages that could shed the jQuery tag (item 1)

38 of the 46 pages listed load `jquery.min.js` (87,533 B min, ~30.2 KB gz) before angular. The other 8 already run on jqLite: the 3 generator `embed.html`, group-discussion (cash-dom) + admin, previews, course-development-checklist, si-manager/status-dashboard. No page uses cash-dom except group-discussion. Libraries that REQUIRE jQuery: select2 (toolbox, 3d-model-viewer, si-admin, podcast-manager), toastr 2.1.4 (si-admin, 3d-model-viewer, toolbox-photospheres, si-studydesk-styles; `define(["jquery"])`). Not jQuery-dependent: tippy, popper, dropzone, tinymce, chart.js, monaco, pannellum, draggable, sweetalert2, html2canvas, jszip, clipboard, ui-grid (tested). Velocity is loaded by pronunciation-guide index.html:65-66 but never called anywhere (remove the tags).

**A. Drop now, zero code change (12 pages), once J1 lands:** media-catalogue; toolbox-gift-quiz-converter; toolbox-notes; toolbox-sample-app; toolbox-suggest-feature; toolbox/content-template-access-modal; toolbox-inline-completion-tracker/config; toolbox-generators/introduction-text (index.html:27), rive-player-editor (:17), rive-player (:27, student-facing); toolbox-course-roadmap and si-analytics (stub pages).

**B. Drop after a handful of lines (13 pages):**
- course-development-reports: 6x `$.getJSON` (main.js:568,582,596,610,624,638) -> `getJSON` from /utilities.js
- toolbox-reaction-bar dashboard: `$.getJSON` main.js:59 + `$(window).on('hashchange')` :158; index/injector/modal: `$(window).on('storage')` main.js:245,300 (use `e.key/e.storageArea/e.newValue` directly) + the :387 fix
- si-manager/toolbox-feedback (stars fix), toolbox-inline-completion-tracker/public (offset fix)
- buttons-and-tiles index.html:31: `$.get` main.js:1085,1335 -> `get` (/utilities.js:96); cards index.html:30: main.js:1106,1355
- counter-button-editor index.html:23: main.js:291-293 `$(window).on` -> `addEventListener` (+ find fix, J2)
- horizontal-rule index.html:65: one block main.js:14-38; resource-templates index.html:29: main.js:123-182 (detached clone, all `querySelectorAll`); tables index.html:29: main.js:432-462 (+ J2 for 636-637)
Exact native replacements per line are in `audit-B.md` section 2/3 (note the SVG `.show()` trap: `style.display='inline'`, not `''`, banner-generator 64-66 / course-banner 325).

**C. Medium (7 pages, 10-40 call sites):** profile-image-generator (~12 swaps; bare-number `.css('x', 1)` needs `'1px'`), course-banner-generator (~10), banner-generator (frozen), toolbox-pronunciation-guide (3 `$` lines main.js:293-295, 450 + the breakages), toolbox-photospheres/admin ($.ajax 170, 287; $.post 242, 254; $('form')[0] 285; `$('<div>')` 404), toolbox-podcast-player (9 `$` sites + 3 breakages), si-photography-catalogue (12 `$` sites incl. `.animate({scrollTop})` 398, 404).

**D. Blocked while the dependency stays (6 pages):** toolbox (select2 + `$` at main.js:479-505 `.offset/.animate/.scrollTop`, 743-757), toolbox-3d-model-viewer (select2, toastr), si-admin (select2, toastr), podcast-manager (select2), si-studydesk-styles (toastr), toolbox-photospheres/index (toastr, many `$`, pannellum). Photospheres index.html also has its entire `<head>` duplicated (jQuery/angular/pannellum/popper/tippy/utilities each loaded twice, lines 33-39 and 72-78; the second jQuery replaces `window.$` with a different instance than the one Angular bound to). Worth cleaning regardless.

Direct-jQuery call sites outside Angular element objects (need the jQuery tag, unaffected by J1): whole-suite total 133 `$(`/`jQuery(` sites in 24 files + 20 `$.x` sites (`getJSON`, `ajax`, `get`, `post`, `param`); line numbers in `audit-*.md`. The five `fitscreen.js` copies (photospheres, banner, course-banner, horizontal-rule, profile-image) are not loaded by any page and can be deleted.

## 6. cash-dom / group-discussion
Page loads cash 8.x which defines `$` but not `jQuery`, so Angular already runs jqLite there. Cash is used only as `$(sel)[0]` (main.js:42,43,50,537,538,736,761,791,1018,1023) and could be `document.querySelector`. `contenteditable` directive at main.js:1339-1361 has a TDZ bug (calls `read()` before `let read`) but is only used by a template nothing references.

## 7. ui-grid (item 6)
ui-grid 4.12.7 source has no `jQuery` reference except comments (4 comment mentions: lines 12423, 12649, 13407, 14402); no `.scope()`, no jQuery-only calls (it ships its own `gridUtil` helpers). Browser test (`grid/run.js`, 3,000 rows, filtering, pagination, selection, resizeColumns, exporter, column footer aggregates, custom `filterHeaderTemplate` directive, `cellTemplate`; page modelled on course-development-reports/public/sys/js/main.js; jQuery 3.7.1 + base build vs jqLite + drop build): header sort clicks, body scroll (vertical+horizontal), filter typing, next page, column resize by mouse drag (150 -> 208 px in both), grid menu items, window resize, footer/pager text, rendered row/header counts: **all snapshots identical, no page errors** -> SAFE. The custom modal in main.js:843 uses `angular.element(html)` + `.prepend` + `.remove()`, supported by jqLite. si-manager lists ui-grid in package.json only to serve it; nothing there uses it.
Side finding (not jQuery): course-development-reports/public/index.html:16 loads `ui-grid.js` (1,201,365 B / 240 KB gz); `ui-grid.min.js` is 349,811 B / 89 KB gz, a free ~150 KB gz saving.
Other directive-wrapped plugins (tippy, Dropzone, draggable, chart.js, monaco, pannellum, tinymce, rive): all are given `element[0]`; none touches the wrapper object.

## 8. jqLite additions (item 8) and the expando store
Sized by building each in `adds/` (after J2 baseline 176,449 B / 61,289 gz):

| addition | +min | +gz | verdict |
|---|---|---|---|
| `find` via querySelectorAll | -20 | -22 | J2, SAFE, do it (fixes 5 call sites) |
| `each` | +100 | +54 | REJECTED: app-side `forEach` (toolbox-feedback 100/115/144 only) |
| `first`/`last` | +78 | +39 | REJECTED: no in-scope use on Angular elements |
| `closest` | +79 | +47 | REJECTED: one use (profile-image 683) -> `element[0].closest` |
| `offset`+`width`+`height` | +253 | +89 | REJECTED: 6 uses (reaction-bar, player, inline tracker, feedback, photo-catalogue dead) -> `getBoundingClientRect()` (also more correct: jQuery `width()` is content-box) |
| `scrollTop`+`position` | +203 | +85 | REJECTED: pronunciation-guide 450, feedback 110/172 -> native |
| `show`/`hide` | +179 | +63 | REJECTED: no use on Angular elements |
| `trigger` (native dispatch) | +118 | +61 | REJECTED: would only fix select2; use J5/directive fix |

All together ~+1,000 B min / +440 B gz, which cancels J1. Fix the ~16 sites in the apps instead.

Expando store: once jQuery is gone every page's data store is jqLite's `ng339` -> `jqCache` map, so the idea measured earlier at 38-65% faster element churn becomes relevant to ALL pages instead of 8. Recommend the compile worker's result be revisited together with J1; J1's `JQLite.cleanData` change is orthogonal (it only reads the store via `jqLiteExpandoStore`) and trivially adapts.

## 9. Test results
- `jquery-breaking-drop.patch` copy (`opt/jquery-work/angular.js`): MODE=jqlite 6198/6198 (9 `jq()` specs removed, `bindJQuery()` calls removed from test/helpers/testabilityPatch.js).
- `jquery.patch` copy (`opt/jquery-work/safe/angular.js`): MODE=jqlite 6208/6208, MODE=jquery 6213/6213.
- Build: `node scripts/build-lib.js` OK; sizes above (gzip default level).
- Browser experiments: select2 (3 variants), ui-grid (2 modes), lifecycle (ng-if + select2), bench A/B/C, jQuery eval time. No app pages were run end-to-end (no backends); app findings are static audits by three read-only auditors plus my grep sweeps and spot checks, not runtime traces.

## 10. Not found / caveats
- No use of `ng-jq` anywhere, so removing `ngJq` is safe.
- `window.parent.m` same-origin access is jQuery-independent. generators call `window.parent.$` (banner-generator main.js:246, course-banner main.js:607): the toolbox's own jQuery; if toolbox ever drops jQuery replace with `window.parent.document.querySelector('.inline-photography-iframe')`.
- Code inside `_func` strings posted to ilar-manager.js:6848 runs in the host Moodle page with the host's `$` (banner-generator 230, course-banner 302-305, 590); unaffected.
- toolbox-photospheres/public/sys/pages/hotspot-templates/new-hotspot.html (debug only) and the duplicated head are the only "script in template" cases found.
