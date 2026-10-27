# appfix-w3: toolbox-podcast-player, toolbox-photospheres, toolbox-pronunciation-guide, si-studydesk-styles, si-photography-catalogue

All edits are uncommitted working-tree changes in each repo. Paths below are under /mnt/109313D2109313D2/sync/www/work/apps.

## Per repo

### toolbox-podcast-player (jQuery REMOVED)
- public/index.html: removed the jquery.min.js tag.
- public/sys/js/main.js:
  - Added `onDocument(events, fn)` and `pageHeight()` helpers at the top.
  - Progress bar: `e.originalEvent || e`, and `element.offset().left / element.width()` became `element[0].getBoundingClientRect()` (mousedown and the document move handler).
  - Volume/speed `e.originalEvent` became `e.originalEvent || e`. These sliders already measured with getBoundingClientRect.
  - keydown: `e.originalEvent || e`.
  - `$(document).on` became `onDocument`, `$(window).on('resize')` became `window.addEventListener`, `$('.page').height()` became `pageHeight()` (3 sites).
  - No other jQuery use in the app. No ng-repeat pipelines, so D6 does not apply.

### toolbox-photospheres
- public/sys/js/main.js:1162 (index): `e.originalEvent || e` on the viewer `mousemove`.
- Index page KEEPS jQuery. toastr (needs jQuery) is used for the save notices, and the app uses `$.ajax`, `$(...)`, `appendTo` and `$(window).on` throughout, all on real jQuery objects. The `$(el)` / `$('<a>')` / `.appendTo(element)` calls work with a jqLite `element`, so no further change was needed. Replacing toastr is a notification UX rewrite, so I did not do it.
- public/admin/index.html: jQuery tag REMOVED.
- public/admin/sys/js/main.js:
  - `m.postJSON`: `$.ajax` became `fetch`. Same JSON POST, same 409 conflict callback (with the parsed body), same alert on failure. A non-JSON 200 still counts as failure, as with `dataType:'json'`.
  - `$.post(delete-photosphere-collection / -image)` became utilities.js `postJSON`. The server's bodyParser.json accepts it. It only acts when there is no error, as before.
  - `uploadNewPhotosphere`: `$.ajax` plus `$('form')[0]` became utilities.js `post(..., 'multipart')` plus `document.querySelector('form')`. The endpoint `photosphere-upload` does not exist on the server, so this is dead code, converted anyway.
  - dropzone `previewsContainer`: `$('<div>')[0]` became `document.createElement('div')`.
- Debug mode: templates/hotspot-templates/new-hotspot.html line 2 (`<script src=dropzone.min.js>`) is no longer executed by jqLite. No change needed: dropzone (and toastr) are already loaded by the `<script ng-if=debug src=...>` tags in index.html's head, which the browser runs at parse time. `Dropzone` and `toastr` are both defined in debug mode on the new build. The A/B "requests" diff on the debug page is only the old build re-fetching dropzone/toastr via jQuery's script execution. I left the template line alone; it is harmless and now inert.
- Heads-up, not mine: index.html has the whole `<head>` content duplicated, and utilities.js is loaded twice. This gives a console "Identifier 'deliveredSessionCallbacks' has already been declared" on both old and new builds.

### toolbox-pronunciation-guide (jQuery REMOVED)
- public/index.html: jQuery tag removed. velocity-animate is not used by the app and loads fine without jQuery.
- public/sys/js/main.js:
  - D8: removed the whole `.config(['$locationProvider', ...html5Mode...])` block. Nothing in the app uses $location, $anchorScroll or autoscroll, and links use plain hrefs.
  - D1: `ngScroll` now uses `$element[0].scrollTop` (lazy loading). The `player` directive now uses `element[0].querySelector('.play-button' / '.stop-button' / 'audio')`. This replaces the class `find`, which also fails on the old jQuery-less jqLite.
  - D2: both `$.getJSON(...).fail(...)` became utilities `getJSON(url, (err, data) => ...)`. The duplicated fail handler is now `m.contentFailed(err)`. The `$('.tippy').not('.tippy-added').each` block became `querySelectorAll('.tippy:not(.tippy-added)')`.
  - D6: `updateMetadata` edits `item.viewCount` in place. The "Most popular" ng-repeat (home.html:108, `filter:{active:true} | orderBy:'-viewCount' | limitTo:6`) would no longer re-sort when the metadata arrives after the list has rendered. Fixed with `m.$root.db["item-list"] = m.$root.db["item-list"].slice()` after the counts loop. Confirmed in the browser: an in-place viewCount bump does not reorder the cards, and a slice does.

### si-studydesk-styles (jQuery KEPT)
- website/sys/js/main.js:365: removed `$locationProvider` from the config injection (D8). The app never used $location (it uses `location.href` and plain `?file=` links), so no behaviour depended on html5Mode. It bootstraps on the new build.
- website/index.html KEEPS jQuery: toastr (`toastr.success/error`, about 9 call sites) requires it. The app code itself has no `$` use, so jQuery is only there for toastr.

