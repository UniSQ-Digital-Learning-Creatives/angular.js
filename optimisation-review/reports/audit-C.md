# Audit C: jqLite-only (angular.element never binds to jQuery)

Apps root: /mnt/109313D2109313D2/sync/www/work/apps  (all paths below relative to it)
Method: read every JS file in full (or every directive/link/compile fn + all DOM-touching code), grepped for `$(`, `jQuery`, `$.`, `.scope(/.controller(/.injector(/.data(/.trigger(`, `$event`, `angular.element`, `$document`, `$compile`, and read all HTML templates / ng-template scripts / ng-include'd SVGs.
Legend: BREAKING = throws or silently misbehaves under jqLite. "real jQuery" = app calls `$()`/`jQuery()` itself on its own or non-Angular DOM; fine, but needs jQuery to stay loaded on the page.

## Summary of BREAKING items

| # | file:line | receiver.call | why |
|---|-----------|---------------|-----|
| 1 | toolbox-photospheres/public/sys/js/main.js:1161-1163 | `element.on('mousemove', e => { let evt = e.originalEvent; evt.clientX ...` | jqLite passes native event, `originalEvent` undefined -> TypeError on every mousemove over the viewer (mouse sync for guided mode) |
| 2 | toolbox-podcast-player/public/sys/js/main.js:510-513 | progressBar `element.on('touchstart mousedown', e => e.originalEvent ... element.offset().left ... element.width())` | `originalEvent` undefined (TypeError at `event.touches`); `.offset()` and `.width()` MISSING. Seek bar click/drag dead |
| 3 | toolbox-podcast-player/public/sys/js/main.js:530-531 | same directive, `$(document).on('touchmove mousemove')` handler calls `element.offset().left`, `element.width()` on the jqLite `element` | MISSING (handler itself is real jQuery so `e.originalEvent` there is fine). Seek bar drag throws once `start` is true |
| 4 | toolbox-podcast-player/public/sys/js/main.js:771 | volume directive `element.on('touchstart mousedown', e => { e.originalEvent.touches` | `originalEvent` undefined -> TypeError. Volume/speed slider click dead (drag handler at 781-785 is real-jQuery `$(document)`, OK, but never starts) |
| 5 | toolbox-pronunciation-guide/public/sys/js/main.js:360-362, 383, 409 | player directive `element.find('.play-button')[0]`, `.find('.stop-button')[0]` | jqLite find is tag-name only, returns empty -> `playButton`/`stopButton` undefined -> TypeError at `playButton.onclick =` (383) when an mp3 exists. `element.find('audio')[0]` (362) is OK (tag name) |
| 6 | toolbox-pronunciation-guide/public/sys/js/main.js:450 | ngScroll `$element.scrollTop()` | MISSING -> TypeError on every scroll of `#main-scrollable-element` (home.html:82); lazy-load card growth (scrollUpdate) stops |
| 7 | toolbox-inline-completion-tracker/public/sys/js/main.js:176-177 | tooltip `element.offset()`, `element.width()` | MISSING -> TypeError in mouseover (non-toolbox mode); tooltip never shows |
| 8 | si-photography-catalogue/public/sys/js/main.js:684 | tooltip directive `element.offset()` | MISSING -> TypeError in mouseover handler. NOTE: no template in the app uses `tooltip=` (grep of sys/pages/*.html and index.html found none), so presently dead code; breaks only if someone uses it |

Everything else audited is OK or benign (details below). Suggested minimal fixes are in each table.

---

## toolbox-photospheres/public

### sys/js/main.js (1272 lines). Directives read: dropzone, iconDropzone (same factory `dropzoneDirective`), hotspot, hotspotPanel, viewer = 5, plus Angular-element helpers `applyHotspotIcon/applyHotspotTitle/createHotspotUI`. All others OK.

| file:line | receiver | call | status | note / fix |
|---|---|---|---|---|
| main.js:1161-1163 | `element` (`<viewer>`, jqLite) | `.on('mousemove', e => e.originalEvent.clientX)` | **BREAKING** (DIFF event) | use `let evt = e.originalEvent \|\| e` |
| main.js:1075-1086 / 307-320 | `element` (jqLite; hotspot link fn), passed into `m.applyHotspotTitle(element, hotspot)` which does `element.find('.hotspot-title-label')` | `.find('.cls')` | DIFF (benign here) | jqLite returns empty (no throw). Call at 1086 happens right after `element.empty()` (1076) so there was never an existing label; code then does `$('<span>').appendTo(element)` which accepts a jqLite object fine. Other callers (209-210, 336-337) pass a real-jQuery `$(el)` / `$(selector)`, so `find('.cls')` works there. If anyone later calls applyHotspotTitle with an Angular element on an element that already has a label, a duplicate label is appended; safest: `element[0].querySelector('.hotspot-title-label')` |
| main.js:1076 | `element` | `.empty()` | OK | jqLite empty deallocs children; children are plain nodes |
| main.js:1083 | `element` | `.append(a)` where `a = $('<a>')` is a real-jQuery object | OK | jqLite wraps array-likes via jqLiteAddNodes (jQuery object has `.length`), verified in src/jqLite.js |
| main.js:1080 | `a` (real jQuery `$('<a>')`) | `.on('click contextmenu', e => e.stopPropagation())` | real jQuery | needs jQuery. Child handler registered as a native listener, still precedes parent's jqLite listener in bubble order |
| main.js:1092, 1109 | `element` | `.on('click contextmenu', e => e.preventDefault())` | OK | space-separated types supported by jqLite; only `preventDefault` read |
| main.js:349 | `$compile(element)(m.$root)` where `element` is real-jQuery `$(el)` (el is the pannellum hotspot div, created natively by pannellum) | $compile of a foreign jQuery object | OK | `$compile` re-wraps with `jqLite(x)` -> array-like copy. Comment says "only compile childNodes" but code compiles the element itself (so the `hotspot` attr directive links). No `.appendTo/.find` on the compile result |
| main.js:226 | `m.createHotspotUI($(el), ...)` | real jQuery `.attr/.addClass` (328-333) | real jQuery | operates on pannellum's div, not an Angular element. Needs jQuery |
| main.js:199-210 | `$('[hotspot="id"]')` | `.length`, `[0]`, `.addClass/.removeClass` via applyHotspotIcon | real jQuery | pannellum DOM. Needs jQuery |
| main.js:872/875 | `$('.pnlm-zoom-controls')` | `.show()/.hide()` | real jQuery | pannellum DOM |
| main.js:1158 | `$('.pnlm-controls-container')` | `.prependTo('.custom-ui-buttons')` | real jQuery | moves pannellum node into a static div of viewer.html (not ng-if'd). prependTo does not clean data. OK |
| main.js:1222-1234 | `$('.pnlm-fullscreen-toggle-button').remove()`, `$('<div>').appendTo($('.pnlm-controls-container'))`, `fullscreen.on('click')`, `addClass/removeClass` | real jQuery | pannellum-owned nodes, no Angular data. Needs jQuery |
| main.js:981-985 | `$(window).on('keypress', evt => evt.originalEvent.which)` | real jQuery | fine only because `$` is real jQuery. Needs jQuery |
| main.js:31 | `$('<div>')[0]` (Dropzone previewsContainer) | real jQuery | OK |
| main.js:407, 494 | `$.ajax(...)` | real jQuery | whole save path uses `$.ajax`/`.done/.fail` (jqXHR); needs jQuery. No `$http` |
| main.js:634 | `$('.polaroid-zoomed').length` | real jQuery query over Angular-rendered DOM | read only. OK |
| main.js:565-567 | `$('.hotspot-wrapper')...` | unused locals | n/a |
| main.js:25, 1154 | `new Dropzone(element[0])`, `pannellum.viewer(element[0], ...)`, `tippy(element[0])` (341) | native node | OK |
| main.js:1245 | `m.viewer.on('mousedown', e => e.which === 3)` | pannellum's own event API, native event | OK (not jQuery) |
| main.js:664-668 | `element.requestFullScreen` where `element = document.body` / `event instanceof HTMLElement` | native | NATIVE |

Templates (sys/pages/viewer.html, guided.html, hotspot-templates/{hotspot-panels,new-hotspot,tour}.html, index.html): `$event` only as `$event.preventDefault()` in ng-submit (viewer.html:76,123) -> native. Inline `onclick="this.parentElement.parentElement.click()"` (viewer.html:81,128) native. `ng-bind-html="trust(...)"` uses $sce, not element API. `hotspotPanel` directive (restrict E, templateUrl) is registered but `<hotspot-panel>` is not used in any template. No ng-include'd SVGs (SVGs are CSS backgrounds `<img>`).

### sys/js/fitscreen.js: NOT referenced from index.html/admin/index.html (dead). Uses `$('script').last()`, `$(window).width()`, `.attr/.prependTo`: real jQuery only; irrelevant to Angular.

### sys/js/data.js: JSON-ish data, no code.

### admin/sys/js/main.js (500 lines). Directives read: dropzone, copyText = 2. All OK.

| file:line | receiver | call | status | note |
|---|---|---|---|---|
| main.js:471, 478, 481 | `element` (copyText link) | `.text()` getter/setter | OK | |
| main.js:473 | `element` | `.on('click', ...)` no event fields read | OK | |
| main.js:285 | `$('form')[0]` | real jQuery | real jQuery | first `<form>` on page (Angular-rendered via ng-include), only used as `new FormData(node)`. Needs jQuery |
| main.js:170, 242, 254, 287 | `$.ajax`, `$.post` | real jQuery | needs jQuery |
| main.js:404-411 | `$('<div>')[0]`, `new Dropzone(element[0])` | OK | |

Admin templates (admin/index.html, sys/pages/*.html): only `ng-submit="$event.preventDefault();"` and inline `onclick="this.parentElement.parentElement.click()"` (native). No ng-template scripts. All OK.

### Other findings in this app (important)
- **public/index.html has its entire `<head>` duplicated** (lines 14-65 and 47-88): jQuery, angular, pannellum, popper, tippy, socket.io, utilities.js, toastr/dropzone ng-if scripts, and two `<title>`s are each in the file twice (grep: script tags at lines 33-39 and 72-78). Angular's second load bails ("Tried to load AngularJS more than once"), but the **second jQuery load replaces `window.$/jQuery` with a different instance** than the one Angular bound to (`angular.element === jQuery#1`, app `$` === jQuery#2). So today the app's `$` calls are already independent of Angular's jQuery, which means switching to jqLite changes nothing for the `$()` calls above, and `element` in link fns is jQuery#1 now -> jqLite later (only the break #1 and the find note matter). Pre-existing bug worth cleaning up regardless.
- index.html:17,20,56,59 `<script ng-if="!!debug" src=...>` / `<link ng-if>` in `<head>`: the originals have already executed at parse time (loaded unconditionally before angular). With jQuery bound, ng-if's `$animate.enter` -> jQuery `.after(clone)` goes through jQuery domManip, which *re-evaluates inserted external scripts* (sync XHR + globalEval; Dropzone/toastr run a second time when `?debug=true`). Under jqLite it is a native insertBefore of a cloned script flagged "already started" -> not re-run. Not breaking; slightly different (better).

---

## toolbox-podcast-player/public (sys/js/main.js 866 lines; index.html inline popups; sys/pages/*.html)

Directives read: progressBar, audio, volume, icon = 4. audio and icon OK; progressBar and volume BREAKING (see summary 2-4).

| file:line | receiver | call | status | note / fix |
|---|---|---|---|---|
| main.js:506-513 | `element` (progressBar) | `.on('touchstart mousedown', e => ...)`, `e.originalEvent`, `element.offset().left`, `element.width()` | **BREAKING** (DIFF event + MISSING x2) | fix: `let event = e.originalEvent \|\| e; let r = element[0].getBoundingClientRect(); temp = client.clientX - r.left; percentage = clamp(temp / r.width)` |
| main.js:526-531 | `$(document)` real jQuery handler; inside it `element.offset()`, `element.width()` on the jqLite `element` | **BREAKING** (MISSING x2) | same getBoundingClientRect fix. `e.originalEvent` on line 528 is OK (event is a jQuery event from real `$(document)`), but when fixing line 510 keep the `\|\| e` form consistent |
| main.js:537 | `$(document).on('touchend touchcancel mouseup')` | real jQuery | needs jQuery (or switch to document.addEventListener) |
| main.js:767-773 | `element` (volume) | `.on('touchstart mousedown', e => e.originalEvent.touches)` | **BREAKING** (DIFF event) | `let event = e.originalEvent \|\| e` |
| main.js:781-785, 793 | `$(document).on(...)` | real jQuery, `e.originalEvent` OK | needs jQuery. `percentageAt` uses `element[0].getBoundingClientRect()` (OK, native) |
| main.js:616, 628, 640, 649, 664 | `element` (audio) | `.on('play'/'pause'/'canplay'/'durationchange'/'timeupdate')` no event fields | OK | media events are native, jqLite listeners are native listeners (jQuery was too) |
| main.js:574, 610, 651 | `element[0]` | native audio props | NATIVE | |
| main.js:714-715 | `$(document).on('keydown', e => e.originalEvent.code)` | real jQuery | needs jQuery. (Registered once per audio link) |
| main.js:474, 293, 309, 476 | `$(window).on('resize')`, `$('.page').height()` | real jQuery | needs jQuery |
| main.js:864 | icon `attrs.src` | OK | |

Templates: index.html (inline speed/volume popups, `div[volume][ng-model]` on a plain div: ngModel link only registers a `blur` listener on a non-input, OK), sys/pages/{player,desktop-player,mobile-player,icon,loading,feed-not-found}.html. `$event.stopPropagation()` (mobile-player.html:53,75) native. `icon.html:1` `ng-include="'sys/img/icons/' + icon + '.svg'"`: SVGs contain `<style>`, `<defs>`, and (SpeedBtn-*.svg) an `<?xml ...?>` prolog; jqLite `.html()` and jQuery `.html()` both end up in innerHTML (jQuery routes `<style>` strings through append/buildFragment -> still innerHTML), prolog becomes a comment in both. No `<script>` in any. OK.

---

## si-photography-catalogue/public (sys/js/main.js 878 lines; pages header/home/modal; index.html)

Directives read: tooltip, copyTextButton, tippy, lazyImage = 4 (+ a commented-out progressBar). Only tooltip is non-OK.

| file:line | receiver | call | status | note / fix |
|---|---|---|---|---|
| main.js:684 | `element` (tooltip) | `.offset()` | **MISSING** (dead directive, unused in templates) | `let r=element[0].getBoundingClientRect(); {top:r.top+scrollY,left:r.left+scrollX}` |
| main.js:682, 690 | `element` | `.on('mouseover'/'mouseout')` event unused | OK | |
| main.js:711, 715 | `element` (copyTextButton) | `.on('click')`, `.on('blur mouseout pointerout')` | OK | tippy + `new ClipboardJS('.copy-text-button')` selector (clipboard.js, no jQuery) |
| main.js:706, 730 | `tippy(element[0])` | native | OK | |
| main.js:810, 837 | `el = element[0]`, `el.closest(...)` | native DOM `closest` | NATIVE | not jQuery |
| main.js:862 | `scope.$on('$destroy')` | scope event, not element | OK | |
| main.js:245, 262, 277 | `$('.wrapper').height()` | real jQuery | needs jQuery |
| main.js:259-266 | `$('[data-src=...]').offset()`, `$('.gallery').height()`, `$('.photo-wrapper').css(...).height()` | real jQuery over Angular-rendered DOM (read + inline style) | needs jQuery; no removal |
| main.js:295-321 | `$('.image-side')/.download-side` `.addClass/.removeClass/.css` | real jQuery on ng-include'd (static) modal DOM | needs jQuery. Sets inline style/classes only, no cleanData |
| main.js:398 | `$('.custom-scrollbar').animate({scrollTop:0},'slow')` | real jQuery plugin-ish (`animate`) | needs jQuery (animate is MISSING in jqLite so must stay real `$`) |
| main.js:601-602 | `m.scroller = $('.custom-scrollbar'); .on('scroll')` | real jQuery | needs jQuery. Note `.custom-scrollbar` is set via `ng-class` in index.html/home.html, 300ms timeout |
| main.js:382, 380-389 | `$(document.body).append(modal)` is stringified and run in `window.top` via postMessage (`_func`) | n/a to this page | executes in the toolbox top window, not audited here |
| main.js:346, 351 | inline `onclick="..._parent.remove()"` in a string | native | NATIVE |
| main.js:647, 656 | `document.addEventListener('mouseout'/'mouseover')` native, reads `e.relatedTarget` | NATIVE | |

Templates: `$event.preventDefault(); $event.stopPropagation()` (home.html:12, modal.html:53) native. `ng-include` of SVGs (`icon-favourite-filled.svg`, `sort-arrow.svg`) on divs, including `ng-include` + `ng-if` + `ng-class` on the same div (header.html:40,45): fine in jqLite. Attributes `off-tippy` / `off-ng-class` are deliberately disabled. No ng-template scripts.

---

## media-catalogue/public (sys/js/main.js 1388, photo-cache.js 94, 5 pages dirs of templates)

Directives read: tippy, clickToggle, sortDropdown, overlayIcons, cachedImage, cachedBg (shared `cachedPhotoDirective`) = 6. **All OK.** The app has zero `$()`/`jQuery`/`angular.element` uses (cleanest app in the set); it only touches the DOM through `document.getElementById/querySelector`, `element[0]`, `tippy(element[0])`, `URL.createObjectURL`.

| file:line | receiver | call | status | note |
|---|---|---|---|---|
| main.js:1266 | `$document` (jqLite-wrapped document) | `.on('click', onClick)` and `.off('click', onClick)` (1267) | OK | jqLite `off(type, fn)` supported. Handler reads only `event.target` (native) and `element[0].contains(...)` |
| main.js:1260 | `element[0].contains(event.target)` | native | NATIVE | |
| main.js:1336-1342 | overlayIcons `clickOverlayIcon(icon, $event)`: `$event.preventDefault(); $event.stopPropagation()` | native event from ng-click | OK | |
| main.js:376-380, 487-494, 1140 | `document.getElementById(...)`, `.addEventListener('scroll')`, `input.focus()`, `window.addEventListener('message')` | NATIVE | |
| main.js:1349-1352, 1368-1385 | `element[0].src`, `element[0].style.backgroundImage` | NATIVE | |

Templates (index.html, sys/pages, widgets, modals): `ng-mousedown/ng-focus/ng-blur/ng-change/ng-submit` (header.html), `ng-click="$event.stopPropagation()"` on checkboxes (add-to-collection.html:18,24), `click-toggle` on `<input type=checkbox ng-model>` (sortDropdown.html:8, share.html:30): all fine. `ng-include` + `ng-if` on the same div for pages and modals (index.html:29-40): fine; page swaps rely on ng-if/ng-include teardown (jqLite `remove()` also fires `$destroy` handlers and dealocs data, same as jQuery path).

---

## toolbox-pronunciation-guide/public (sys/js/main.js 464; components/dropdown-single-select; pages)

Directives read: player, videoPlayer, ngScroll, dropdownSingleSelect = 4. player and ngScroll BREAKING (summary 5, 6).

| file:line | receiver | call | status | note / fix |
|---|---|---|---|---|
| main.js:360 | `element` (player, templateUrl so template is already in) | `.find('.play-button')[0]` | **MISSING** (find with class selector -> empty) | `element[0].querySelector('.play-button')` |
| main.js:361 | `element` | `.find('.stop-button')[0]` | **MISSING** | `element[0].querySelector('.stop-button')` |
| main.js:362 | `element` | `.find('audio')[0]` | OK | tag name only |
| main.js:383, 409 | `playButton.onclick`, `stopButton.onclick` | follow-on from the undefined above (TypeError) | **BREAKING** consequence | native property assignment once the nodes are real |
| main.js:449 | `$element` (ngScroll) | `.bind('scroll', evt => ...)` | OK | `bind` alias supported; `scroll` doesn't bubble but is bound directly on the element |
| main.js:450 | `$element` | `.scrollTop()` | **MISSING** | `$element[0].scrollTop` |
| main.js:451 | `$scope.$eval(attrs.ngScroll, {$event: evt, ...})` | handler `scrollUpdate` reads `$event.target.scrollTop/clientHeight/scrollHeight` (main.js:73) | OK | native fields |
| dropdownSingleSelectModule.js:19-21 | `link(scope, element, attrs)` | none used on element | OK | |
| dropdown-select.html:7 | `<ng-include class="icon-caret-container" src="htmlPath + '/icon-caret.svg'">` | element-form ng-include | OK | |
| dropdown-select.html:2 | `ng-click="$event.stopPropagation(); ..."` | native | OK | |
| main.js:293-299 | `$('.tippy').not('.tippy-added').each(...)`, `$(el).addClass/.attr` and `tippy('.tippy-N', ...)` | real jQuery + tippy selector, over DOM produced by `ng-bind-html` (spans from nlToBr) | needs jQuery. No removals |
| main.js:180, 208 | `$.getJSON` | real jQuery | needs jQuery |
| main.js:54, 107, 138, 154, 166 | `document.getElementById(...).focus()/.scrollTop`, `document.getElementsByTagName('audio')` | NATIVE | |
| main.js:377-407 | `audioNode.onended`, `.load()`, `.play()` | NATIVE | |

Templates: home.html (302 lines): `ng-include` of Illustrator-exported SVGs with `<style>`, XML prolog and `<switch><foreignObject>`/`&ns_ai;` entities (e.g. `USQ Digital Learning Innovation Icons_additional_chevron.svg`): parsed through innerHTML in both jQuery and jqLite paths (same result; entities just yield parse warnings/comments). `ng-click="$event.stopPropagation()"` on `<player ng-if>` elements (home.html:124,152,187,231,296): native. `ng-scroll="scrollUpdate($direction, $event)"` home.html:82. `ng-tap` (item-selection.html:15) is not a defined directive (no-op, pre-existing). `<ng-include>` in dropdown, `ng-include` + `ng-repeat` on one div for info-popup (item-selection.html:8). player.html has `<audio>`, `.play-button`, `.stop-button` divs with ng-include'd SVGs.

---

## toolbox-inline-completion-tracker/public (+ config)

### sys/js/main.js (198 lines). Directive read: tooltip = 1. BREAKING (summary 7).

| file:line | receiver | call | status | note / fix |
|---|---|---|---|---|
| main.js:172 | `element` (tooltip) | `.on('mouseover', evt => ...)` evt unused | OK | |
| main.js:176 | `element` | `.offset()` | **MISSING** | rect = `element[0].getBoundingClientRect()`; `{left: rect.left + scrollX, top: rect.top + scrollY}` |
| main.js:177 | `element` | `.width()` | **MISSING** | `rect.width` |
| main.js:187 | `element` | `.on('mouseout')` | OK | |
| main.js:138 | `document.querySelector('.wrapper')` | NATIVE | |

Note the handler returns early (`m.mode === 'toolbox'`) before `.offset()`, so it only breaks in embedded (non-toolbox) mode. Template: index.html:44 `<a tooltip="{cell:cell, data:data}" ng-repeat ...>`. No ng-template, no SVG ng-include.

### config/sys/js/main.js (224 lines). Directive read: ilarCheckbox = 1. OK.

| file:line | receiver | call | status |
|---|---|---|---|
| main.js:170-171, 193 | `element` | `.attr('tabindex'/'role'/'aria-checked', v)` setters | OK |
| main.js:183 | `element` | `.on('click', toggle)` | OK |
| main.js:185-190 | `element` | `.on('keydown', e => e.key, e.preventDefault())` | OK (native `key`) |

`ilar-checkbox` element carries `ng-model` on a custom element and `transclude: true`, templateUrl `/editor-popups/sys/pages/ilar-checkbox.html` (resolved at toolbox/public/sys/pages/ilar-checkbox.html: a single `<div ng-class>`), no element API use. config/index.html: no `$event`, no ng-include.

---

## toolbox-gift-quiz-converter/public (sys/js/main.js 304, giftParser.js 908 (no Angular/DOM-element code), index.html)

Directives read: giftDropzone, giftFileInput, giftLogScroll, giftResizeObserver = 4. **All OK.**

| file:line | receiver | call | status | note |
|---|---|---|---|---|
| main.js:248 | `element` | `.on('click', () => input.click())` | OK | `input` is native `element[0].querySelector(...)`; `.click()` is native HTMLElement.click |
| main.js:250-259 | `element` | `.on('dragover'/'dragleave'/'drop', e => e.preventDefault())` | OK | |
| main.js:260-262 | `element` | `.on('drop', e => (e.originalEvent \|\| e).dataTransfer.files[0])` | OK | already guarded with `\|\| e`; native event carries `dataTransfer` |
| main.js:273-274 | `element` | `.on('change', ...)` then `element[0].files[0]` | OK | `<input type=file>` change is a native event; jqLite listener is native so it fires |
| main.js:286, 301, 246 | `element[0]` | NATIVE | |
| main.js:179-185 | `document.createElement('a')`, `a.click()` | NATIVE | |

No jQuery usage in this app's JS (jQuery is loaded but unused).

---

## course-development-reports/public (sys/js/main.js 884; index.html)

Directive read: customFilterModal (+ controller customFilterModalCtrl) = 1 directive + 1 controller + master controller. ui-grid library source NOT read (other auditor); only the app's usage. App has no cellTemplate/headerCellTemplate; it uses `filterHeaderTemplate` (4 columns) and `headerCellClass`, `cellFilter`, `footerCellFilter`, `aggregationType`, `uiGridConstants.filter.{CONTAINS,LESS_THAN,GREATER_THAN}`, `uiGridConstants.aggregationTypes.{avg,min,max}`, plain function filter conditions.

| file:line | receiver | call | status | note |
|---|---|---|---|---|
| main.js:843 | `angular.element(html)` where `html` is a template string with leading newline/tabs | jqLite constructor | OK | jqLite `trim()`s then requires leading `<` (verified src/jqLite.js:297-303); jQuery path was same |
| main.js:844 | `angular.element(document.body)` | `.prepend($modalElm)` | OK | jqLite prepend with a jqLite arg |
| main.js:846 | `$compile($modalElm)($scope)` | OK | no `.appendTo/.find` on result. Compiled content includes `ng-include` of an SVG (827, has `<style>`/xml prolog as in pronunciation guide: innerHTML either way) and `ui-grid="gridOptions" ui-grid-selection` (831) |
| main.js:862, 869 | `$modalElm` | `.remove()` | OK (jqLite) | jqLite `remove()` runs `jqLiteDealoc` which triggers `$destroy` event handlers on the element and descendants (ui-grid registers `elm.on('$destroy')`), same observable behavior as the jQuery-patched path. NOTE pre-existing: the directive's `$scope` is never destroyed, so ui-grid watchers/api for the closed modal stay alive until the filter header scope dies (same in both modes) |
| main.js:880 | `element` | `.attr('className')` getter | OK | attribute is parsed lowercase (`classname`), `getAttribute` is case-insensitive in HTML docs; jqLite and jQuery both return it |
| main.js:568-649 | `$.getJSON(...).fail(...)` | real jQuery | needs jQuery |
| main.js:6, 20 | controller is `async` arrow; `this.highlightFilteredHeader` binds to `window` (arrow `this`) | n/a | not element related |
| main.js:1 | `Sugar.extend()` | n/a | |

Template index.html:35: `<div ui-grid="gridOptions" ui-grid-pagination ui-grid-exporter ng-if="!loading">`. No `$event` except in the modal string (`ng-click="$event.stopPropagation();"`, line 824) -> native. Whether ui-grid itself works with jqLite-only is for the other auditor; flag: the ui-grid `ui-grid-exporter`/`resizeColumns`/`pagination` modules are loaded here and the page also loads jQuery, so any ui-grid code that uses `.is/.width/.height/.offset/.closest` on `angular.element` would be affected.

---

## course-development-checklist/public: **jQuery is NOT loaded** on this page (index.html:46 loads only angular), so it already runs on jqLite. 0 directives. sys/js/main.js uses only `document.getElementById/.querySelector`, `window.addEventListener('click', m.clickHandler)` (native, reads `event.target.attributes.href`), ResizeObserver. index.html has two `<script type="text/ng-template">` (progress-bar.html, progress-legend.html) used through `ng-include`; no `$event`, no element API. Nothing to change.

## toolbox-previews/public: **jQuery NOT loaded**; 0 directives; main.js only `document.querySelector` (lines 170, 200, 207) and ResizeObserver. Nothing to change.

## toolbox-course-roadmap/public: `sys/js/main.js`, `sys/pages/*`, `sys/css/*` are EMPTY directories (no files; index.html:106 references a missing `sys/js/main.js`). Cannot audit JS. Template-only observations: index.html uses `tippy` as an attribute directive on `.column-entry-circle-hidden` (line 69) that would be defined in the missing main.js; `ng-click="savePNG()"`, `toggleFullscreen()`; `off-ng-click` is disabled; loads `html2canvas` (works on native nodes). No `$event`, no ng-template, no ng-include. Loads jQuery.

## si-analytics/public: `sys/js/main.js` is MISSING (only public/index.html exists, index.js is the server). Template-only: `ng-click="changeView(views.byDate)"`, `<canvas id="myChart">` (Chart.js 2 reads the canvas via `document.getElementById`-style native, unless main.js wraps it in `$()`/`angular.element`, which cannot be checked). No `$event`. Loads jQuery.

---

## podcast-manager/html (sys/js/main.js 338; sys/pages/*.html; index.html). select2 directive (main.js:294-303) NOT audited per instructions.

Directives read: fileModel, tippy (+ select2 skipped) = 2 audited. Both OK.

| file:line | receiver | call | status | note |
|---|---|---|---|---|
| main.js:284 | `element` (fileModel) | `.bind('change', ...)` then `element[0].files[0]` | OK | native `change` event on `<input type=file>` reaches jqLite's native listener |
| main.js:333 | `$compile('<div class="tippy-content-page-X">' + html + '</div>')(scope)[0]` | `$compile(string)`, index `[0]` | OK | string starts with `<`; uses `[0]` only (no `.appendTo/.find`). The compiled node is handed to tippy as `content` (tippy appends it natively on show) |
| main.js:336 | `tippy(element[0], config)` | native | OK |
| main.js:319 | `eval('config = ' + attrs.tippy)` | n/a | not element related |
| main.js:298 | `element.select2({...})` (select2 directive) | **MISSING** (jQuery plugin on `angular.element`) | covered by the other auditor. Used at create-podcast.html:14,41; edit-episode.html:18; edit-podcast.html:12; upload-episode.html:23 |
| main.js:106-131 | `copyToClipboard(text, el)` uses `el.getAttribute/.innerText` | NATIVE | the only template caller (podcast.html:27, `$event.currentTarget`) is inside an HTML comment |

Templates: `ng-include` pages (index.html:65-66), `ng-init`, `tippy="{trigger:'click', page:'editor-drawer', interactive:true}"` (episode.html:3, podcast.html:3) which compiles sys/pages/editor-drawer.html containing `ng-click="delete(page, ...)"` (editor-drawer.html:2, native click). No dropzone in this app (despite the task hint). No ng-template scripts.

---

## Event semantics (all handlers registered on Angular-provided elements)

| file:line | events | fields read | verdict |
|---|---|---|---|
| toolbox-photospheres/public/sys/js/main.js:1092,1109 | click contextmenu | `preventDefault` | OK |
| toolbox-photospheres/public/sys/js/main.js:1161 | mousemove | `e.originalEvent.clientX/Y` | BREAKING |
| toolbox-photospheres/public/admin/sys/js/main.js:473 | click | none | OK |
| toolbox-podcast-player/public/sys/js/main.js:506 | touchstart mousedown | `e.originalEvent`, `.touches`, `.clientX` | BREAKING |
| toolbox-podcast-player/public/sys/js/main.js:767 | touchstart mousedown | `e.originalEvent`, `.touches`, `.clientX/Y` | BREAKING |
| toolbox-podcast-player/public/sys/js/main.js:616-664 | play pause canplay durationchange timeupdate | none | OK |
| si-photography-catalogue/public/sys/js/main.js:682,690,711,715 | mouseover mouseout click blur pointerout | none | OK |
| toolbox-pronunciation-guide/public/sys/js/main.js:449 | scroll (bind) | passes `evt` into expression; consumer reads native `evt.target.scrollTop` | OK |
| toolbox-inline-completion-tracker/public/sys/js/main.js:172,187 | mouseover mouseout | none | OK |
| toolbox-inline-completion-tracker/public/config/sys/js/main.js:183,185 | click keydown | `e.key`, `preventDefault` | OK |
| toolbox-gift-quiz-converter/public/sys/js/main.js:248-274 | click dragover dragleave drop change | `preventDefault`, `(e.originalEvent \|\| e).dataTransfer` | OK (already defensive) |
| media-catalogue/public/sys/js/main.js:1266 | $document click | `event.target` | OK |
| podcast-manager/html/sys/js/main.js:284 | change | none | OK |

No custom jQuery-namespaced events (`click.foo`) and no delegated `.on(type, selector, fn)` or `eventData` on any Angular element in these apps. Real-jQuery handlers on `$(window)`/`$(document)` (podcast-player 474, 526, 537, 714, 781, 793; photospheres 981; si-photography 602 via `$('.custom-scrollbar')`) read `e.originalEvent` safely because they are genuine jQuery events, but they need jQuery to stay loaded.
Template `$event` use (all native-safe): `preventDefault`/`stopPropagation` only, plus `$event.currentTarget` (commented out) and `$event` passed whole into `clickOverlayIcon`/`scrollUpdate`.

## Trigger / plugin

- No `.trigger()`, `.triggerHandler()`, `.change()`, `.click()` shortcut on any jQuery/jqLite object in any assigned app. `.click()` uses are native DOM (`input.click()` gift main.js:248, `a.click()` :184, inline `onclick="this.parentElement.parentElement.click()"` in photospheres templates, `this.parentElement...remove()` in si-photography string).
- jQuery plugin calls on Angular elements: only `element.select2(...)` (podcast-manager main.js:298, other auditor). Cross-reference for that auditor: those `<select select2 ng-model=...>` get their value into Angular through `ngModel`/select directive listeners registered with jqLite (native `addEventListener('change')`); select2 notifies with jQuery `.trigger('change')`, which does NOT reach native listeners, so ng-model would stop updating under jqLite unless select2 is changed to also dispatch a native `change`/`input` event.
- Other plugins used on non-Angular nodes (fine): Dropzone, tippy, pannellum, ClipboardJS, Chart.js, ResizeObserver all receive `element[0]`/selectors, no jQuery wrapper. jQuery `animate` used only on real `$` (si-photography main.js:398).
- `.scope()/.isolateScope()/.controller()/.injector()/.inheritedData()/.data('$...')`: **none** in any of these apps. No jQuery `.data()` use either.
- `window.parent.m.$watch/$root/installItem` cross-frame scope access (si-photography 637, inline-tracker 93-105, podcast-manager 146-154): relies on the toolbox page's `m`, not on element APIs.

## Lifecycle

- Real-jQuery DOM mutation over Angular-managed (ng-repeat/ng-if/ng-include/$compile) DOM where jQuery's patched `cleanData` currently fires `$destroy`: **none found** in these apps. The only `$().remove()` / `.empty()` calls are photospheres main.js:318 (`label.remove()` on a `<span>` the app itself created inside a pannellum hotspot div), :1222 (`$('.pnlm-fullscreen-toggle-button').remove()` on a pannellum-created node), and :1076 (`element.empty()` on the jqLite element, handled by jqLite). si-photography/pronunciation-guide `$()` uses are read/class/css/animate only.
- Photospheres hotspot scopes: pannellum builds and destroys the hotspot divs natively (removeChild), each is `$compile`d with `scope: true` children of `$rootScope`; scopes and jqLite handlers on them are never destroyed in either mode (pre-existing leak, no change under jqLite).
- course-development-reports modal: `$modalElm.remove()` OK (jqLite fires `$destroy` handlers); its `$scope` is not destroyed (pre-existing).
- ng-include'd SVGs containing `<style>`, `<defs>`, `<?xml?>` prolog, Illustrator `<switch><foreignObject>` + `&ns_ai;` entities (podcast-player icons, pronunciation-guide icons, course-development-reports modal icon): jQuery `.html()` falls to buildFragment for `<style>` strings, jqLite sets innerHTML; same DOM result; no `<script>` in any ng-included SVG (grep of all SVGs in the assigned apps). course-development-checklist/sys/img/icons/Icons_simple_watch.svg contains foreignObject but is not ng-included in that app.
- photospheres index.html ng-if'd `<script src>`/`<link>` in `<head>` and the duplicated head (see photospheres "Other findings").
- Apps that already run without jQuery (so serve as proof jqLite-only works for their patterns): course-development-checklist, toolbox-previews.

## Needs-jQuery inventory (real `$` used by the app itself; keep jQuery loaded or port)

| app | uses |
|---|---|
| toolbox-photospheres (viewer) | `$`, `$.ajax`, `.show/.hide/.prependTo/.appendTo/.remove/.addClass/.on` on pannellum DOM, `$(window).on('keypress')` |
| toolbox-photospheres admin | `$.ajax`, `$.post`, `$('form')[0]`, `$('<div>')[0]` |
| toolbox-podcast-player | `$(window).on('resize')`, `$(document).on(...)` x5, `$('.page').height()` |
| si-photography-catalogue | `$('.wrapper').height()`, `.offset()`, `.css()`, `.animate()`, `.addClass/.removeClass`, `.on('scroll')` |
| toolbox-pronunciation-guide | `$.getJSON` x2, `$('.tippy').not().each()` |
| course-development-reports | `$.getJSON` x6 |
| media-catalogue, toolbox-inline-completion-tracker (both), toolbox-gift-quiz-converter, podcast-manager, course-development-checklist, toolbox-previews | none |
| toolbox-course-roadmap, si-analytics | unknown (main.js missing) |
