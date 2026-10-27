# Audit B: toolbox-generators/public (jqLite-only Angular binding)

Root: `/mnt/109313D2109313D2/sync/www/work/apps/toolbox-generators/public`. Shared scripts these pages load from other apps were read too:
`/utilities.js` (= `si-manager/public/utilities.js`), `/editor-popups/sys/js/icons.js` (= `toolbox/public/sys/js/icons.js`, pure data `_ICONS`),
`/ilar-toolbox/sys/js/colour-dots.js` and `powerUser.js` (= `toolbox/public/sys/js/`). None of them reference `$`, `jQuery` or `angular.element`.
`colour-dots.js` declares `link: (scope, element, attrs)` but never touches `element`. `powerUser.js` never touches an element either.

Lines are from the working tree today and were checked with grep -n / Read.

Legend: OK, DIFF, MISSING, NATIVE as in the spec. "needs-$" means the call is real jQuery (`$()`), which still works if the jQuery script stays loaded, but is a hard dependency on the script tag.

---------------------------------------------------------------------------
## 0. Headline results

1. The three student-facing embed pages (buttons-and-tiles/embed.html, cards/embed.html, counter-button-editor/embed.html) do not reach a single jQuery call, guarded or not. Details in section 1. The only `$` / `$.get` / `jQuery` references in the shared `main.js` files sit in code that can only run when `m.editing` is true (b&t, cards) or in a directive whose class never appears in `embed.html` (counter). There are no `typeof $` / `window.jQuery` guards anywhere; the protection is structural.
2. Jqlite-only binding breaks (BREAKING, editors only):
   - `counter-button-editor/sys/js/main.js:243-244` `element.find('.inc-button' | '.dec-button')` returns empty under jqLite (find is tag-name only), so the +/- steppers are silently dead.
   - `tables/sys/js/main.js:636-637` same code in `ilarNumberInput`, used at `tables/index.html:81,85` (Columns/Rows steppers dead). `introduction-text/sys/js/main.js:293-294` has the same copy, but `<ilar-number-input>` is not used in that page.
   - `profile-image-generator/sys/js/main.js:683` `element.closest('svg')[0]` (MISSING in jqLite): TypeError on every wheel-zoom.
   - `banner-generator/sys/js/main.js:355` `e.originalEvent.key`: jqLite hands the native event, `originalEvent` is undefined, TypeError once the contenteditable has 3 or more `div` children (short-circuit on `divCount.length > 2`). banner-generator is the "superseded but frozen" app.
3. Everything else on Angular-provided elements is OK or native (see per-file tables).
4. Pages whose jQuery `<script>` can go with zero code change today: introduction-text, rive-player-editor, rive-player. rive-player/index.html is itself student-facing (it is the page the rive iframe loads) and loads jQuery for nothing (section 3).
5. @shopify/draggable and tippy are used with native DOM nodes only; neither touches Angular element wrappers, so neither cares which library angular.element is (section 4).

---------------------------------------------------------------------------
## 1. The three embed pages: exactly which code runs

All three `embed.html` files load: `/node_modules/angular/angular.min.js`, (b&t and cards only) `/editor-popups/sys/js/icons.js`, `/utilities.js`, then `sys/js/main.js`. No jQuery, no draggable, no popper, no tippy, no colour-dots, no powerUser. Confirmed with grep -n '<script' on each file (buttons-and-tiles/embed.html:24-26,52; cards/embed.html:24-26,52; counter-button-editor/embed.html:22-23,89).

`m.editing` is `location.pathname.split('/').pop() !== 'embed.html'` (b&t main.js:42, cards main.js:40). On embed it is false. (A URL that did not end in `embed.html` would flip it to true and the page would already be dead on `window.parent.m.$root...`, independent of jQuery.)

### 1a. buttons-and-tiles/sys/js/main.js on embed.html (editing === false)

Runs:
| lines | what | needs jQuery? |
|---|---|---|
| 5-12 | `colourDots` try/catch: `angular.module('toolboxColourDots')` throws "nomod" (module not loaded), caught, returns `[]` | no |
| 15-130 | controller scope set-up: getQuery, `window.frameElement`, try/catch on `window.parent.m.params.id`, themes, icons (`_ICONS`), `document.querySelector('.generated-data')` (null on embed, only editor fns use it), `formatDate` | no |
| 131-152 `repaintButtons` | `document.querySelector(All)`, `style.transform`, `requestAnimationFrame`, `offsetHeight` | no (native) |
| 321-373 `clampFocus / isFocusCentred / applyFocus / focusSlack` | `img.style.setProperty(..., 'important')` native (this is why they bypass `.css()`) | no |
| 375-445 `toCompressedData`, 447-583 `fromCompressed`, 585-606, 797-848 helpers | pure JS | no |
| 664-680 `loadDataFromName` | non-editing branch reads `window.name` (line 672) | no |
| 853-869 `fetchActivity(...)` callback | `m.user/...`, `reportAnalytics`; gallery load at 865 is skipped because `m.mode === 'embed'` | no |
| 881-910 `window.addEventListener('message', ...)` | colour recolour; `e.origin`, `e.data` | no |
| 913-919 `if (window.name)` | `await m.loadDataFromName()` | no |
| 950-976 ResizeObserver on `.wrapper` | `setILARSize`, `m.selfIframe.style.height`, `repaintButtons` | no |
| 1141-1160 `storage` + `keydown` window listeners | native | no |
| directive `tileFocus` 1387-1405 | `element[0]` only; `$watch` branch (1397) skipped since not editing | no |

Does not run (and where the `$` lives):
| lines | what | why unreachable on embed |
|---|---|---|
| 1085 `$compile(await $.get('sys/pages/save-as-template-popup.html'))(m)[0]` | save-as-template tippy | inside the `else` (978-1134) of `if (!m.editing)` at 950, and also `m.rawMode !== "banners"` and inside `setTimeout` (991) |
| 1335 `content = $compile(await $.get('sys/pages/edit-...-popup.html'))(scope)[0]` | overlay popups | inside `overlayButton.link` after `if (!m.editing) return` at 1216-1218. Also `overlay.html` is only ng-include'd under `ng-if="editing"` (themes/*.html), so the directive is never even instantiated |
| 240 `new Draggable.Sortable` (postSync) | drag reorder | only reachable through `syncItemOrder` (217 delete button, 1179 editing-only theme watch). `Draggable` / `tippy` globals do not exist on embed |
| 1245 `tippy(...)`, 1087 `tippy(...)` | popups | same as above |
| 1166 `window.powerUser?.follow` | editing only (1165) |
| 1172-1208 `$watch`es | editing only |
| directives `overlayFocus` (1410, early `return` 1415-1417), `lazyRender` (1556), `loadMoreOnVisible` (1580), `ilarCheckbox` (1628), `ngTemplatePreview` (1609, unreferenced anywhere, dead) | none appear in embed.html or in the non-preview themes `standard-button / large-button / tile / no-theme.html` |

