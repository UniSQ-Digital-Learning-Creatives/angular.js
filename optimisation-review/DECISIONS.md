# AngularJS fork: usage-driven optimisation review (round 2), 2026-10-25

This round measured the fork against what the apps suite actually uses (46 live pages; see
`reports/inventory.md`) and made it smaller and faster. Changes came in two kinds:

- **Safe changes** with no behaviour change for any page in the suite (next section).
- **Decisions D1-D8**, each of which changes something a page can notice.
  - **Approved and applied:** D1, D2, D3, D4, D5, D6 and D8, with the app-side fixes they needed.
  - **Deferred:** D7, kept as a future option.

Everything is uncommitted: Shane commits by hand.

## Outcome (2026-10-25)

**The shipped file**
- `angular.min.js` is **51.1 KB gz** (150 KB min), down from 61.5 KB gz at the start of the round.
  It is built with `npm run build:suite` (the `suite` profile).
- It now lives in **si-manager**, at `si-manager/public/angular/angular.min.js` (+ `.map`), and every
  app loads it as **`/angular/angular.min.js`**. Being in si-manager's `public/`, it gets the suite's
  standard policy: `?v=<stamp>` URLs cache immutable, and unstamped ones revalidate with an ETag.
- To update it, run `npm run release:si-manager` here (it builds, then copies into
  `../../apps/si-manager/public/angular/`; set `SI_MANAGER=` to point elsewhere), then deploy
  si-manager.
- The `"angular": "github:Shane-Gadsby/angular.js"` npm dependency is removed from si-manager,
  toolbox-notes and toolbox-photospheres (`package.json` + lockfile).
  - `angular-ui-grid` (si-manager, course-development-reports) still has a hard npm dependency on
    `angular`, so npm keeps installing a copy under their `node_modules`. No page loads it.
  - Vendoring ui-grid would end that (see Future optimisations).
- `non-toolbox/` is untouched: it ships its own pinned old AngularJS copies.

**Library state**
- The safe set plus D1, D3/D8, D4, D5 and D6.
- Karma passes **6242/6242 (jqLite)** and **6236/6236 (jQuery on the page)**.
  - 13 specs for the removed jQuery binding were retired (`test/jQueryPatchSpec.js` deleted).
  - `test/ng/animateSpec (2).js` is a sync-conflict copy that duplicates about 40 specs. It was
    excluded from the runs, not deleted.

**App changes**, uncommitted, per repo:

| repo | what changed |
|---|---|
| toolbox | select2 directive on a real jQuery object + forwards select2 events as a native `change`; preview `ng-style` height gets `px`; content-template-access-modal drops jQuery |
| toolbox-3d-model-viewer | select2 fix; D6 `m.models.slice()` after an in-place edit |
| si-admin | select2 fix; **`removeCourseFromWhitelist` bug fixed** (removed the last row instead of the clicked one, and saved a nested object as `regex`) |
| podcast-manager | select2 fix |
| toolbox-generators (12 editor pages) | jQuery removed from all of them; `$.get` -> `get()`; `closest`/`originalEvent` fixes; D6 `objects.slice()` after drag-reorder in cards and buttons-and-tiles. The 3 student `embed.html` pages are unchanged. |
| toolbox-podcast-player | jQuery removed; seek/volume/speed drags native |
| toolbox-photospheres | admin drops jQuery; index `mousemove` fix (index keeps jQuery for toastr) |
| toolbox-pronunciation-guide | jQuery removed; `$locationProvider` config removed (D8); `ngScroll` native; D6 fix for the "Most popular" order |
| si-studydesk-styles | `$locationProvider` config removed (D8) (keeps jQuery for toastr) |
| si-photography-catalogue | jQuery removed; scroll/height/offset code native |
| toolbox-reaction-bar | `offset()` tooltip fix; jQuery removed from index/injector/modal/dashboard; dashboard `hashchange` now digests (`m.$applyAsync()`) |
| si-manager | toolbox-feedback `stars` directive native + drops jQuery; serves the AngularJS build from `public/angular/`; `angular` npm dependency removed |
| toolbox-inline-completion-tracker | tooltip `offset()` fix; jQuery removed (index + config) |
| course-development-reports | `$.getJSON` -> `getJSON`; jQuery removed; loads `ui-grid.min.js` instead of the 1.2 MB `ui-grid.js` |
| toolbox-suggest-feature | D6: list re-sorts right after a vote; jQuery removed |
| toolbox-group-discussion (admin) | D6: "Unread only" and select/deselect re-filter (`m.refilter()`) |
| media-catalogue, gift-quiz-converter, notes, sample-app | jQuery tag removed (no code changes needed) |
| all of the above + course-development-checklist, previews, si-analytics, course-roadmap | `<script src="/angular/angular.min.js">` instead of `/node_modules/angular/angular.min.js` |

