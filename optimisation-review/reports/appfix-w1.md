# appfix-w1: toolbox, toolbox-3d-model-viewer, si-admin, podcast-manager

Apps root: /mnt/109313D2109313D2/sync/www/work/apps. No commits or index changes made.

## Changes per repo

### toolbox
- `public/sys/js/main.js:2814-2820` select2 directive: `$(element[0]).select2(...)` (jqLite has no `.select2`), plus
  `select2.on('select2:select select2:unselect select2:clear', () => element[0].dispatchEvent(new Event('change', {bubbles: true})))`
  so ng-model / ng-change see the pick (D1). Used by `sys/pages/podcast-player.html` (podcast select with ng-change, episode select).
- `public/index.html:126` `ng-style` height: `previewItem.maxHeight + 'px'` (was bare number; jqLite does not add px). 0 stays 0 (all 30 toolboxItems have a numeric maxHeight).
- `public/content-template-access-modal/index.html:18` removed the `jquery.min.js` tag (D2).

### toolbox-3d-model-viewer
- `public/sys/js/main.js:871-874` select2 directive: same `$(element[0])` + forwarding (annotation type/icon/alignment selects).
- `public/sys/js/main.js:422-423` (D6): after the in-place model edit loop in the `m.models` branch, `m.models = m.models.slice()` so the `models | filter:$root.modelFilter` list in all-models.html re-runs.

### si-admin
- `public/sys/js/main.js:370-373` select2 directive (init after `ready`): `$(element[0]).select2({...}).on('select2:select select2:unselect select2:clear', ...)` same forwarding. ng-options selects in manage-access.html / toolbox.html.

### podcast-manager
- `html/sys/js/main.js:298-303` select2 directive: same as toolbox (create-podcast, edit-podcast, edit-episode, upload-episode).

## jQuery per page (D2)
- toolbox/public/content-template-access-modal: REMOVED. Its main.js and utilities.js (fetchActivity/getJSON/post) use no jQuery; page runs with zero change (A and B both jQuery-free).
- toolbox/public/index.html: kept (select2, plus ~15 `$()` uses in main.js on plain DOM: card scroll/animate, tippy, customScrollbar, dropzone previewsContainer).
- toolbox-3d-model-viewer/public/index.html: kept (select2 and toastr loaded via document.write; `$()` in the icon template).
- si-admin/public/index.html: kept (select2; also `$.param` x2, `$()` in select templates, toastr).
- podcast-manager/html/index.html: kept (select2).

## D1 beyond select2
Grepped all four repos (app JS, templates, sys/js/*.js) for jqLite-missing methods on Angular elements (offset/width/height/closest/is/each/trigger/animate/show/hide/siblings/prev/originalEvent/numeric `.css`, `angular.element`, `.select2`): the only hits are plain `$()` objects (jQuery stays, fine) and the four select2 directives. `element.on('change'|'click')`, `element.attr`, `element.bind('change')` in toolbox/podcast-manager are jqLite-safe. No programmatic `$(sel).val().trigger('change')` exists in these repos. Only other `ng-style` are string background-image/background-color values (fine).

## D8
No `$location`, `$anchorScroll`, JSONP, ng-csp, xsrf config, or removed directives/filters in these repos' app code or templates (only `$compileProvider`, `$sceDelegateProvider`, `$sceProvider`).

## D6 sites
- si-admin toolbox.html:42, manage-access.html:32,54: fine. Lists change via push/splice/reassign (length or reference), filter arg is the model string. `checkUnused*` edits `.added` in place, but that only feeds the ng-options `filter:{added:false}|orderBy`, and ngOptions uses a function watchable (not memoized; verified in src/ng/directive/ngOptions.js:597), and the browser test shows it still works. (Pre-existing bug, not touched: `removeCourseFromWhitelist` does `indexOf` of a freshly built object = -1, so it splices the last item.)
- 3d-viewer all-models.html:8: FIXED (`m.models = m.models.slice()` after the in-place edit at main.js ~416).
- 3d-viewer edit-annotation-modal.html:60,70 (`data.items|filter:annotation._id`, `data.tempItems|filter`): fine. items are replaced (`m.data.items[i] = item` replaces an element, `concat` reassigns), pushed or spliced; tempItems push/splice.
- podcast-manager dashboard.html:7, gallery.html:3: fine, `podcasts` is assigned once, filter arg is the input string.
- toolbox index.html:86 (`displayItems | limitTo:3:($index*3)`): fine, displayItems is rebuilt as a new array by `updateDisplayItems`. No other piped ng-repeat or piped `$watchCollection` string in these repos.

## Verification
All run with Chrome headless against the suite-ab server (scripts in `$S/opt/appfix-w1/`: select2-ui.js, toolbox-select2.js, viewer-select2.js, preview-height.js).
1. `node ab.js --a $S/opt/current.min.js --b <fork>/angular.min.js --interact --real-time --pages 'toolbox,toolbox-content-template-access-modal,toolbox-3d-model-viewer*,si-admin*,podcast-manager*' --label w1-final`
   (results/2026-10-25T01-24-06-w1-final, log `$S/opt/appfix-w1/ab-final.log`). 15 pages flagged DIFF, but every diff line is the injected `<style len=237>` vs `<style len=151>` (and nothing else); DOM, text, errors, requests and all interaction steps otherwise identical. On the modal page the A side also ran jQuery-free.
2. `python3 compare-runs.py <BEFORE>/A <w1-final>/B <glob>` for each of the 5 groups: all SAME (toolbox-3d-model-viewer x4, si-admin x2, podcast-manager x7, modal) except `toolbox`, whose only difference is the intended ng-style source text (`maxHeight + 'px'`). Every other line is identical.
3. Real select2 UI picks (click the select2, click a result), old (current.min.js) vs new (fork build), model read from the ngModel controller, with initial select2 text shown:
   - si-admin (group select [ng-options, object], editor select [ng-options + filter|orderBy], course select) and si-admin-toolbox: model updated on both builds; initial placeholders identical.
   - podcast-manager create-podcast, edit-podcast, edit-episode, upload-episode: model updated on both builds; initial values display selected ("Dr Anika Rao", "Test Staff") on both.
   - toolbox podcast-player install screen: pick changes `podcastID` and the ng-change fires (`newIlar.params.rss` rewritten via makeRssLink) on old and new; initial "Manual RSS feed" displayed on both.
   - 3d-viewer annotation modal: type (label to icon, which reveals the ng-if icon select), icon, alignment picks update the model on both builds; no page errors.
   - No `multiple` selects exist in these four repos.
   - Note on old build the model sees both the jQuery change and the native forwarded one (idempotent for these single selects).
4. toolbox preview height: opening a card preview gives wrapper `height: 782px` and closing returns to 0px on both old and new builds.

## Not fixed / notes
- `scope.select2` in the 3d-viewer directive is still assigned (now the jQuery object); nothing else reads it.
- I did not add harness fixture steps; the checks above are standalone scripts.