Only `$`-family tokens in the entire file: lines 1085 and 1335 (`$.get`), `$compile` (angular service, not jQuery). `grep -n -E '\$\(|jQuery|\$\.'` finds nothing else.

### 1b. cards/sys/js/main.js on embed.html (editing === false)

Same shape. Runs: 5-12, 15-~300 scope set-up, 401-692 encode/decode/aria helpers, 736-752 `loadDataFromName` (744 is the `window.name` branch), 877-892 `fetchActivity` (888 gallery load skipped, mode is 'embed'), 904-933 `message` listener, 936-942 `window.name` load, 973-999 ResizeObserver, 1154-1173 `storage` / `keydown` listeners, directive `cardFocus` 1405-1423 (`element[0]` only), and `m.toggleFlip` / `flipKeydown` (230-253) from `flip-card.html:10-11` (`ng-click="toggleFlip(card, $event)"`, `ng-keydown="flipKeydown(card, $event)"`). `toggleFlip` calls `event.target.closest('.toolbox-card-link')` (236): NATIVE (`event.target` is a DOM Element, `.closest` is the DOM method; jqLite already hands the native event to ngClick).

Does not run: `$.get` at 1106 (editing `else` branch of 1001, plus `setTimeout` 1008) and 1355 (`overlayButton.link` after the early return at 1227-1229); `Draggable` at 266; `tippy` at 1108 and 1256; `overlayFocus` (1429, early return 1434-1436); `lazyRender` / `loadMoreOnVisible` (editor gallery only); `$watch`es 1187-1219 (editing only).

### 1c. counter-button-editor/sys/js/main.js on embed.html

Runs: 5-12 colourDots try/catch; controller 17-218 with `m.mode = getQuery('mode')` = null on embed, so the `else` at 175-185 runs (`requestAnimationFrame` -> `setScale` -> `window.addEventListener('resize')`); the toolbox-mode `$watch`es (164-174) and `updateExportCode` (118-147, the only code that touches `window.parent.m`) are not registered; 188-206 `message` listener (reads `e.data.toolboxColour`); 210-215 ResizeObserver. Config blocks 221-232.

Directive `incDecButtons` (restrict 'C', 235-298) is registered but `embed.html` contains no element with class `inc-dec-buttons` (grep: zero matches in embed.html; it appears 6 times in index.html:50-118). So its link never runs on embed, which means line 243-244 (`element.find('.inc-button')`), 253/272 (`inc.on`/`dec.on`) and 291-293 (`$(window).on(...)`) never execute there.

### 1d. Verdict

None of the three embed pages needs jQuery. The `{{...}}` bindings, `ng-if`, `ng-repeat`, `ng-include`, `ng-class`, `ng-href`, `ng-click`, `ng-keydown`, `ng-src`, `ng-attr-*`, `orderBy` and the `link: (scope, element)` bodies that do run use only Angular core plus `element[0]`. The only way these pages could pull in jQuery would be someone adding a `$()` outside an `m.editing` / class guard in a shared function.

---------------------------------------------------------------------------
## 2. Per-file tables (non-OK items only)

Columns: `file:line | receiver | call | status | note / fix`

### buttons-and-tiles/index.html + sys/js/main.js + sys/pages + sys/themes
Read: controller, 7 directives (`overlayButton`, `tileFocus`, `overlayFocus`, `lazyRender`, `loadMoreOnVisible`, `ngTemplatePreview` [dead], `ilarCheckbox`), 9 theme partials, 8 page partials, index.html. All other directives / Angular-element calls OK.

| file:line | receiver | call | status | note / fix |
|---|---|---|---|---|
| main.js:1085 | global `$` | `$.get(url)` | needs-$ | `await get(url)` (global from /utilities.js:96, fetch based, resolves raw text, rejects `{status,error}` on non-2xx like `$.get`) |
| main.js:1335 | global `$` | `$.get(url)` | needs-$ | same replacement |
| main.js:1369,1373 | `element` (overlayButton) | `.off('mouseenter touchstart', prime)`, `.on('mouseenter touchstart', prime)` | OK | jqLite supports space-separated types, mouseenter via mouseover wrapper (jqLite.js:152,382,958); off(type, fn) removes both the alias and the mouseover entry |
| main.js:1378 | `element` | `.on('click', fn)` | OK | handler ignores event |
| main.js:1641 | `element` (ilarCheckbox) | `.on('click', fn)` | OK | |
| b&t/index.html:136 | ng-change expr | `document.querySelector('#themePlaceholder').remove()` | n/a | `document` is not on the scope, Angular expressions evaluate it to undefined, so this is a silent no-op today; unrelated to jQuery |

Other `element` uses are `element[0]` only (1233, 1392, 1419, 1569, 1585, 1616). Event handlers on elements by native `addEventListener`: `pointerdown` / `dblclick` (1522-1524) read `event.button, clientX, clientY, pointerId`, call `preventDefault/stopPropagation`, all native. `ng-click="$event.stopPropagation()"` (overlay wrapper in every theme) native.

Dead markup: `off-sync-draggable` attribute (index.html:189) has no directive.

### cards/index.html + sys/js/main.js + sys/pages + sys/themes
Read: controller, 5 directives (`overlayButton`, `cardFocus`, `overlayFocus`, `lazyRender`, `loadMoreOnVisible`), 6 theme partials, 8 page partials, index.html.

