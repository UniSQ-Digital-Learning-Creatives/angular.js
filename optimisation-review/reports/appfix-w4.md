# appfix-w4

Apps root: /mnt/109313D2109313D2/sync/www/work/apps. Nothing committed; no git state touched.

## Per repo: files and changes

### toolbox-reaction-bar (public/)
- sys/js/main.js: `tooltip` directive `element.offset()` replaced by getBoundingClientRect + pageX/YOffset - clientTop/Left (jQuery's offset maths). Two `$(window).on('storage')` handlers changed to `window.addEventListener('storage')` and `e.originalEvent.X` to `e.X`.
- dashboard/sys/js/main.js: `$.getJSON(...)` to utilities `getJSON(url, (err, data))` (returns on err); `$(window).on('hashchange')` to addEventListener. The lead's `m.$applyAsync()` in handleHashChange is kept.
- index.html, modal.html, injector.html, dashboard/index.html: jQuery tag removed.

### si-manager (only public/toolbox-feedback/)
- main.js `stars` directive: `filledStars` is now `Array.from(element.find(...))`, `.each((i, el)` to `.forEach((el, i)`; `element.position().left` / `element.width()` to getBoundingClientRect().left / .width (the wrapper is `position: relative`, no padding or border).
- index.html: jQuery tag removed.
- status-dashboard: already jQuery-free (confirmed), untouched.

### toolbox-inline-completion-tracker (public/)
- sys/js/main.js tooltip: `element.offset()/width()` to getBoundingClientRect-based (same numbers).
- index.html and config/index.html: jQuery tag removed.

### course-development-reports (public/)
- sys/js/main.js: 6x `$.getJSON(...).fail(...)` to `getJSON(url, (err, data))` with the same console.error on failure.
- The modal at main.js:843 uses `angular.element(html).prepend/remove` and `$compile`. This works on jqLite unchanged (jqLite trims the html string).
- index.html: jQuery tag removed; ui-grid.js changed to ui-grid.min.js (exists in the served node_modules).

### toolbox-suggest-feature (public/)
- sys/js/main.js upvoteSuggestion/downvoteSuggestion: added `m.suggestions = m.suggestions.slice()` before saveSuggestion (D6).
- index.html: jQuery tag removed.

### toolbox-group-discussion
- public-admin/sys/js/main.js: new `m.refilter()` (replaces `$root.discussions` with a slice); called at the end of `select()` (unread zeroed) and in `deselect()` (D6).
- public-admin/sys/pages/list.html: Unread only checkbox gets `ng-change="refilter()"`.
- public/ (cash-dom for `$`, no jQuery) and public-admin: neither loads jQuery; left as is.

### media-catalogue, toolbox-gift-quiz-converter, toolbox-notes, toolbox-sample-app
- public/index.html in each: jQuery tag removed. No JS changes. gift-quiz-converter already handles `(e.originalEvent || e).dataTransfer`. notes uses tinymce, which doesn't need jQuery.

### course-development-checklist, toolbox-previews
- Already don't load jQuery (confirmed); untouched.

### Dead pages (report only)
- toolbox-course-roadmap/public/index.html:18 and si-analytics/public/index.html:44 still load jQuery. A grep found no jQuery-only uses in their app JS, but they are dead and were not edited or tested.

## jQuery per page
- Removed: reaction-bar index/injector/modal/dashboard, toolbox-feedback, inline-completion-tracker index and config, course-development-reports, suggest-feature, media-catalogue, gift-quiz-converter, notes, sample-app.
- Never loaded: status-dashboard, course-development-checklist, previews, group-discussion (both).
- Kept: none in my live pages.

## D6 sites
- suggest-feature index.html:30 (`filter | orderBy:[voteSort,'_id']`): FIXED (slice after vote). The saved list already replaced the array once the POST returned, but the optimistic re-sort needed the slice.
- group-discussion public-admin list.html:17 (`filter: listFilter`, a predicate reading `unreadOnly`, `selected` and `d.unread`): FIXED. Without the fix the toggle and the select/deselect did nothing.
- inline-completion-tracker config `ng-options ... | orderBy:'name'`: fine, `trackers` is assigned once and never edited.
- media-catalogue (6 repeats with `orderBy '-timestamp'/'-searchedAt'`, `limitTo`): fine, lists are replaced wholesale by loadList/loadRecentSearches or reassigned, and nothing edits items in place. `filteredCollections() | orderBy: collectionsSortExpression()`: fine, the function call returns a new array each digest, so it re-runs every digest as before.
- group-discussion public `boolToArray(...)`: no pipe.
- No other piped repeats in my repos.

## Verification
1. Old vs new build on all 22 of my page ids (`--interact --real-time`, label w4-final, results/*w4-final):
   `node ab.js --a $S/opt/current.min.js --b <fork>/angular.min.js --interact --real-time --pages <22 ids> --label w4-final`
   - Every page shows only the injected `<style len>` diff, plus ui-grid ids on course-development-reports and a toolbox-notes yjs id (random).
   - One real difference: toolbox-feedback. The old build with no jQuery has jqLite `find` that only takes tag names, so `.stars-filled .star` matched nothing and `style="opacity: 0"` is missing. The new build sets it.
   - 0 console or page errors vs 0 on every page except the pre-existing ones listed below.
2. Compared against BEFORE (the jQuery-era apps on the old build), B side of w4-final:
   - SAME: status-dashboard, toolbox-feedback, checklist (2), gift, group-discussion, inline-tracker (2), previews (2), reaction-bar (4), sample-app, suggest-feature, media-catalogue-standalone, notes-shared.
   - course-development-reports: only the `ui-grid.js` to `ui-grid.min.js` src lines differ (intended). The coordinator flagged one flaky ui-grid cell for this page, and it did not show up here.
   - group-discussion-admin: only the added `ng-change` attribute.
   - toolbox-notes: random yjs `data-yid`s.
   - media-catalogue: the first-load snapshot lacks `active` on one favourite icon (async favourites fetch landed after the snapshot, which settled in 379 ms vs 670 ms without jQuery). Later steps are the same except scroll steps i25-i27, which are timing-sensitive. Reproduced identically in two runs, and A and B agree with each other. I judge it to be timing, not behaviour.
3. Exercised directly with puppeteer ($S/opt/w4-exercise/test.js, old and new build, no jQuery on either):
   - reaction-bar hover tooltips: posted offsets equal getBoundingClientRect + scroll for all 3 icons, identical on both builds.
   - inline-completion-tracker cell tooltips: offset.left = left + width/2 - 10 and top - 20 correct, identical on both builds.
   - toolbox-feedback stars: new build hover 10/50/95% gives opacities 1/3/5 stars, mouseout restores, click at 70% gives rating 4. This matches BEFORE; the old build with no jQuery can't do it (jqLite find limitation).
   - suggest-feature: with save-suggestion delayed 2.5 s, downvoting row 2 re-sorts the list immediately on both builds.
   - group-discussion admin: Unread only, open and deselect give identical lists on old and new.
   - course-development-reports: filter modal opens, the modal grid renders 60 rows, Apply closes it and applies the filter, 0 errors. Same on old and new with ui-grid.min.js.

## Not fixed / noticed
- toolbox-suggest-feature main.js:66 (existing bug, not touched): un-upvoting does `suggestion.upvotes = suggestion.downvotes.filter(...)`, which copies the downvotes into upvotes. It should be `suggestion.upvotes.filter(...)`.
- reaction-bar injector.html: `tooltip="Yes, it was"` (unquoted) throws a parse error in the tooltip directive; 4 console errors on both builds and in BEFORE. Pre-existing and not touched.
- Nothing left running; the temp profile dirs were removed.