Every changed app, and each changed generator in toolbox-generators, got a patch version bump (the
`version = ` line in its `index.js`). The before/after table is at the end of the 2026-10-25 entry in
`apps/changes.md`.

**Pages that still load jQuery (D2)**, and why:

| page | needs jQuery for |
|---|---|
| toolbox/public/index.html | select2 (podcast-player install screen) + app `$()` on plain DOM |
| toolbox-3d-model-viewer | select2, toastr |
| si-admin | select2, toastr, `$.param` |
| podcast-manager/html | select2 |
| toolbox-photospheres/public/index.html | toastr, heavy app `$()` use |
| si-studydesk-styles/website | toastr (~9 call sites) |
| si-analytics, toolbox-course-roadmap | not touched; both pages are dead (their `sys/js/main.js` is missing from the repo) |

**Verification**
- A frozen pre-edit copy of all apps was run on the old build. Its snapshots were then compared with
  the edited apps on the new build across all 75 page variants, with scripted interactions and a real
  clock (`suite-ab/compare-runs.py`).
- **67 pages were identical.** The other 8 differ only by intended changes or known noise:
  - the toolbox `ng-style` text;
  - the ui-grid `.min` script tag;
  - group-discussion admin's added `ng-change`;
  - si-admin's whitelist fix: the clicked row is now the one removed;
  - random collaborative-editor ids in notes;
  - the version string in the dead pages' error;
  - media-catalogue's favourite-icon count, which varies per page load because the app shuffles its
    gallery with `Math.random()` (`main.js:41`). It does so on both builds.
- Old build vs new build on the edited apps: identical apart from the injected `<style>` length.
- After the switch to `/angular/angular.min.js`, every page loads it and bootstraps (the two dead
  pages excepted, as before).
- The workers also drove the fixed paths directly in Chrome on both builds:
  - real select2 picks (the model updates, ng-change fires);
  - drag-reorder with add/delete;
  - seek/volume drags and tooltip positions;
  - suggest-feature re-sort, the group-discussion admin filters and the photospheres admin save/delete.

## Safe changes (applied in the first pass)

| what | effect |
|---|---|
| **terser replaces the 2014 Closure Compiler** (`scripts/build-lib.js`; `--minifier=closure` keeps the old path). The minErr stripping is reimplemented as an acorn pre-pass (`scripts/minerr-pass.js`) whose `errors.json` matches the old output (87 codes). **No Java needed.** | -1.5 KB gz on its own. `src/` may now use ES2015+ syntax (keep top-level helpers as `var`/`function`, because Karma loads the files as globals). |
| **Scope digest rewrite**: tree bookkeeping moved to a per-scope `DigestNode` with one shared hidden class. The `$$watchers`/`$$childHead`/... names still work (as accessors); nothing in the suite or ui-grid reads them. | Idle digest **0.44-0.51x** on benches built from group-discussion and media-catalogue templates. `$applyAsync` burst + digest 0.48x. Deep-watch editor page 0.52-0.64x. Scope create/destroy 0.43x. |
| `angular.equals` without per-object key maps; `angular.copy` using a `Map` instead of `indexOf` | equals 2.1-2.4x faster. copy 0.5-0.64x on large graphs (deep watches). |
| **ngInclude compiled-template cache**: the 2nd and later includes of the same template are clone + link instead of a fresh compile | Toolbox grid reload **0.64x**, search 0.56-0.66x, embed page reload 0.76x, 1,000 SVG icon includes 0.38-0.41x. |
| jqLite `cleanData` rewrite, `inheritedData` fast path | Row teardown 0.65-0.8x, ngModel creation 0.85-0.92x (jqLite pages). |
| jqLite `find()` accepts any CSS selector (`querySelectorAll`) | Needed for D1. It also fixes 4 call sites that are silently broken today on jqLite pages. |
| Lazy `$templateRequest` in `$compile` | Tiny. |

