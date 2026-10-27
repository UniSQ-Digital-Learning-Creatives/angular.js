# appfix-w2: toolbox-generators/public

Repo: /mnt/109313D2109313D2/sync/www/work/apps/toolbox-generators (only `public/`; `res/old` untouched). No commits or index changes. The three embed.html pages and their shared main.js code paths: no behaviour change (the only edits in b&t/cards main.js are in editor-only code; embed.html files not edited).

## Files changed and why
D6
- buttons-and-tiles/sys/js/main.js (syncItemOrder, ~line 298) and cards/sys/js/main.js (~line 324): after the loop that rewrites `index` in place from DOM order, `m.$root.data.objects = m.$root.data.objects?.slice()`, so the memoized `orderBy:'index'` pipeline re-runs.
D2 / D1 (jQuery tag removed on all 12 index.html; the 3 embed.html never had one)
- buttons-and-tiles + cards main.js: `await $.get(url)` -> `await get(url)` (utilities.js fetch helper, raw text) at b&t 1089/1339, cards 1110/1359. Tag removed from both index.html.
- counter-button-editor main.js: 243-244 `element.find('.inc/.dec-button')` -> `angular.element(element[0].querySelector(...))` (works in old and new jqLite; the old build's jqLite find is tag-name only); 291-293 `$(window).on` -> `window.addEventListener`.
- tables main.js: 636-637 same find fix; generateTemplate (432-462) converted to native clone/querySelectorAll/classList/innerHTML (output byte-identical, see verification).
- introduction-text main.js 293-294: same find fix (dead code, `<ilar-number-input>` is not used on the page). Tag removed.
- resource-templates main.js 123-182: `$('.output').clone()` chain converted to native (unwrap kept with `firstChild` guard, same as jQuery contents().unwrap()).
- horizontal-rule main.js 14-38: `$('.copy-button').each` -> querySelectorAll + addEventListener.
- profile-image-generator main.js: `$('canvas')[0]`, `$('.preview-image image')` (now `angular.element(document.querySelector(...))` so attr/css helpers still work), `.css('x'|'y', 0|1)` -> `'0px'|'1px'` (jqLite adds no unit), `.test-image` img via `onload`/`setAttribute`, `#base64`/`form` native, `$(window).on('mouse*')` -> window.addEventListener with `e` instead of `e.originalEvent`, `element.closest('svg')[0]` -> `element[0].closest('svg')` (line 683, D1).
- course-banner-generator main.js: dead `jQuery.ajax` -> fetch; setGradient hide/show -> style.display 'none' / 'inline' (svg css hides `.image-gradient`, so '' would stay hidden); `.selected-image` attr get/set native; `$('.text').text()` native; `window.parent.$(...)` -> `window.parent.document.querySelector(...)`. The `$` left at lines ~291-293/584 is inside functions serialized and eval'd in the HOST page (ilar-manager), not this page's jQuery.
- banner-generator main.js: same gradient/image/clone conversions, `e.originalEvent.key` -> `e.key` (line ~355, D1), `$(divCount[i]).remove()`, blur handler native, `window.parent.$` -> native; createCanvas clones with cloneNode. `$` left at ~236 is host-eval code, others are in comments.
- introduction-text, rive-player-editor, rive-player: tag removed only (no code use).
- D8: none of $location/$anchorScroll/autoscroll/jsonp/XSRF or removed directives/filters used anywhere here (grepped).

## jQuery per page
Removed from all 12: banner-generator, buttons-and-tiles, cards, counter-button-editor, course-banner-generator, horizontal-rule, introduction-text, profile-image-generator, resource-templates, rive-player, rive-player-editor, tables. No page in this repo still needs jQuery (draggable, popper, tippy, rive, colour-dots, powerUser need none). Dead `sys/js/fitscreen.js` (4 copies, unreferenced) still contains `$` and was left alone.

## D6 sites
- Fixed: the 6 live themes' `orderBy:'index'` (cards flip/link/plain, b&t standard/large/tile) via syncItemOrder (the only place `index` is edited in place; newEmptyObject/add/delete change array length so already re-sort).
- Fine: preview-* themes (`template.objects | orderBy`), never mutated, templates replaced by new arrays; template galleries (b&t/cards index.html 76/75): `m.templates = concat(...)` creates new arrays, `templateFilterParams` is an object argument, which the memo treats as always changed, so typing in search still refilters. No other piped ng-repeat in the repo.
- Note: drag-reorder worked even without the slice() (Draggable physically moves the DOM, no CSS uses $index/$last); I tested the unfixed variant on the new build to confirm. The slice keeps ng-repeat's/pipeline's state in step with the model; harmless.

## Verification
1. Old vs new build, `node ab.js --a $S/opt/current.min.js --b <fork>/angular.min.js --interact --real-time --pages 'gen-*' --label w2-final` (21 pages): all DIFF only by `<style len=237 vs 151>`; one real finding: counter-button-editor and tables steppers on the OLD build without jQuery (jqLite find was tag-only) -> fixed by the querySelector wrapper; re-ran `--pages gen-counter-button-editor,gen-tables,gen-introduction-text` (label w2-final2): only style-len/timing diffs. Log: $S/opt/ab-w2-final.log, ab-w2-final2.log.
2. vs BEFORE (`compare-runs.py <BEFORE>/A <run>/B 'gen-*'`): all 21 gen pages SAME (counter/tables/intro from w2-final2, the rest from w2-final); the only diff, counter step i3, was the pre-fix state.
3. Exercised for real (puppeteer, scratchpad scripts w2-drag.js, w2-codeeq.js, w2-misc.js):
   - Drag-reorder with real mouse events through Draggable.Sortable, then add, delete, drag again: cards and b&t, old build and new build, DOM order == sort by `index` at every step, no errors, identical results old/new (b&t delete-confirm did not trigger in my script on either build; delete is covered in cards and the harness).
   - Generated code from the original jQuery app (git HEAD copy, jQuery, old lib) vs converted app (new lib): resource-templates (5 variants incl. editing=true hidden-row branch) and tables (2 variants): IDENTICAL.
   - Profile image: upload, wheel zoom (no TypeError), drag pan: values match the original. Banner generator: 6 Enters in the contenteditable (no TypeError, capped at 3 divs), gradient switching, blur. Course banner gradient switching, horizontal-rule copy button ('Copied!'). All with zero page errors, matching the original app.

## Not fixed / notes
- Nothing outstanding. I did not add harness fixture steps (used standalone scripts instead). b&t index.html:136 / cards:135 `document.querySelector` inside ng-change is a pre-existing no-op, untouched. Servers started on ports 4963-4965 were killed by PID.
