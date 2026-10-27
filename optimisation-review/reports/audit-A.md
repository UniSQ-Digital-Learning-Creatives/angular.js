# Audit A: AngularJS directives/elements vs jqLite-only (angular.element never binds to jQuery)

Apps root: /mnt/109313D2109313D2/sync/www/work/apps. Paths below are relative to it.
Only non-OK items are tabled. Status: OK / DIFF / MISSING / NATIVE.

Cross-cutting findings (affect several apps):

1. **select2 directive (4 apps, ~16 `<select>`s) is the dominant breakage.** Two independent problems:
   a. `element.select2(...)` is MISSING on a jqLite object. The link throws a TypeError (`element.select2 is not a function`). The `<select>` silently stays a plain native select (still works through ng-model), but the enhanced UI is gone.
   b. Fixing (a) only with `$(element[0]).select2(...)` is WORSE, because it fails silently. select2 writes the choice with jQuery `$element.trigger('input').trigger('change')`. jQuery `.trigger('change')` only runs jQuery-registered handlers and the inline `onchange`. It does not call native `addEventListener` listeners, and `HTMLSelectElement` has no `.change()` method to fall through to. Angular's `select` directive (ngModel, ngOptions, ng-change) listens with `element.on('change')`. Under jqLite that is a native listener, so the model never updates and `ng-change` never fires.
   Proposed minimal app-side fix, one shared snippet in each select2 directive:
   ```js
   let el = element[0], $el = $(el)   // needs jQuery + select2 loaded, which they already are
   $el.select2(cfg)
   $el.on('select2:select select2:unselect select2:clear', () => el.dispatchEvent(new Event('change', {bubbles: true})))
   ```
   Use the `select2:*` events, NOT `change`, to avoid a loop. jQuery listens to native events too.
   Also: when Angular removes the select, jQuery's patched cleanData no longer runs, so select2 instance data and `.select2-container` siblings are not cleaned. See Lifecycle.
2. **Real jQuery stays required** for several bare `$(...)` calls on non-Angular DOM (listed per file). Harmless as long as jQuery is still loaded on the page. All pages except toolbox-group-discussion (cash) and status-dashboard / public-admin (nothing) load jQuery 3.x today.
3. **Event objects.** Only one handler reads jQuery-only event fields (`e.originalEvent` in toolbox-reaction-bar, on `$(window)`, not an Angular element). Everything else reads native-compatible fields.

---

## toolbox/public