### si-photography-catalogue (jQuery REMOVED)
- public/index.html: jQuery tag removed. powerUser.js, utilities.js, tippy, clipboard and popper are jQuery-free.
- public/sys/js/main.js:
  - Added `heightOf(selectorOrEl)` (getBoundingClientRect height). The `.wrapper`, `.gallery` and `.photo-wrapper` rules have no padding or border, so this equals jQuery `.height()`. Verified: the setILARSize heights posted are identical before and after.
  - `showPhoto`, `hidePhoto`: native lookups, `style.top` (guarded for a missing `.photo-wrapper`), and `offset().top` became `rect.top + pageYOffset`.
  - `toggleDownloadPage`: `classList`/`style` (a detached div stands in when `.image-side`/`.download-side` are not on the page, matching jQuery's silent no-op).
  - `scrollToTop`: `.animate({scrollTop:0},'slow')` became `scrollTo({top:0, behavior:'smooth'})`.
  - Scroll listener: `$('.custom-scrollbar').on('scroll')` became `querySelectorAll` plus `addEventListener`.
  - Unused `tooltip` directive (D1): `element.offset()` became `getBoundingClientRect()` plus page offsets. Code kept.
  - Still contains `$(document.body).append(modal)` inside the `window.top.postMessage({_func: ...})` string. It runs in the parent (toolbox) window, not this page, so I left it. Commented-out code also still mentions `$`.
  - D6: `ng-repeat="photo in currentPhotoSet track by photo._id"` has no filter pipeline. Fine.

## jQuery per page
- Removed: podcast-player, pronunciation-guide, photospheres/admin, si-photography-catalogue.
- Kept: photospheres index (viewer and debug), because of toastr and heavy app jQuery use; si-studydesk-styles (website/editor), because of toastr.

## D6 sites
- pronunciation-guide:
  - item-selection.html:12 (`filter:{active:true} | orderBy:'-playCount'`): no `playCount` or `active` is ever written by the app. The data comes from the server, so it is fine.
  - home.html:50 (filters `orderBy:0`) and home.html:134/171/201/279 (filter/orderBy itemName/limitTo/searchQuery): these depend only on args or static data, so they are fine.
  - home.html:108 (`-viewCount`): FIXED, see above.
- photospheres admin gallery.html:20,32 (`filter: $root.galleryFilter`): the arg changes on typing and the arrays are reassigned on fetch. The ng-init `item.preview` is not filtered on in practice. Fine.
- si-studydesk-styles gallery.html:7 (`filter:filter`): the arg drives it, the list is only replaced on fetch, and deletes reload the page. Fine.
- podcast-player and photography-catalogue have no piped ng-repeats. photospheres index viewer.html repeats have no filters.

## Verification
1. Old vs new build on edited apps (in-process, with jQuery removed on the A side too):
   `node ab.js --a $S/opt/current.min.js --b <fork>/angular.min.js --interact --real-time --pages 'toolbox-podcast-player*,toolbox-photospheres*,toolbox-pronunciation-guide,si-studydesk-styles*,si-photography-catalogue*' --label w3-final`
   (results/2026-10-25T01-28-22-w3-final)
   - All 15 pages differ only in the injected `<style len>`. Two other differences are explained:
     - Photospheres debug: the old build re-requests dropzone/toastr via jQuery's script execution (see above).
     - Podcast-player: save-progress POST URLs differ in the position value (timing noise; BEFORE old-vs-old shows the same).
   - Pronunciation-guide showed audio play/pause state noise on that one run, which was noted as flaky. Three reruns (w3-pron1..3) were clean.
2. Against the untouched apps (BEFORE/A vs my B): `python3 compare-runs.py <BEFORE>/A <run>/B <globs>` gives SAME on 14 of 15 pages. Pronunciation-guide was the 15th: the first run showed the audio-state noise above, and reruns 1-3 gave SAME against BEFORE (and SAME on the A side).
3. Exercised directly (puppeteer, own scripts in $S/opt/w3, on old and new builds, no jQuery on the page):
   - podcast.js: a real mouse down and drag on the seek bar calls setTime with 0.25..0.75, none after mouseup. Native mouse events on the volume and speed sliders set 20 on mousedown and 80 on move, and stop after mouseup. Identical on old and new, no errors.
   - pron.js and pron2.js: Most popular order equals the viewCount ranking. Lazy loading grows 54 to 56 cards on scroll (ngScroll). Play buttons work. Identical on old and new, no errors.
   - photo.js (standalone, toolbox): open photo, download-side toggle, back, close, scroll paging, scrollToTop. Identical to the frozen BEFORE apps (jQuery and old build), including setILARSize heights, apart from `jQuery` being gone.
   - admin.js: postJSON save, 409 conflict (alert text identical), delete image (now JSON instead of form-encoded, accepted by server and fixture), and collection re-save. Same results as BEFORE.
   - ps.js: photospheres index, normal and debug mode. The mousemove handler records m.mouse (this crashed on e.originalEvent undefined before the fix), hotspots and titles render, Dropzone and toastr are defined.
4. I did not add harness fixture steps. The scripted steps already hit these pages, and my own scripts covered the rest. Servers I started are stopped.

## Could not fix / notes
- Photospheres index and si-studydesk-styles keep jQuery (toastr). Dropping it needs a toastr replacement.
- The photography-catalogue toolbox-mode `showPhoto` branch (positioning `.photo-wrapper` from a thumbnail) can't run both halves on one page (the thumbnail is only on home and the wrapper only on the modal page), so it is effectively a no-op before and after. The conversion is guarded against nulls.
- Photospheres duplicate head and double utilities.js load in index.html: pre-existing, untouched.