| file:line | receiver | call | status | note / fix |
|---|---|---|---|---|
| main.js:1106 | global `$` | `$.get(url)` | needs-$ | `await get(url)` |
| main.js:1355 | global `$` | `$.get(url)` | needs-$ | `await get(url)` |
| main.js:1387,1391,1396 | `element` | `.off`, `.on('mouseenter touchstart')`, `.on('click')` | OK | as b&t |
| main.js:236 | `event.target` | `.closest` | NATIVE | DOM Element method |
| cards/index.html:135 | ng-change expr | same no-op `document.querySelector` as b&t | n/a | |

Also: `appendTo: () => document.body` (1268) puts the tippy popper in the iframe body (cards clip overflow). No jQuery.

### counter-button-editor/index.html + sys/js/main.js
Read: controller, 1 directive (`incDecButtons`), index.html (6 inline `onchange=`/`onkeydown=` on the number inputs, native), embed.html.

| file:line | receiver | call | status | note / fix |
|---|---|---|---|---|
| main.js:243 | `element` | `.find('.inc-button')` | MISSING (BREAKING under jqLite) | jqLite `find` = `getElementsByTagName`, returns empty for a class selector. `let inc = element[0].querySelector('.inc-button')` |
| main.js:244 | `element` | `.find('.dec-button')` | MISSING (BREAKING) | `let dec = element[0].querySelector('.dec-button')` |
| main.js:253,272 | `inc` / `dec` | `.on('mousedown', fn)` | OK once receivers are fixed | native: `inc.addEventListener('mousedown', fn)` |
| main.js:291-293 | `$(window)` | `.on('mouseup' / 'mouseout' / 'mousecancel', clearTimers)` | needs-$ | `['mouseup','mouseout','mousecancel'].forEach(t => window.addEventListener(t, clearTimers))`. Handler reads no event fields. Optionally `scope.$on('$destroy', () => ...removeEventListener...)`: today nothing is cleaned up (6 instances x 3 listeners x forever) |

Only `$` use in the file is 291-293. Editor index.html:23 can drop jQuery after that change (plus the find fix if angular is moved to jqLite).

### introduction-text/index.html + sys/js/main.js + sys/pages/text-styles-template.html
Read: controller + 3 directives (`ilarCheckbox`, `ilarRadiobutton`, `ilarNumberInput`).
No `$` / `jQuery` anywhere in this page. jQuery script (index.html:27) can be removed now.

| file:line | receiver | call | status | note / fix |
|---|---|---|---|---|
| main.js:293-294 | `element` (ilarNumberInput) | `.find('.inc-button')`, `.find('.dec-button')` | MISSING | directive is defined but `<ilar-number-input>` is not used in this page's index.html (grep), so dead code; delete it or apply the tables fix below |
| main.js:292,345,351,352,360,361 | `inputElement` | `.find('input')`, `.val()` getter and setter | OK | jqLite `val` works for `<input>` |
| main.js:350,356 | `inputElement` | `.on('change')`, `.on('focus blur')` | OK | handlers read no event fields |
| main.js:211 | | `console.log(1111, ...)` | n/a | stray debug in ilarCheckbox |

### tables/index.html + sys/js/main.js + sys/pages/table-template.html
Read: controller, 3 directives (same code as introduction-text, verified identical by diff), table-template.html, index.html.

| file:line | receiver | call | status | note / fix |
|---|---|---|---|---|
| main.js:432 | global `$` | `$('.table-preview-wrapper div:has(.toolbox-table-preview)').clone()` | needs-$ | clone of the ng-include'd preview `div` (clone is detached, has no Angular data). Native: `let source = document.querySelector('.table-preview-wrapper div:has(.toolbox-table-preview)'), code = source && source.cloneNode(true)` (only one div in the wrapper matches; the old code used only the first match's `.html()`) |
| main.js:435-441 | clone | `.find('*').removeAttr(x6)` | needs-$ | `code.querySelectorAll('*').forEach(el => ['ng-if','ng-repeat','ng-class','ng-hide','ng-init'].forEach(a => el.removeAttribute(a)))` |
| main.js:444 | clone | `.find('.toolbox-table-preview').removeClass(...)` | needs-$ | `code.querySelectorAll('.toolbox-table-preview').forEach(el => el.classList.remove('toolbox-table-preview'))` |
| main.js:449 | clone | `.find('table').first().attr(toolboxConfigAttribute, v)` | needs-$ | `code.querySelector('table')?.setAttribute(toolboxConfigAttribute, v)` |
| main.js:459 | clone | `.find('th, td').html('&ZeroWidthSpace;')` | needs-$ | `code.querySelectorAll('th, td').forEach(el => { el.innerHTML = '&ZeroWidthSpace;' })` |
| main.js:462 | clone | `.html()` | needs-$ | `(code ? code.innerHTML : '')` |
| main.js:636,637 | `element` (ilarNumberInput) | `.find('.inc-button')`, `.find('.dec-button')` | MISSING (BREAKING) | used at tables/index.html:81,85. `inc = angular.element(element[0].querySelector('.inc-button'))`, same for dec; keeps the later `inc[0]`, `.on('mousedown')`, `.on('mouseup mouseout mousecancel')` (708-711) working unchanged under either library |
| main.js:635,688,694-695,699,703-704 | `inputElement` | `.find('input')`, `.val()` | OK | |
| main.js:693,699 | `inputElement` | `.on('change')`, `.on('focus blur')` | OK | |
| main.js:650 (`mouseDown`; intro-text 307) | handler | `return false` in the else branch | DIFF (harmless) | jqLite ignores `return false`; the branch is unreachable for the two bound elements. Same in introduction-text |

`mouseDown(e)` reads only `e.currentTarget` (compared with `inc[0]` / `dec[0]`). Native `currentTarget` is the element the listener is on, so OK.

### resource-templates/index.html + sys/js/main.js + sys/templates/resource-table.html + sys/themes/*
Read: controller, 1 directive (`ilarCheckbox`), resource-table.html, index.html. `sys/themes/*.html` (4 tiny partials, one empty) hold no directives or handlers.
Everything jQuery here works on a detached clone (`m.code`) of the Angular-rendered `.output`, never on live Angular DOM. No `$destroy` dependency.