- **Size:** angular.min.js **60.6 KB gz** (was 61.5 KB with the 2014 Closure build), 178,722 B min.
- **Tests:** Karma **6250/6250 (jqLite) and 6255/6255 (jQuery)**. The baseline was 6207/6212; the
  additions are new specs, and no existing spec was changed.
- **Suite-wide check** (`suite-ab/`, every page plus 29 variants with scripted interactions, current
  build vs new build, real clock): identical on every page. The only differences were artifacts: the
  shorter injected `<style>`, the version string inside error URLs, ui-grid's timestamp ids, a clock
  minute rolling over, and the server port inside podcast URLs. Two pages are flaky even when a build
  is compared with itself: gen-cards and gen-buttons-and-tiles.

**Rejected after measuring** (numbers in `reports/`):
- jqLite expando store: 0-4%.
- `debugInfoEnabled(false)` as default: every bootstrapping page already sets it.
- Class/comment-directive switches off: not measurable.
- Synchronous class changes: ~10% on ngClass only.
- Skipping form-state classes: ~1 µs per input.
- Watcher closure index, `Object.keys` in equals, `Object.create` scopes: not faster.
- CSP interpreter by default: cold parse 2.5x faster but digests 2x slower.
- Arrow-function conversion: ≤0.4% gz.
- esbuild, swc and current Closure: equal or larger than terser.

## Decisions D1-D8 (status as of 2026-10-25)

The patches in `patches/` were made against the safe set. D1, D3, D4, D5 and D6 are now applied to
`src/`/`scripts/`, so only D7's patch still needs applying.

### D1. Angular stops binding to jQuery (always uses jqLite) - `patches/drop-jquery.patch`

**Status: APPLIED.** The app fixes listed below were made (see Outcome).

**Gain**
- Size: -0.37 KB gz.
- Speed: the same pages run faster on jqLite than on jQuery. On the toolbox bench: grid reload
  13.9 vs 18.8 ms, warm boot 35 vs 46.5 ms, an ngModel input 17 vs 30 µs to create.
- It is also the prerequisite for D2.
- jQuery stays on the page for the apps' own code. Angular just stops using it.

**Breaks (confirmed by the suite-wide check; static audit in `reports/jquery.md` §4):**

| page | file:line | problem | app fix (works with or without D1, so ship first) |
|---|---|---|---|
| toolbox (podcast-player popup), toolbox-3d-model-viewer, si-admin, podcast-manager | toolbox `main.js:2814`, 3d-viewer `:871`, si-admin `:370`, podcast-manager `:298` | `element.select2()` throws. Worse, if wrapped with `$()`, select2's jQuery-only `change` never reaches ng-model, silently. | `$(element[0]).select2(cfg)` plus forward `select2:select/unselect/clear` as a native `change` (3 lines), or the one-line `jQuery.event.special` shim in `reports/jquery.md` §4.1 |
| toolbox | `public/index.html:126` | `ng-style` height is a bare number; jQuery adds `px`, jqLite doesn't, so the preview panel loses its height | `previewItem.maxHeight + 'px'` |
| reaction-bar index/injector/modal | `main.js:387` | `element.offset()` | `getBoundingClientRect()` + `scrollY` |
| si-manager toolbox-feedback | `main.js:97-173` | `.each`, `.position()`, `.width()` | `querySelectorAll` / `getBoundingClientRect()` |
| toolbox-podcast-player | `main.js:510-513, 530-531, 771` | `e.originalEvent.touches`, `offset()`, `width()` | `(e.originalEvent \|\| e)`, `getBoundingClientRect()` |
| toolbox-photospheres | `main.js:1161-1163` (+ debug-only `<script>` in `new-hotspot.html`) | `e.originalEvent.clientX` | `(e.originalEvent \|\| e)`; load dropzone in index.html |
| toolbox-pronunciation-guide | `main.js:450` | `$element.scrollTop()` | `$element[0].scrollTop` |
| toolbox-inline-completion-tracker | `main.js:176-177` | `offset()`, `width()` | `getBoundingClientRect()` |
| profile-image-generator | `main.js:683` | `element.closest('svg')` | `element[0].closest('svg')` |
| banner-generator | `main.js:355` | `e.originalEvent.key` | `e.key` |
| si-photography-catalogue | `main.js:684` | `offset()` in an unused directive | delete it |