Read: toolbox/public/sys/js/main.js (all 3472 lines scanned for `$(`, angular.element, `$event`, `.on/.bind/.find/.trigger/.scope()` etc.), colour-dots.js, powerUser.js, content-template-access-modal/main.js, index.html, all 49 sys/pages/*.html, content-template-access-modal/index.html.
Directives read: main.js 10 (fetchJson, scope, tbCard, dropzone, previewTemplate, tippy, ilarFileSelect, ilarCheckbox, select2, tbDropdown) + objectFilter filter; colour-dots.js 1 (colourDots); content-template-access-modal/main.js 1 (ilarCheckbox). powerUser.js has no directives (window listeners only). All others OK. `angular.element`, `$compile(...)(scope)`, `$document`, `$rootElement`, `.scope()`/`.controller()`/`.injector()`/`.inheritedData()` are never used in these files.

| file:line | receiver | call | status | note / fix |
|---|---|---|---|---|
| toolbox/public/sys/js/main.js:2814 | `element` (select2 directive, link) | `.select2({tags})` | MISSING | BREAKING. Link throws. Used by `<select select2>` in sys/pages/podcast-player.html:12 (ng-model podcastID, ng-change rebuilds rss) and :25 (episode, ng-disabled). See cross-cutting #1; both the `$(element[0])` wrap and the `change` bridge are needed. ng-change at podcast-player.html:12 would never fire otherwise. |
| toolbox/public/sys/js/main.js:2363 | `element` (tbCard) | `.attr('ts', ts)` | OK | Setter. Read back at :484 through jQuery `e.attr('ts')`, which reads the real attribute. |
| toolbox/public/sys/js/main.js:2755 | `element` (ilarFileSelect) | `.on('change', e => e.target.files)` | OK | Native event, `e.target.files` native. |
| toolbox/public/sys/js/main.js:2779 | `element` (ilarCheckbox) | `.on('click', ...)` | OK | No event fields read. Same code in content-template-access-modal/main.js:140. |
| toolbox/public/sys/js/main.js:479,483,484,494,496,497,505 | `$('.customScrollbar.page.page-main')`, `$('.tb-card.active')`, `$(el)`, `$('.tb-card-preview-wrapper.active')` | `.each`, `.attr`, `.find`, `.text`, `.offset().top`, `.animate({scrollTop})`, `.scrollTop()`, `.height()`, `.length` | NATIVE-jQuery | Real jQuery on ng-repeat-rendered DOM (m.hidePreview). Works only while jQuery is loaded. Fix if jQuery is dropped: querySelector plus `el.getBoundingClientRect().top`, `scroller.scrollTo({top, behavior:'smooth'})`. |
| toolbox/public/sys/js/main.js:743,744,745 | `$('.tippy')` (spans from ng-bind-html) | `.not().each()`, `.addClass`, `.attr` | NATIVE-jQuery | Needs jQuery. `.not('.x')` is MISSING in jqLite. Replace with `document.querySelectorAll('.tippy:not(.tippy-added)')`. |
| toolbox/public/sys/js/main.js:757 | `$('.customScrollbar')` | `.each((i, el) => el.scroll(0,0))` | NATIVE-jQuery | Needs jQuery. |
| toolbox/public/sys/js/main.js:2395 | `$('<div>')[0]` | creates a node for Dropzone `previewsContainer` | NATIVE-jQuery | Needs jQuery. Fix: `document.createElement('div')`. |

Trivial pages: sys/pages/*.html use `$event` only in index.html:100 and :103 (`$event.stopPropagation(); $event.preventDefault()`, native OK). No inline `<script>`, no ng-template scripts. feedback.html:6 uses a native `onclick="this.parentElement.click()"` (NATIVE, fine). The `dropzone` class directive (main.js:2372) does `new Dropzone(element[0])`, which is OK.

---

## toolbox-3d-model-viewer/public

Read: sys/js/main.js (976 lines; all directive code 633-976; rest scanned), index.html (inline `document.write` loader for select2/dropzone/toastr/spotlight when `?editing=true`), sys/pages/*.html (8 files).
Directives: 8 (modelViewer, newModel, ngError, ngLoad, ngNoteImage, newImages, select2, tippy). All others OK. All use `element[0]` natively or no element at all. Dropzone is created with a CSS selector string (Dropzone's own querySelector), which is fine.

| file:line | receiver | call | status | note / fix |
|---|---|---|---|---|
| toolbox-3d-model-viewer/public/sys/js/main.js:871 | `element` (select2 directive) | `.select2(config)` | MISSING | BREAKING (editing mode only, select2 is loaded only for `?editing=true`). Selects in sys/pages/edit-annotation-modal.html:17 (annotation.type), :29 (annotation.icon, inside ng-if, `data-template=formatIcons`), :39 (alignment). The change-to-ngModel bridge breaks too (cross-cutting #1). The :29 select sits in an ng-if, so jQuery data and the `.select2-container` sibling are not cleaned on removal. |
| toolbox-3d-model-viewer/public/sys/js/main.js:857 | `$('<span ...>')` | returned to select2 as templateResult | NATIVE-jQuery | Needs jQuery (select2 itself needs it). |
| toolbox-3d-model-viewer/public/sys/js/main.js:922 | `$compile(html)(scope)[0]` | `[0]` only | OK | Compiled nodes are handed to tippy and never destroyed (pre-existing leak, not jqLite related). |

`$event`: none. `ng-click="tippy.hide()"` etc. are plain scope calls. tippy is `tippy(element[0], ...)`, OK.

---

## toolbox-group-discussion/public and public-admin

Note: public/index.html loads cash-dom 1st (`$` = cash) then angular, with no jQuery, so Angular is already on jqLite today. public-admin loads neither.
Read: public/sys/js/main.js (1389 lines, directives 1146-1376, `$()` uses throughout), public/index.html, public/sys/pages/panel.html (unreferenced; dead file), public-admin/sys/js/main.js (no directives; `goToPage($event)` native), public-admin/index.html and sys/pages/*.html.
Directives: public 5 (tippy, likedIcon, mcpTextarea, mcpImageInput, contenteditable); public-admin 0. All are OK under jqLite (they already run on it). No non-OK items that break.

What only works because of cash or native (watch these if cash is ever removed):

| file:line | receiver | call | status | note |
|---|---|---|---|---|
| toolbox-group-discussion/public/sys/js/main.js:42,43,50,537,538,736,761,791,1018,1023 | `$('<css selector>')` / `$('#mcp-id')` (cash) | `[0]` then native `.click()/.focus()/.blur()/.selectionStart` | NATIVE (cash) | Cash is used only as a `querySelector` replacement. Every call is `$(sel)[0]` or a native method on the result. Would break only if `$` were removed. Easily replaced by `document.querySelector`. |
| toolbox-group-discussion/public/sys/js/main.js:1252,1256,1300,1324,1356 | `element` (mcpTextarea, mcpImageInput, contenteditable) | `.on('input')`, `.on('keydown')` (reads `e.which`, `e.shiftKey`, `preventDefault`, `stopPropagation`), `.on('paste')` (`e.clipboardData`), `.on('change')`, `.on('blur keyup keydown change')` | OK | Native event objects. `e.which` is still populated for keydown in browsers. `clipboardData` is native-only, which is correct under jqLite (jQuery would have needed `originalEvent`). |
| toolbox-group-discussion/public/sys/js/main.js:1352,1363 | `element` (contenteditable) | `.html(x)` / `.html()` | OK | |
| toolbox-group-discussion/public/sys/js/main.js:1361-1371 | contenteditable directive | `read();` called before `let read = ...` | BUG (unrelated) | Temporal-dead-zone ReferenceError, but the directive only matches `contenteditable` + ng-model, used only in the unreferenced pages/panel.html. Dead code. |
| toolbox-group-discussion/public/sys/js/main.js:185-190 | `toggleReactionPicker(row, $event)` from index.html:180 | `event.currentTarget` | OK | Read synchronously inside the ng-click handler, so it is valid in jqLite and jQuery alike. |
| toolbox-group-discussion/public/sys/pages/panel.html:35-51 | `addEmoji(..., $element)` | `$element` is not an expression-scope variable, so it is always `undefined` | n/a | Dead file. |

---

## toolbox-reaction-bar/public

Read: sys/js/main.js (403), dashboard/sys/js/main.js (303), index.html, modal.html, injector.html, dashboard/index.html, dashboard/sys/pages/*.html, init.js (vanilla, deprecated).
Directives: tooltip (main.js:374), percentage + chart (dashboard main.js:182,198; progressBar is commented out). 3 total; percentage and chart OK (`Chart(element[0])`).

| file:line | receiver | call | status | note / fix |
|---|---|---|---|---|
| toolbox-reaction-bar/public/sys/js/main.js:387 | `element` (tooltip directive, inside the mouseover handler) | `.offset()` | MISSING | BREAKING. On every mouseover of the reaction thumbs, `element.offset()` throws, so `showTooltip` is never posted to the parent. Used from index.html:51,57,63 and injector.html:35,41,47. Fix: `(r => ({top: r.top + scrollY, left: r.left + scrollX}))(element[0].getBoundingClientRect())`. jQuery `.offset()` returns document-relative `{top,left}`. Check whether the parent's `showTooltip` expects the iframe-relative or the document-relative value (same thing in an iframe with no scroll). |
| toolbox-reaction-bar/public/sys/js/main.js:385,394 | `element` | `.on('mouseover'/'mouseout', evt => ...)` | OK | `evt` is not read. |
| toolbox-reaction-bar/public/sys/js/main.js:245-256 | `$(window)` | `.on('storage', e => e.originalEvent.storageArea/.newValue/.key)` | NATIVE-jQuery / jQuery-only event | Reads `e.originalEvent`, which exists only on jQuery.Event. Fine while real jQuery's `$` is used. It would break (`originalEvent` undefined) if `$` became `angular.element`. |
| toolbox-reaction-bar/public/sys/js/main.js:300-301 | `$(window)` | same (`e.originalEvent.storageArea`, `.key`) | same | |
| toolbox-reaction-bar/public/dashboard/sys/js/main.js:158 | `$(window)` | `.on('hashchange')` | NATIVE-jQuery | Needs jQuery. Fix: `window.addEventListener`. |

Note for injector.html: it loads its own jQuery and angular from `{originroot}` into the host page. Out of scope here, but it means the "angular never uses jQuery" change must be paired with a check that `$` there is not relied on by the host.

---

## toolbox-notes/public

Read: sys/js/main.js (782), yjs-tinymce-binding.js (927, grep-scanned for jQuery/angular/DOM use; vanilla TinyMCE API only), index.html.
Directives: 0 (no `.directive` anywhere). TinyMCE is created from the controller (`tinymce.init({selector:'#notes-editor-textarea'})`, main.js:156), with no Angular element wrapper. It uses TinyMCE's own `editor.on(...)` (not jQuery; `editor.on('click', e => e.target.closest)` is native). No `$()` or `angular.element` use. `$event` only at index.html:192 (`$event.key === 'Enter'`, native OK).
No non-OK items. One caveat only: the `<textarea id="notes-editor-textarea">` must exist in the DOM when `tinymce.init` runs (existing; not related to jQuery).

---

## toolbox-suggest-feature/public, toolbox-sample-app/public

suggest-feature: 1 directive (suggestionDescription, main.js:154; `new ResizeObserver(...).observe(element[0])`, OK). sample-app: 0 directives. No `$()`, no `$event`. Nothing non-OK.

---

## si-manager/public/toolbox-feedback, status-dashboard

status-dashboard: 0 directives, no jQuery loaded, nothing. toolbox-feedback: 1 directive (`stars`), BREAKING.

| file:line | receiver | call | status | note / fix |
|---|---|---|---|---|
| si-manager/public/toolbox-feedback/main.js:97 | `element` (stars) | `.find('.stars-filled .star')` | DIFF (returns empty) | jqLite `find` is by tag name only, so this yields an empty set. Fix: `[...element[0].querySelectorAll('.stars-filled .star')]`. |
| si-manager/public/toolbox-feedback/main.js:100,115,144 | `filledStars` | `.each((i, el) => ...)` | MISSING | Throws TypeError at link time (line 100), so no handler is ever attached and the star rating is dead. Use `forEach`. |
| si-manager/public/toolbox-feedback/main.js:110,172 | `element` | `.position().left` | MISSING | `element[0].getBoundingClientRect().left` (the current code is position relative to the offset parent; if the wrapper is the offset parent the delta is the same, else use `e.offsetX`). |
| si-manager/public/toolbox-feedback/main.js:111,173 | `element` | `.width()` | MISSING | `element[0].getBoundingClientRect().width`. |
| si-manager/public/toolbox-feedback/main.js:106,142,170 | `element` | `.on('mouseover mousemove')`, `.on('mouseout')`, `.on('click')` (read `e.clientX`) | OK | Native `clientX`. |
| si-manager/public/toolbox-feedback/main.js:101-103,116-118,145-147 | `filledStars[i]` | `.style.opacity` | NATIVE (only if the collection is a real array/node list) | OK once `find` is replaced. |

---

## si-studydesk-styles/website

Read: sys/js/main.js (469), index.html, sys/pages/*.html (5). Directives: 1 (monaco, main.js:371): `monaco.editor.create(element[0], ...)` and `element[0].style.height`, `.clientWidth`, all native, OK. Everything else OK. `$event`: none. `window.parent.m` cross-frame use is unrelated. No non-OK items.

---

## si-admin/public

Read: sys/js/main.js (406), index.html, sys/pages/*.html (3). Directives: 1 (select2, main.js:361). All other items OK.

| file:line | receiver | call | status | note / fix |
|---|---|---|---|---|
| si-admin/public/sys/js/main.js:370 | `element` (select2, in a `setTimeout` after `$root.ready`) | `.select2({templateResult, placeholder})` | MISSING | BREAKING. Uncaught error inside the setTimeout. It affects the selects at sys/pages/manage-access.html:18,23,44 and sys/pages/toolbox.html:27,32 (ng-model + ng-options: `$root.selectedGroup`, `$root.addEditor`, `$root.addCourse`). Even when wrapped with `$(element[0])`, the choice never reaches ng-model (cross-cutting #1), and the Add buttons (`addToGroup($root.addEditor, ...)`) would read a stale `null`. |
| si-admin/public/sys/js/main.js:25 | `$('<div>…</div>')` | `.text()` | NATIVE-jQuery | Needs jQuery. Fix: `new DOMParser().parseFromString(title,'text/html').body.textContent`. |
| si-admin/public/sys/js/main.js:144,155 | `$('<span class="dropdown-entry">…</span>')` | returned to select2 as templateResult | NATIVE-jQuery | Needs jQuery (select2 does anyway). |

Other: index.html:14,17 has `<script ng-if="debug" src=...>` (Angular `ng-if` on script tags in head, outside the app; harmless, no change).

---

## podcast-manager/html

Read: sys/js/main.js (338), index.html, sys/pages/*.html (13). Directives: 3 (fileModel main.js:278, select2 :294, tippy :305).

| file:line | receiver | call | status | note / fix |
|---|---|---|---|---|
| podcast-manager/html/sys/js/main.js:298 | `element` (select2) | `.select2({tags})` | MISSING | BREAKING. Selects: sys/pages/upload-episode.html:23 (presenter, tags:true, ng-init), edit-episode.html:18 (presenter, tags:true), create-podcast.html:14 (school, `required`), :41 (owner), edit-podcast.html:12 (school). With tags:true the user-typed new option never reaches ng-model, and `required` validation on school depends on ng-model. Same two-part fix (#1). |
| podcast-manager/html/sys/js/main.js:284 | `element` (fileModel) | `.bind('change', ...)` then `element[0].files[0]` | OK | `bind` is supported by jqLite. The change event comes from a native `<input type=file>`. |
| podcast-manager/html/sys/js/main.js:333 | `$compile(html)(scope)[0]` | `[0]` | OK | |
| podcast-manager/html/sys/pages/podcast.html:27 | `$event.currentTarget` | passed to `copyToClipboard(text, el)` (main.js:106) | OK | Native DOM node, read synchronously. |

---

## Event semantics

- Handlers on Angular elements: toolbox 2755 (`e.target.files`), 2779 (none); content-template-access-modal 140 (none); group-discussion 1252/1256/1300/1324/1356 (`e.which`, `e.shiftKey`, `e.clipboardData`, `preventDefault`, `stopPropagation`); reaction-bar 385/394 (none); toolbox-feedback 106/142/170 (`e.clientX`); podcast-manager 284 (none). All read native-compatible fields. None use `originalEvent`, `.data`, namespaces (`click.foo`), delegation or `e.isDefaultPrevented()`.
- jQuery-only event reads: only toolbox-reaction-bar/public/sys/js/main.js:246,250,254,301 (`e.originalEvent.*`) on `$(window)`. This is plain jQuery, not Angular. It is fine as long as jQuery is loaded and `$` stays jQuery. Native alternative: `window.addEventListener('storage', e => e.storageArea ...)`.
- `$event` in templates: toolbox index.html:100,103; group-discussion index.html:180,187,210,230 (`stopPropagation/preventDefault`, `currentTarget`); public-admin discussion.html:11 (`preventDefault`); notes index.html:192 (`.key`); colour-dots.js template (`ng-keydown="keydown($event, colour)"`, reads `e.key`, `e.preventDefault`); podcast-manager podcast.html:27 (`currentTarget`). All native OK. Under jqLite ng-click receives the native event.
- `e.which`: group-discussion/public/sys/js/main.js:585,1260,1267,1274,1281,1291 (all keydown; works natively).

## Trigger / plugin

- **select2 + ng-model/ng-change is the only trigger-style dependency** (listed above; fix = bridge `select2:select|unselect|clear` to a native `change` event dispatch). Listener registration: Angular's `select` / `ngOptions` directive registers `element.on('change')` (native under jqLite); select2 fires with jQuery `trigger('input').trigger('change')`. The reverse direction (programmatic ng-model to select2 display) does not use triggers; select2 picks up option mutations itself (MutationObserver), which is unchanged.
- No code in these files calls `.trigger()`, `.change()`, `.val(x).change()` or `.click()` on an Angular element. The only `.click()` is the native `$('.mcp-image-input')[0].click()` (group-discussion main.js:791, native on a DOM node).
- Other jQuery plugins on Angular elements: none (tippy, Dropzone, Chart.js, monaco, TinyMCE, model-viewer, popper are all vanilla and are given `element[0]`).
- jQuery plugin APIs on non-Angular nodes: toolbox main.js:496 `.animate` (jQuery core).

## Lifecycle

- No `$(...).remove()/.empty()/.html(x)/.replaceWith()/.detach()` on Angular-managed DOM anywhere in these files. The jQuery calls are limited to read/scroll/addClass (toolbox main.js:479-505, 743-757) and creating detached nodes. Native `.remove()` (toolbox main.js:1680,1774,1881,3171,3227) acts on nodes the app built itself.
- Under jqLite-only, Angular no longer goes through jQuery's patched cleanData. Consequences: (a) select2 instances (jQuery data + `.select2-container` sibling span + jQuery-bound listeners) on `<select>` inside ng-if/ng-include/ng-repeat (3D viewer edit-annotation-modal.html:29 within ng-if; toolbox podcast-player.html page swaps; podcast-manager pages swapped through ng-include) are cleaned up by neither mechanism. The sibling span is orphaned already today if the parent isn't removed. (b) `$destroy` still fires for jqLite-removed nodes, so `scope.$on('$destroy')` handlers (toolbox tbDropdown, colourDots; group-discussion tippy) are unaffected.
- `$compile(html)(scope)` is used only in tippy directives (3d-viewer main.js:922, podcast-manager main.js:333) and indexed `[0]`; no `.appendTo/.find('.sel')` on the result.

## Summary of directive counts

toolbox 12 (10 + colourDots + modal ilarCheckbox), 3D viewer 8, group-discussion 5, reaction-bar 3, notes 0, suggest-feature 1, sample-app 0, toolbox-feedback 1, status-dashboard 0, studydesk-styles 1, si-admin 1, podcast-manager 3 = 35 directives. 6 are BROKEN: 4 select2 directives (toolbox, 3d-viewer, si-admin, podcast-manager), 1 tooltip (reaction-bar, `.offset()`), 1 stars (toolbox-feedback, find/each/position/width).