| file:line | receiver | call | status | note / fix |
|---|---|---|---|---|
| main.js:123 | `$` | `$('.output').clone()` | needs-$ | `m.code = document.querySelector('.output').cloneNode(true)` |
| main.js:131 | clone | `.find('tr.preview-row').not('.option-show').each(...)` | needs-$ | `m.code.querySelectorAll('tr.preview-row:not(.option-show)').forEach(el => {...})` |
| main.js:138-141 | `$(el)` | `.addClass(toolboxHiddenRowClass).css('display','none').attr({hidden:'hidden', inert:'inert', 'aria-hidden':'true'})` | needs-$ | `el.classList.add(toolboxHiddenRowClass); el.style.display = 'none'; el.setAttribute('hidden','hidden'); el.setAttribute('inert','inert'); el.setAttribute('aria-hidden','true')` |
| main.js:144 | `$(el)` | `.remove()` | needs-$ | `el.remove()` |
| main.js:149 | clone | `.find('.preview-icon').remove()` | needs-$ | `querySelectorAll('.preview-icon').forEach(e => e.remove())` |
| main.js:153-158 | clone | `.find('[data-insert]').each(... $(el).html($(el).attr('data-insert')))` and `[data-insert-src]` `.attr('src', ...)` | needs-$ | `el.innerHTML = el.getAttribute('data-insert')`; `el.setAttribute('src', el.getAttribute('data-insert-src'))` |
| main.js:159-160 | clone | `.find('.preview-cell-inner').contents().unwrap()` then `.preview-cell` | needs-$ | `for (const el of clone.querySelectorAll('.preview-cell-inner')) if (el.firstChild) el.replaceWith(...el.childNodes)` then same for `.preview-cell`. The `firstChild` guard matters: jQuery `contents().unwrap()` on an empty element is a no-op, `replaceWith()` with nothing would delete it. Order matters: inner before outer, as written |
| main.js:162-171 | clone | `.find('*').removeAttr(x6).removeClass(x3)` | needs-$ | per element `removeAttribute` + `classList.remove('preview-row','option-show','output-icon')` |
| main.js:174 | clone | `.find('[class=""]').removeAttr('class')` | needs-$ | `querySelectorAll('[class=""]').forEach(e => e.removeAttribute('class'))` |
| main.js:179 | clone | `.find('table').first().attr(...)` | needs-$ | `querySelector('table')?.setAttribute(...)` |
| main.js:182 | clone | `.html()` | needs-$ | `.innerHTML` |

After converting 123-182 the page has zero jQuery, jQuery tag at index.html:29 can go. `ilarCheckbox` `element.on('click')` OK.

### horizontal-rule/index.html + sys/js/main.js (+ dead fitscreen.js)
Read: controller, 2 directives (`incDecInput` empty, `change`; neither used by index.html). All Angular-element calls OK (`element.on('change')`, `element.on('$destroy')`, `element.off()` are only in the unused `change` directive).

| file:line | receiver | call | status | note / fix |
|---|---|---|---|---|
| main.js:14 | `$` | `$('.copy-button').each((i, el) => ...)` | needs-$ | page DOM, not Angular rendered. `document.querySelectorAll('.copy-button').forEach((el) => {...})` |
| main.js:15-16 | | `$(el)`, `element.parent().find('.copy-input')` | needs-$ | `let text = el.parentElement.querySelector('.copy-input')` |
| main.js:18 | `element` | `.off()` | needs-$ | drop it (nothing registered earlier) |
| main.js:20 | `element` | `.on('click', fn)` | needs-$ | `el.addEventListener('click', fn)` |
| main.js:21,24,25 | `text` | `text[0]`, `.attr('data-wrapper')`, `.val()` | needs-$ | `if (text)`, `text.getAttribute('data-wrapper')`, `text.value` |
| main.js:31-35 | `element` | `.text()` get / set | needs-$ | `el.textContent` |

Everything is one block (lines 14-38). `window.top.postMessage({_func: ';(copyToClipboard)(str)', generators:true})` is NATIVE; the string is `eval`'d by si-manager/public/ilar-manager.js:6848-6855 in the host page, not here.