Not a problem:
- No `.scope()` calls anywhere.
- No jQuery removal of Angular-managed DOM.
- ui-grid works identically on jqLite (3,000-row grid: sort, filter, paging, resize).
- The 3 student embed pages and 25+ other pages need nothing.

### D2. Remove the jQuery `<script>` tag from pages (app-side, per page, needs D1)

**Status: DONE.** The pages that still need jQuery are listed under Outcome.

- **Gain:** **30.2 KB gz and 3.4-4.9 ms of script evaluation per page.** This is the largest byte win
  available.
- **Pages:**
  - **12 pages need no code change:** media-catalogue, gift-quiz-converter, notes, sample-app,
    suggest-feature, content-template-access-modal, inline-completion-tracker/config,
    introduction-text, rive-player-editor, rive-player, course-roadmap, si-analytics.
  - **13 need a few lines** and **7 a medium effort.** The lists are in `reports/jquery.md` §5.
  - **6 can't drop it**, because select2 or toastr require jQuery: toolbox, 3d-model-viewer, si-admin,
    podcast-manager, si-studydesk-styles, photospheres index.
- Also noticed: `toolbox-photospheres/public/index.html` has its whole `<head>` duplicated, so jQuery
  and AngularJS load twice, and `course-development-reports` loads the 1.2 MB unminified `ui-grid.js`
  where `ui-grid.min.js` would save about 150 KB gz.

### D3. "suite" build: remove 38 core features nothing uses - `patches/suite-profile.patch`

**Status: APPLIED**, merged with D8 into the single `suite` profile that ships.

- **Gain:** **54.8 KB gz** (-5.8 KB, -9.5% vs the applied build) and about 8% faster script
  evaluation.
- **Removed:**
  - Directives: ngSwitch, ngPluralize, ngList, ngNonBindable, ngBindTemplate, ngClassEven/Odd, ngRef,
    ngPattern, ngMinlength.
  - Event directives: ng-dblclick/mouseup/mousemove/keyup/keypress/copy/cut/paste.
  - Inputs: date/time/datetime-local/month/week/range/email/url.
  - Filters: currency/number/json/lowercase/uppercase.
  - `$http`: JSONP and `$httpParamSerializerJQLike`.
  - Services: `$anchorScroll` (and ng-include `autoscroll`), `$$testability`, and the ngAnimate helper
    services (`$$animateJs`, `$$forceReflow`, `$$jqLite`, `$$Map`).
  - `$compile`: comment directives, ng-prop-*/ng-on-*, and multi-element `-start/-end`.
  - `angular.*` helpers: `reloadWithDebugInfo`, `errorHandlingConfig`,
    `UNSAFE_restoreLegacyJqLiteXHTMLReplacement`.
- The build is `node scripts/build-lib.js --profile=suite --install`, and the list is plain data in
  `scripts/profiles/suite.json`, so you can keep any item. Per-feature byte costs are in
  `reports/build.md` §5.
- **Breaks:**
  - **One page, through D4's side effect:** removing `$anchorScroll` means ng-include no longer pulls
    in `$location`, so this build also affected the **reaction-bar dashboard** (see D4). The app-side
    fix is now applied, and the dashboard checks identical on this build.
  - **Nothing else, from the removed features themselves.** The suite-wide check (75 page variants,
    scripted interactions, real clock) found nothing else beyond timing artifacts: tippy hover state,
    aborted font/CSS requests, podcast progress beacons. A ui-grid cell line on
    course-development-reports turned out to be flaky: it differs in some runs of the same build
    against itself, and two re-runs of this build were clean.
  - Silently, any future page or database-stored HTML that uses a removed feature: the directive
    just doesn't run.
  - The separate `angular-animate.js` module can no longer be loaded.

### D4. Lazy `$anchorScroll` in ng-include, so `$location` isn't instantiated on 25 pages - `patches/lazy-anchorscroll.patch`