### banner-generator/index.html + sys/js/main.js + sys/js/fitscreen.js (superseded, frozen per CLAUDE.md:301)
Read: controller, 1 directive (`contenteditable`, restrict 'A', matches `div.text[contenteditable]` inside the ng-include'd banner-01.svg:119), index.html, banner-01.svg.

Note: `downloadBanner` (261-264) and index.html:75 reference a `canvas`, `#base64` and `form` that this index.html does not contain; clicking Download throws on `$('canvas')[0].toDataURL`. `showPhotoGallery` branch `if (!m.mode == 'toolbox')` is always false (line 191).

| file:line | receiver | call | status | note / fix |
|---|---|---|---|---|
| main.js:60-62 | `$` | `$('.image-gradient').removeClass('active-gradient').hide()` | needs-$ | svg `<rect>`s in the ng-include'd svg; class/display only. `querySelectorAll('.image-gradient').forEach(e => {e.classList.remove('active-gradient'); e.style.display='none'})` |
| main.js:64-66 | `$` | `$('#'+dot.image).addClass(...).show()` | needs-$ | **trap**: banner-01.svg:55 has `.image-gradient{display:none}` in its own `<style>`. jQuery `.show()` resolves to inline `display:inline`; native must set `el.style.display = 'inline'` (setting `''` leaves the svg rule winning and the gradient stays invisible). `getElementById(dot.image)` |
| main.js:76,111 | `$` | `$('.selected-image').attr('xlink:href', v)` | needs-$ | `document.querySelector('.selected-image')?.setAttribute('xlink:href', v)` (keep `setAttribute` with the prefixed name, which is what jQuery calls; do not switch to `setAttributeNS`, that would change behaviour) |
| main.js:94-103 | `$` | `$('.selected-image')`, `.length`, `.attr(get)`, `.attr(set)` | needs-$ | `let image = document.querySelector('.selected-image'); if (!image) return; ... image.getAttribute('xlink:href') || ''` |
| main.js:116-117 | `$` | `$('svg').clone()`, `.length === 0` | needs-$ | the page has a single `<svg>` (the ng-include'd banner). `let src = document.querySelector('svg'); if (!src) {retry}; let previewImage = src.cloneNode(true)` |
| main.js:154-165 | clone | `.find('.textbox [contenteditable] div').each`, `.find('img').remove()`, `.find('.image-gradient:not(.active-gradient)').remove()` | needs-$ | `querySelectorAll(...)` + `.remove()` |
| main.js:178-181 | clone | `previewImage.clone()`, `.find('.placeholder').remove()`, `.find('.text').text()`, `.find('.text').html()` | needs-$ | `cloneNode(true)`, `querySelector('.text').textContent`, `.innerHTML` |
| main.js:246 | `window.parent.$` | `$('.inline-photography-iframe')[0].scrollIntoView()` | needs-$ (PARENT's jQuery) | calls the toolbox's jQuery (toolbox/public/index.html:40 loads it). Native: `window.parent.document.querySelector('.inline-photography-iframe').scrollIntoView()`. Matters if the toolbox ever drops jQuery |
| main.js:230 | `$` inside serialized fn | `$(document.body).append(modal)` | n/a for this page | function text is sent via `postMessage` and `eval`'d in the host page (ilar-manager.js:6848-6855); `$` there is the host's. And the branch is dead (line 191) |
| main.js:262-263 | `$` | `$('#base64').val(...)`, `$('canvas')[0]`, `$('form').submit()` | needs-$ (dead, elements absent) | `document.querySelector('#base64').value = ...; document.querySelector('form').submit()` |
| main.js:355 | `e` in `element.on('keydown')` | `e.originalEvent.key` | MISSING (BREAKING under jqLite) | jqLite passes the native event. `e.key == "Enter"` works in both |
| main.js:354,372 | `element` | `.find('div')`, `.length`, `[i]` | OK | tag-name find is supported |
| main.js:375 | `$(divCount[i])` | `.remove()` | needs-$ | `divCount[i].remove()`. Nodes are browser-created contenteditable children, not Angular-compiled |
| main.js:381 | `e` | `e.which` | OK | native KeyboardEvent.which still exists (deprecated). `e.keyCode` equivalent; list `ignore` at 343 is keyCodes |
| main.js:358 | handler | `return false` after `preventDefault(); stopPropagation()` | OK | jqLite ignores `return false`, but the explicit calls make it equivalent |
| main.js:335,381,396 | `element` | `.text()` | OK | |
| main.js:336,339 | `element` | `.addClass / .removeClass('filled')` | OK | |
| main.js:400 | `e` | `(e.originalEvent || e).clipboardData` | OK | falls back to native |
| main.js:408-413 | `$(e.target)` | `.text()`, `.html('<br/>')` | needs-$ | `e.target.textContent`, `e.target.innerHTML = '<br/>'`. `blur` target is the contenteditable element itself |
| fitscreen.js:2-14 | `$` | `$('script').last()`, `$('[name="viewport"]')`, `$('<meta ...>').prependTo(document.head)`, `$(window).width()`, `script.attr(...)` | n/a: dead | **not referenced by any html or js** (grep for "fitscreen" in public/, ../index.js). Four byte-identical copies (banner-generator, course-banner-generator, horizontal-rule, profile-image-generator). Safe to delete |

### course-banner-generator/index.html + sys/js/main.js
Read: controller only (no directives of its own; `toolboxColourDots` module is used), index.html, banner-01.svg.

| file:line | receiver | call | status | note / fix |
|---|---|---|---|---|
| main.js:80-105 | global | `jQuery.ajax({url:'../download-base64', data:FormData, processData:false, contentType:false, xhr(){blob}, method:'POST', success})` | needs-$ (dead: `getOptimisedImage` at 72 has no caller) | delete, or `fetch('../download-base64', {method:'POST', body: form}).then(r => r.blob()).then(data => ...)` |
| main.js:302-305 | `$` | `$('.banner-temp-fix').remove()`, `$('header#page-header').addClass(..)`, `$('<style>').appendTo(document.body)` | n/a for this page | inside `saveToCourseBannerDemo`, whose `.toString()` is posted (312-314) and `eval`'d in the HOST page (ilar-manager.js:6848). The `$` is the host page's jQuery. The non-demo variant (113-298) is already native. Dropping the local jQuery tag does not touch this |
| main.js:324 | `$` | `$('.image-gradient').hide()` | needs-$ | `querySelectorAll('.image-gradient').forEach(e => e.style.display = 'none')` |
| main.js:325 | `$` | `$('#'+dot.image).show()` | needs-$ | same trap as banner-generator: `el.style.display = 'inline'` (svg line 33: `.image-gradient{display:none}`) |
| main.js:338,345,372 | `$` | `$('.selected-image').attr('xlink:href', v)` | needs-$ | `setAttribute('xlink:href', v)` |
| main.js:355-364 | `$` | `$('.selected-image')`, `.length`, `.attr()` get / set | needs-$ | as banner-generator 94-103 |
| main.js:453-454 | `$` | `$('#base64').val(...)`, `$('canvas')[0]`, `$('form').submit()` | needs-$ (dead: no caller, no form / #base64 in index.html) | delete |
| main.js:476 | `$` | `$('.text').text(m.activity.courseTitle)` | needs-$ | the target is the Angular-bound `<div class="text">{{activity.courseTitle}}</div>` at banner-01.svg:88 (ng-include). The binding already renders the same value after the digest at 542, so this line is redundant; jQuery `.text()` replaces the interpolated text node, leaving the binding writing into an orphan. Delete, or `document.querySelectorAll('.text').forEach(e => e.textContent = ...)` |
| main.js:590 | `$` inside serialized fn | `$(document.body).append(modal)` | n/a for this page | posted to host via `_func` (588-599), runs in the host page's `$` |
| main.js:607 | `window.parent.$` | `$('.inline-photography-iframe')[0].scrollIntoView()` | needs-$ (PARENT's jQuery) | `window.parent.document.querySelector('.inline-photography-iframe').scrollIntoView()` |

The three `colour-dots` interactions (`on-select="setGradient(colour, preview)"`) call `m.setGradient`, which is where 324-325 sit. Everything else in the file is native (fetch, DOMParser, canvas, ResizeObserver).

### profile-image-generator/index.html + sys/js/main.js
Read: controller + 2 directives (`change`, `image`), cropper.svg `ng-class` / `ng-attr-stroke` bindings, index.html.

| file:line | receiver | call | status | note / fix |
|---|---|---|---|---|
| main.js:7 | `$` | `$('canvas')[0]` | needs-$ | `document.querySelector('canvas')` |
| main.js:91,109,180,188 | `$` | `$('.preview-image image')` (jQuery set of the SVG `<image>` that ng-include renders) | needs-$ | `document.querySelector('.preview-image image')`; 180/188 `!!$(...).length` becomes `!!document.querySelector(...)`. `getCrop` (91) is also called when the image is not there yet: `getPanRange` then sees `undefined` attrs and returns 0s, so the native version must null-guard |
| main.js:63-67,72-76 | `svgImage` (shared by jQuery set and the Angular `element` from the `image` directive) | `.attr(get)`, `.css('transform', str)`, `.attr(set)` | OK in both | these helpers are called with the jQuery object AND with the directive's `element` (645,649,687,691), so keep to `attr` / `css(name, value)` only (both in jqLite) |
| main.js:118,120 | `svgImage` | `.css('x', 0)`, `.css('y', 0)` | DIFF | jQuery turns a bare number into `'0px'`. jqLite `css(name, value)` does `style[name] = value` with NO unit and a bare `1` is invalid for a length. Native: `el.style.setProperty('x', '0px')` |
| main.js:136,152 | `svgImage` | `.css('x', 1)`, `.css('y', 1)` | DIFF | same: must become `'1px'` |
| main.js:137,153 | `svgImage` | `.css('y' / 'x', '...px')` | OK | string already has a unit |
| main.js:73,163 | `svgImage` | `.css('transform', ...)` | OK | |
| main.js:117-161 | `svgImage` | many `.attr(name, number)` incl. `xlink:href`, camelCase `sWidth` etc. | OK | jqLite `attr` = `setAttribute` / `getAttribute`, same as jQuery here. Native `setAttribute` identical |
| main.js:331,333-340,373 | `$` | `img = $('.test-image')`, `img.off()`, `img.on('load', fn)`, `img[0]`, `img.attr('src', ...)` | needs-$ | `let img = document.querySelector('.test-image'); img.onload = () => {...}; img.src = ...` (assigning `onload` replaces the previous handler, same effect as `off()`; `img[0]` becomes `img`; keep `onload` set before `src`) |
| main.js:367-368 | `$` | `$('#base64').val(...)`, `$('form').submit()` | needs-$ | `document.querySelector('#base64').value = ...; document.querySelector('form').submit()` (no input named `submit` in the form; jQuery's trigger('submit') also ended in the native `submit()`; nothing listens for `submit`) |
| main.js:615,619 | `element.parent().parent()` | `.on('mouseover')`, `.on('mouseout')` | OK | |
| main.js:623,642,655 | `$(window)` | `.on('mousedown' / 'mousemove' / 'mouseup', fn)` | needs-$ | handlers read `e.originalEvent` (632, 643) for `clientX/clientY`. If converted to `window.addEventListener`, use `e.clientX` / `e.clientY` directly. Registered per `<image>` link and never removed |
| main.js:636-637,688-689 | `element` | `.attr('_x')`, `.attr('_y')` | OK | |
| main.js:683 | `element` | `.closest('svg')[0].getBoundingClientRect()` | MISSING (BREAKING under jqLite) | `element[0].closest('svg').getBoundingClientRect()` |
| main.js:592-601 | `element` (change directive) | `.on('change')`, `.on('$destroy')`, `.off()` | OK | event is native; `e.target.files` read by `updateImage` (217) |
| main.js:660,700-702 | | `window.addEventListener('wheel', preventScroll, {passive:false})` and `element.on('$destroy', ...)` placed inside preventScroll | NATIVE / pre-existing bug | the `$destroy` hook is only registered when a wheel event happens while hovering; the window `wheel` listener is never removed |

index.html:56,75 use inline `onclick="document.querySelector('.image').click()"`: NATIVE.
After the `$` conversions the page has zero jQuery; index.html:29 can go.

### rive-player-editor/index.html + sys/js/main.js
Read: controller, 3 directives (`riveDropzone`, `riveFileInput`, `riveResizeObserver`).
No `$` / `jQuery`. jQuery script (index.html:17) can be removed now. All `element` uses are `element.on(...)` with native handling or `element[0]`.

| file:line | receiver | call | status | note |
|---|---|---|---|---|
| main.js:400-416 | `element` | `.on('click' / 'dragover' / 'dragleave' / 'drop')` | OK | `e.preventDefault()` native. 414 `(e.originalEvent || e).dataTransfer.files[0]`: the comment above it says jQuery drops dataTransfer; under jqLite `e` is already native, so it simply takes the `e` branch |
| main.js:425-429 | `element` | `.on('change')`, `element[0].files`, `element[0].value = ''` | OK | |
| main.js:441-444 | | `new ResizeObserver(...).observe(element[0])` | NATIVE | |
| main.js:159 | `canvas.parentElement` | `addEventListener('pointerdown', fn, {once:true})` | NATIVE | |

### rive-player/index.html + sys/js/main.js
Read: controller, 1 directive (`rivePlayer`, restrict 'C', only `element[0]`). Zero jQuery use. jQuery script (index.html:27) is dead weight on a student-facing page. Also stray `console.log(12312312)` at main.js:20.

### buttons-and-tiles/res/embed.js
Parked / unused (not referenced by any html; `public/buttons-and-tiles/res/` is gitignored). Pure vanilla, no `$`, no `angular`. Nothing to do.

### toolbox shared files used by these pages (read, for completeness)
`colour-dots.js` (1 directive, scope-only, `e.key`/`preventDefault` on ngKeydown `$event`), `powerUser.js`, `icons.js`, `utilities.js`: no jQuery, no jQuery-only element API.

---------------------------------------------------------------------------
## 3. jQuery `<script>` tag: which pages can drop it

jQuery tag line, then every jQuery-direct use that must be converted first (real `$()` / `$.x` / `jQuery.x`, i.e. not Angular element calls).

| page (index.html tag line) | jQuery-direct uses | verdict |
|---|---|---|
| buttons-and-tiles/index.html:31 | main.js:1085, 1335 (`$.get`) | drop after 2 one-token swaps: `$.get(` -> `get(` (utilities.js global) |
| cards/index.html:30 | main.js:1106, 1355 (`$.get`) | drop after the same 2 swaps |
| counter-button-editor/index.html:23 | main.js:291-293 (`$(window).on`) | drop after 3-line swap (+ fix 243-244 / 253 / 272 if angular goes to jqLite) |
| introduction-text/index.html:27 | none | **drop now** |
| rive-player-editor/index.html:17 | none | **drop now** |
| rive-player/index.html:27 | none | **drop now** (student-facing page) |
| horizontal-rule/index.html:65 | main.js:14-38 | drop after converting that one block |
| resource-templates/index.html:29 | main.js:123-182 | drop after converting that one block |
| tables/index.html:29 | main.js:432-462 | drop after converting `generateTemplate`; stepper fix at 636-637 is separate (jqLite) |
| profile-image-generator/index.html:29 | main.js:7, 91, 109, 180, 188, 331-340, 367-368, 373, 623, 642, 655 | drop after ~12 mechanical swaps |
| banner-generator/index.html:38 | main.js:60-66, 76, 94-103, 111, 116-181, 246 (parent), 262-263, 375, 409-413 | frozen app; drop only if worth touching |
| course-banner-generator/index.html:38 | main.js:80 (dead), 324-325, 338, 345, 355-372, 453-454 (dead), 476; 246-equivalent at 607 (parent's `$`) | drop after ~10 swaps; 302-305 and 590 are host-page code, not this page's jQuery |

Cross-app dependency to remember: banner-generator main.js:246 and course-banner-generator main.js:607 call `window.parent.$`, i.e. the toolbox's jQuery (toolbox/public/index.html:40). Converting those two lines to `window.parent.document.querySelector(...)` removes the generators' last dependency on the toolbox having jQuery.

Everything run by `ilar-manager.js:6848` (`eval(event.data._func)`) executes in the host page and uses the host's globals; the `$` inside the serialized functions at banner-generator:230, course-banner-generator:302-305 and :590 is the host's, irrelevant to these pages' script tags.

---------------------------------------------------------------------------
## 4. Dragging (@shopify/draggable) and tippy wrapping

### @shopify/draggable (v1.2.1 in si-manager/node_modules, served at /node_modules, no jQuery dependency in its package.json)
- buttons-and-tiles main.js:237-255 `postSync`: `container = document.querySelector('.generated-data .buttons-and-tiles')` (native node), `new Draggable.Sortable(container, {draggable:'.toolbox-tile, .toolbox-button', handle:'.edit-overlay-button-move', sortAnimation, plugins:[SortAnimation]})`, `m.swappable.on('drag:stop', ...)` is Draggable's own emitter. `m.swappable.destroy()` before re-init (233-235). Re-armed from `syncItemOrder` (278-305) after a 350 ms timeout, which is called from `deleteObject` (217) and the editing-only theme `$watch` (1179).
- cards main.js:255-282: same with `.toolbox-card` and container `.generated-data .toolbox-cards`.
- Never receives an Angular element object. DOM reordering is native `insertBefore`; afterwards `syncItemOrder` reads `container.children.item(i)` and `getAttribute('data-id')` (native) and writes `index` on the model, so ng-repeat (`orderBy:'index' track by id`) reconciles. Identical under jQuery / jqLite.
- Interaction with `overlayFocus` (b&t 1410-1550, cards 1429-1582): crosshair uses `pointerdown` + `preventDefault()` + `stopPropagation()` + `setPointerCapture`, window `pointermove/up/cancel` listeners removed in `stop` and on `scope.$on('$destroy')`. All native. Because it prevents default on pointerdown, the compatibility mousedown never reaches Draggable from the crosshair, which is intended (the drag handle is the separate `.edit-overlay-button-move`).
- Other drag code in the folder: profile-image `image` directive (623-658, 660-707) uses `$(window).on('mouse*')` + `e.originalEvent` (needs-$, converted above); rive-player-editor `riveDropzone` (394-419) native DnD via `element.on('dragover|dragleave|drop')`, OK.

### tippy / popper (tippy.umd, @popperjs/core UMD; no jQuery)
- b&t main.js:1245-1324 and cards main.js:1256-1344: `tippy(reference, {...})` with `reference = element[0]` or `buttonElement.querySelector('.toolbox-icon')` (native), `triggerTarget: element[0]`, `content: $compile(htmlString)(scope)[0]` (a plain DOM node, not a wrapper). `allowHTML:true, interactive:true`. `onShow` reads `scope.tip.popper.querySelector('input,textarea')` (native), `input.addEventListener('keydown', ...)`. Library-independent.
- Registration order: `element.on('mouseenter touchstart', prime)` and `element.on('click', ...)` are registered first, tippy attaches its own native click listener later (after `ensureBuilt` resolves). Listener order is the same under jQuery and jqLite (both register one native dispatcher per event type per element).
- b&t 1087-1097 / cards 1108-1118: `tippy(buttonEl, ...)` where `buttonEl = window.parent.document.querySelector('.btn-save-as-template')` (the toolbox's own button, another document). Interactive tippy with default `appendTo` mounts the popper next to the reference, so the iframe-compiled node is adopted into the parent document; that is why the tippy theme CSS is appended to `window.parent.document.head` (b&t 992-1081, cards 1009-1098). Angular scope `m` (iframe) keeps updating that node via native listeners/watchers. No jQuery involved; `$compile(...)` runs in the iframe document.
- `$compile(await $.get(...))[0]`: the popup partials start with a UTF-8 BOM; `fetch().text()` / XHR both strip it, and angular's `trim` strips U+FEFF anyway, so swapping `$.get` for `get()` does not change what `$compile` receives (it must start with `<` after trim).
- Lifecycle note (pre-existing, not jQuery related): the tippy instance is `destroy()`ed only when rebuilt (1230/1241), never on scope `$destroy`. In cards the popper is appended to `document.body` (1268), so deleting a card leaves the popper orphaned; same with jQuery.

---------------------------------------------------------------------------
## 5. Event semantics

| handler | registered by | event fields read | jQuery-only semantics? |
|---|---|---|---|
| b&t 1373 / 1378, cards 1391 / 1396 | `element.on('mouseenter touchstart')`, `.on('click')` | none | no. jqLite mouseenter wrapper = mouseover + relatedTarget check, same as jQuery |
| b&t/cards ilarCheckbox, intro/tables/resource ilarCheckbox & ilarRadiobutton | `element.on('click')` | none | no |
| tables 693 / 699 / 708-711 (+ intro 350-368) | `inputElement.on('change')`, `.on('focus blur')`, `inc/dec.on('mousedown' / 'mouseup mouseout mousecancel')` | `e.currentTarget` (mouseDown) | no (native currentTarget is the bound element). `mousecancel` is not a real event; harmless |
| counter 253 / 272 | `inc/dec.on('mousedown')` | none | no |
| counter 291-293 | `$(window).on('mouseup' / 'mouseout' / 'mousecancel')` | none | jQuery listener on window; `mouseout` bubbles from every element so any pointer movement between elements clears the timers (same natively) |
| banner 344 keydown | `element.on('keydown')` | **`e.originalEvent.key` (355)**, `e.which` (381), `preventDefault`, `stopPropagation`, returns false | originalEvent: YES, BREAKS under jqLite. `return false` is ignored by jqLite but is redundant here |
| banner 388 / 393 / 408 | keyup, paste, blur | paste: `(e.originalEvent \|\| e).clipboardData` (fine); blur: `e.target` | no |
| profile 592 `change` directive | `element.on('change')` | passes whole event; `updateImage` reads `e.target.files` | no |
| profile 623 / 642 / 655 | `$(window).on(...)` | `e.originalEvent.clientX/clientY` | jQuery Event: fine while `$` is jQuery; drop `.originalEvent` when going native |
| profile 615 / 619 | `element.parent().parent().on('mouseover' / 'mouseout')` | none | no |
| rive-player-editor 402-416 | `element.on('dragover' / 'dragleave' / 'drop')` | `e.preventDefault`, `(e.originalEvent \|\| e).dataTransfer` | the fallback already handles native |
| rive-player-editor 425 | `element.on('change')` | none | no |
| horizontal-rule 71 (unused directive) | `element.on('change')` | event passed to `$eval` locals | no |
| ng-click / ng-keydown `$event` uses | b&t, cards partials | `$event.stopPropagation()` (all overlay wrappers), cards `toggleFlip(card, $event)` -> `event.target.closest`, `flipKeydown` -> `event.key`, `preventDefault`; `deleteObject($event, ...)` / `deleteCard($event, ...)` -> `preventDefault`, `stopPropagation`; colour-dots `keydown($event)` -> `e.key` | no |
| window listeners (native) | b&t / cards / counter / course-banner / rive | `message` (`e.origin`, `e.data`), `storage` (`event.key`, `newValue`), `keydown` (`event.key`), `resize` | n/a |

No namespaced events (`click.foo`), no event delegation, no `eventData`, no `.trigger`, no `isDefaultPrevented`/`delegateTarget`/`namespace`/`relatedTarget` reads anywhere in the folder.

## 6. Trigger / plugin

- No `.trigger()`, `.triggerHandler()`, `.change()`, `.click()`, `.val(x).change()` on any jQuery or jqLite object. The `.click()` calls are native DOM: profile 628 `document.querySelector('.image').click()`, rive 400 `input.click()`.
- Native `dispatchEvent`: none.
- Inline HTML handlers: counter-button-editor/index.html:48,62,76,90,105,116 `onchange="m.changeInputValue(...)"` and `onkeydown="setTimeout(...)"` on number inputs that also carry `ng-model` (fires on user change only; native listeners, unaffected by the binding). profile-image index.html:56,75 `onclick=`.
- jQuery plugins: none (no select2, tooltip, etc.). Third-party widgets: tippy, Draggable, rive (all native node APIs).
- `.scope()`, `.isolateScope()`, `.controller()`, `.injector()`, `.inheritedData()`, `.data('$...')`: **zero** occurrences in this folder.
- Cross-frame reaching: `window.parent.m.$root...` / `$applyAsync` (b&t, cards, counter, intro, tables, resource, profile, rive-editor, course-banner), `contentWindow.m` (b&t ngTemplatePreview [dead] 1619-1620, counter 143-145 preview iframe). Same-origin global `m`, independent of jQuery.

## 7. Lifecycle

- No jQuery `.remove()/.empty()/.html(x)/.replaceWith()/.detach()` is called on DOM that Angular created through ng-repeat / ng-if / ng-include / $compile and that carries scopes or handlers, so nothing depends on angular's patched `jQuery.cleanData` firing `$destroy`:
  - resource-templates 123-182 and tables 432-462 operate on detached clones (no data copied).
  - banner-generator 375 `$(divCount[i]).remove()` and 413 `el.html('<br/>')` act on browser-created children of a contenteditable.
  - course-banner-generator 476 `$('.text').text(...)` overwrites the interpolated `{{activity.courseTitle}}` text node at banner-01.svg:88 (the only case that touches an Angular binding; effect is a replaced text node + orphaned binding, same with or without jQuery patching, and the line is redundant).
  - `.hide()/.show()/.addClass()/.attr()` (banner, course-banner, profile) only change style/class/attributes on ng-include'd SVG nodes; no teardown.
- `$destroy` listeners that exist: b&t / cards `overlayFocus` `scope.$on('$destroy')` (removes window listeners), `lazyRender` / `loadMoreOnVisible` `scope.$on('$destroy')` (observer.disconnect), unused `change` directives `element.on('$destroy')`. All scope-based or jqLite-compatible (`element.on('$destroy')` is supported by jqLite).
- Leaks that exist today and would not change: counter 291-293 and profile 623/642/655 (window listeners per link call, never removed), profile 660 wheel listener, b&t/cards tippy popper not destroyed with the scope.
- `$compile(...)(scope)` results: only `[0]` indexing (b&t 1085, 1335; cards 1106, 1355). No `.appendTo`, `.find('.sel')`, `.children('sel')` on any `$compile` result.

## 8. Other observations

- `utilities.js` already exposes a fetch-based `get(url, cb)` (line 96), `getJSON`, `post`; the `$.get` swaps need no new helper.
- `fitscreen.js` x4 is dead code (section 2, banner-generator table).
- `ngTemplatePreview` directive in b&t (1609-1625), the `off-sync-draggable` attribute, and `document.querySelector` inside `ng-change` are dead / no-ops.
- `data` / `ng-model` on custom `ilar-checkbox` etc. depend on templateUrls served by the toolbox (`/studydesk-toolbox/sys/pages/ilar-checkbox.html`, `/editor-popups/sys/pages/ilar-radiobutton.html`, `.../ilar-number-input.html`), whose markup (`toolbox/public/sys/pages/ilar-number-input.html`) has the `.inc-button` / `.dec-button` classes that the tables stepper finds with a class selector.