- **Gain:** two fewer root watchers and no URL listeners or root click handler. That is about 5% off
  an idle digest and ~0.8 ms at boot.
- **Breaks: the reaction-bar dashboard. Confirmed by the suite-wide check:** clicking a group summary
  link no longer changes the page.
  - Its links set `#page=...`. Its `$(window).on('hashchange')` handler
    (`toolbox-reaction-bar/public/dashboard/sys/js/main.js:140-158`) sets `$root.page` but never
    starts a digest.
  - Today the `$location` service that ng-include quietly creates runs that digest.
- **Fix: APPLIED** (uncommitted, in the toolbox-reaction-bar repo). `m.$applyAsync()` is now at the
  end of `m.handleHashChange`. The suite-wide check confirms the dashboard navigates correctly on
  both the current build and the suite build.
- Also affected: `toolbox-pronunciation-guide/public/sys/js/main.js:343` sets `html5Mode`, which
  becomes inert (no visible effect found).
- **Status: APPLIED** (D3 needs it too; the `$anchorScroll` recipe in `scripts/features.json` was
  updated to match).

### D5. Already-cached templates skip `$http` - `patches/templaterequest-cache.patch`

**Status: APPLIED.** 0.78x is new time over old, so it takes 22% less time.

- **Gain:** ng-include/templateUrl creation a further 0.78x on top of the applied cache.
- **Breaks:** `$http` interceptors and `pendingRequests` no longer see repeat loads of a cached
  template. **No app uses either.** This is listed only because it is a visible change to a core
  service.

### D6. Re-run `| filter | orderBy | limitTo` in ng-repeat only when its inputs change - `patches/filter-memo.patch`

**Status: APPLIED.** Apps fixed: cards and buttons-and-tiles (drag-reorder), suggest-feature (votes),
pronunciation-guide ("Most popular"), group-discussion admin (unread/select filters) and 3d-model-viewer.
Every other piped ng-repeat was checked and is fine.

- **Gain:** today the whole filter pipeline re-runs on every digest. The patch gives 0.54x idle digest
  and 0.58x update on a 300-row filtered list.
- **Breaks:** editing an item's field *in place* no longer re-sorts or re-filters until the array or a
  filter argument is replaced.
- **Risky:** the cards and buttons-and-tiles themes' `orderBy:'index'`, where drag-reorder rewrites
  `index` in place (`cards/sys/js/main.js:172,316`, `buttons-and-tiles/sys/js/main.js:188,290`).
  suggest-feature's vote sort is risky for the same reason.
- **To check:** pronunciation-guide, photospheres admin, podcast-manager, si-admin, group-discussion
  admin and the 3d-viewer lists (full list in `reports/scope.md`).
- **Fix:** assign a new array after such edits (`list = list.slice()`).
- The patch is global, with no per-page switch.

### D7. `$applyAsync` flushes on a microtask instead of `setTimeout(0)` - `patches/applyasync-microtask.patch`

- **Gain:** updates appear ~4 ms sooner after each `m.$applyAsync()`, which is called in 417 places.
  CPU cost is unchanged.
- **Breaks:** ordering.
  - Code that awaits something right after `$applyAsync()` now sees the new DOM.
  - A `setTimeout(0)` registered earlier now runs after the digest.
  - Several fetch callbacks in one turn may digest more than once.
  - 9 `$applyAsync` specs need rewriting.
- **Status: DEFERRED (2026-10-25), kept as a possible later optimisation.** The patch is kept up to date
  in `patches/applyasync-microtask.patch`.
- **To do it later:**
  1. Rewrite the 9 `$applyAsync` specs that flush `$browser.defer` so they drain microtasks instead.
  2. Audit the busiest call sites (toolbox 37, media-catalogue 28, cards and buttons-and-tiles 27
     each, podcast-player 25, 3d-model-viewer 25, group-discussion 21) for the ordering patterns
     listed above. Look in particular for `m.$applyAsync()` followed by a DOM read or a
     `setTimeout(..., 0)` in the same function, and editors that call
     `window.parent.m.$applyAsync()` from watch listeners.
  3. Apply the patch, rebuild with `npm run build:suite`, and run `suite-ab` with `--interact
     --real-time` against the previous build.

### D8. D3 plus three more cuts ($location, CSP interpreter, XSRF)

**Status: APPLIED.** The three entries are part of `scripts/profiles/suite.json`, and the former
`suite-extended.json` was folded into it. The `$locationProvider` config was removed from
pronunciation-guide and si-studydesk-styles.
- **Gain:** **51.2 KB gz**.

| cut | gain (gz) | breaks |
|---|---|---|
| `$location` | 2.0 KB | pronunciation-guide `main.js:343` and si-studydesk-styles `main.js:365` inject `$locationProvider`; delete those config blocks |
| CSP expression interpreter | 1.1 KB | Any page served under a Content-Security-Policy without `unsafe-eval` stops evaluating expressions. No CSP was found in the apps or proxy config, but confirm Moodle/hosting doesn't add one. |
| XSRF cookie header | 0.2 KB | Any API relying on Angular sending `X-XSRF-TOKEN`; none was found |

**Suite-wide check result.** The `$locationProvider` breakage is confirmed and is the only new
breakage:
- `toolbox-pronunciation-guide` and `si-studydesk-styles` (website, editor and non-admin variants)
  fail to bootstrap with `$injector:unpr`.
- toolbox shows the same errors because it embeds both.
- Everything else matched D3.

Delete the two `$locationProvider` config blocks first if you want this.

## Future optimisations (not done)

- **D7, `$applyAsync` on a microtask.** See D7 above for the steps; the patch still applies.
- **Vendor angular-ui-grid into `si-manager/public/`**, like AngularJS. That would remove the last
  npm route that installs `angular` (ui-grid's hard dependency), and let ui-grid get si-manager's
  stamp/ETag caching. Only course-development-reports uses it.
- **Replace toastr** (photospheres index, si-studydesk-styles, 3d-model-viewer, si-admin) and
  **select2** (toolbox, 3d-model-viewer, si-admin, podcast-manager). Those are the only libraries
  still keeping jQuery on 6 pages, about 30 KB gz each.
- **`ng-csp="no-unsafe-eval"` on the 3 student `embed.html` pages:** about 0.81-0.88x cold boot (see
  below).
- **Stamp `/angular/angular.min.js` with si-manager's `?v=`** in apps whose html is rendered
  server-side. That gets the one-year immutable cache instead of a revalidation per load.
  `cacheHeaders.stampHTML` deliberately leaves cross-app absolute urls alone today.

## App-side tips found along the way (no library change)
- An `ng-if` on the same element as `ng-repeat` costs 25-30% of the digest on those pages:
  group-discussion `index.html:118-119`, and the cards and buttons-and-tiles galleries
  (`index.html:75/76`).
- 12 `ilar*` directives declare `transclude: true` and never use it. 80 ng-repeats have no
  `track by`.
- `ng-csp="no-unsafe-eval"` on the 3 short-lived `embed.html` pages cuts cold boot to about
  0.81-0.88x. Use it only there, because it slows later digests.
- `si-analytics` and `toolbox-course-roadmap` load a `sys/js/main.js` that isn't in their repos, so
  both pages are dead.

## Re-verifying
- **Tests:** the Karma harness used is not in the repo. Any Karma 6 + Jasmine setup that loads
  `angularFiles.mergeFilesFor('karma')` / `('karmaJquery')` works.
- **Minified output:** `node scripts/verify-minified.js` runs the Karma suite against it.
- **Suite-wide:** `suite-ab/` (see its README). Always use `--real-time`: the frozen clock breaks
  pages that poll with `setInterval`. `compare-runs.py` diffs two runs, e.g. a frozen copy of the apps
  (`SUITE_APPS=/copy`) before an edit against the live apps after it.
- **Build tools:** run `npm run build:tools` once. It installs terser, acorn, acorn-walk,
  magic-string and eslint-scope into `scripts/build-tools/`, away from the legacy Grunt/Karma
  devDependencies. After that, `npm run build:suite` builds the shipped file and `npm run
  release:si-manager` publishes it.
- **The reports:** `reports/` has each worker's full write-up. Paths there starting with `$S/` refer to
  a temporary scratch folder that no longer exists; their patches are the ones in `patches/`.
