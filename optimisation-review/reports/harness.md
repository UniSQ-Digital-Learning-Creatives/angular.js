# suite-ab harness report

Tool: `$S/opt/suite-ab/` (README.md there has usage). 75 page entries = the 46 in-scope pages (the brief says 48; its own list expands to 46 distinct html files and a grep of every angular-loading html outside non-toolbox/res-old finds the same 46) plus 29 extra variants (embed variants, other query modes, podcast-manager sub-pages, photospheres/3D modes, styles pages).

## Commands

```
cd $S/opt/suite-ab
CUR=/mnt/109313D2109313D2/sync/www/work/libs/angular.js/angular.min.js
node ab.js --list
node ab.js --a $CUR --b <candidate angular.min.js> --interact            # full suite, SAME/DIFF per page (exit 1 on any DIFF)
node ab.js --a $CUR --b <cand> --pages 'gen-*,toolbox' --runs 7          # subset + interleaved timing (B/A ratios of ScriptDuration etc.)
node ab.js --a $CUR --b <cand> --b-nojquery [stash|ngjq] --interact      # B with jQuery hidden from angular
node check.js --pages toolbox --text 40 --shot [--nojquery]              # one build: render, errors, unknown endpoints, screenshot
```
Output: `results/<ts>/{report.md,summary.json,A/,B/,diffs/}`. Use `--real-time` to unfreeze the clock (see flaky list).

## Design summary
One origin like HAProxy; each app mounted at its production prefix from haproxy prod cfg + index.js mounts (generators at /image-generators and /banner-generator; group-discussion admin at /group-discussion/manage/; media-catalogue at /media-catalogue-test (prod /media-catalogue is routed to si-photography-catalogue, which is served at /photography-gallery); styles website at /styles/admin/; status dashboard at "/" like prod; toolbox at /ilar-toolbox, /editor-popups, /studydesk-toolbox, /images). si-manager is the root app (/node_modules, /utilities.js, /get-session-formatted). Angular requests (`.../angular/angular(.min).js`) are served from `--a`/`--b` files; two servers (A, B) per run on random ports, reset before each page. Browser side: frozen clock (2026-03-02T01:00Z, whole-minute steps), seeded Math.random/crypto, Brisbane TZ, fresh context per load, external hosts answered with empty stubs and logged (`blocked`), dialogs dismissed, top-level navigations aborted and logged, `window.open`/`print` stubbed. socket.io client is stubbed (group-discussion/notes workers added fake socket *servers* for their pages). Unknown endpoints are logged and answered `[]`/`{}`; analytics beacons -> 204.

Settle = no in-flight request, no `$http` pending, no digest, DOM signature (hash of full outerHTML incl. same-origin iframes) unchanged for 700 ms (max 20 s). Snapshot normalisation, comparison categories, interaction planning (plan derived on A and replayed verbatim on B), timing method: see README.md.

### No-jQuery mode
`--b-nojquery stash` (default): the server rewrites html so `window.jQuery` is stashed+deleted by an inline script right before `<script src=".../angular(.min).js">` and restored right after, so angular binds to jqLite while select2/tippy/ui-grid plugins and page code keep jQuery. `ngjq`: adds `ng-jq=""` to `<html>` (upstream-supported; ignored by a build that dropped ng-jq support). Verified: both give identical results on the pages compared; the runner prints `angular.element` identity per page (`jq=jQuery 3.7.1 / jqLite`). Caveats: models "angular uses jqLite", not "the jQuery code paths were deleted from the fork"; only works for plain script-tag loading (true everywhere in the suite).

## A=B validation
- Fork root `angular.min.js` against itself, `--interact`, with fixture workers' per-group runs and my full runs:
  - toolbox group (10 pages): 9/10 SAME x3 before four normaliser rules were added (the `toolbox` diff was traced to them: URL-encoded origin in errors, origin inside query values, ingest-bulk beacon timing, `object:N` ng-options values); all four are now in `lib/`.
  - generators (21 ids): 21/21 SAME on a full run and several partial runs; one later full run under 2x machine load had 2 DIFF (course-banner rAF-set `display:none` rect, b&t embed-standard transient `translateZ`), embed one scrubbed afterwards (9 embeds 9/9 SAME).
  - discussion/notes/podcast group (17 ids): 16/17, 16/17, 17/17 (misses were podcast-manager-episode iframe still loading, and one stylesheet request; both addressed afterwards).
  - catalogue/admin group (25 ids): 25/25 SAME on 4 runs.
  - My full non-generator run (A=A, 54 pages, `--interact`, machine load average ~60-68): **49/54 SAME**. The 5 DIFF were not build differences: course-development-reports (empty `<!-- -->` comment nodes from ui-grid, timing), media-catalogue (hidden tippy root lingering in one step), the two 3D-viewer pages (model-viewer load race under load: canvas size / `line-show` / x1..y2), toolbox (`ERR_ABORTED` css/font entries at teardown). Fixes applied afterwards (snapshot: empty comments dropped, hidden tippy roots dropped; ab.js: ERR_ABORTED failed entries ignored; 3D fixture scrubs; per-step request lists no longer compared, page-level request multiset still is; `/prefix` -> `/prefix/` 301 for app roots like express.static, which removed ~50 spurious `/sys/...` 404s on the toolbox page). **I did not get a clean second full run after those last fixes** (a final full A=A run was started and stopped by the lead's wrap-up request after 3 pages, all SAME), so treat the A=B result as "per-group clean, full-suite 49/54 before the last 5 fixes".
- Detection check: fork current vs `$S/bench/angular-baseline.min.js` (this is the fork at commit 74a4ce1a2, `1.8.3-local.74a4ce1a2`, not pristine upstream): within the first 3 pages it already reported DIFF on si-manager-status-dashboard, si-manager-toolbox-feedback and course-development-checklist: the `<style>` element angular injects at load is 215 chars in the fork now vs 237 in the baseline (visible at `A:3 B:3` of every page, and in every interaction step). The run was stopped after those 3 pages.

## Lead's observations (not re-run by me)
- With the default frozen clock `si-photography-catalogue` differs between builds because its 150 ms `setInterval` poll lands differently; identical with `--real-time`.
- `gen-cards` and `gen-buttons-and-tiles` interaction steps are flaky even A=A (hover-then-click racing popup wiring, repaintButtons transform marks).
- Podcast pages embed the server port in base64 URLs, so A and B always differ there unless the base64 normaliser in ab.js (applied to request lists only, not DOM) is extended to the DOM.
- Error URLs embed the build's version string (`errors.angularjs.org/<ver>`); scrubbed in console/page errors and DOM text since, but not inside every DOM attribute.

## Known gaps / flaky
- Realtime (socket) behaviour is faked per page only (group-discussion, notes, photospheres joins); no real multi-user flows.
- Timing-dependent: 3D viewer (WebGL load under load), media-catalogue infinite scroll (steps ordered last), si-photography-catalogue favourites race (list delayed 400 ms), podcast-player speed race (fetch delayed 450 ms), reaction-bar first paint (get-reaction-data delayed 250 ms). All delays are in the fixtures.
- Dead pages in the repo (render only an `$injector:modulerr` error in both builds): si-analytics (`/analytics/` serves no static files; main.js/css/chart.js deleted) and toolbox-course-roadmap (empty sys dirs).
- Blocked externals (empty stubs): unpkg Rive (stubbed by a fake `window.rive` in the generators fixture), lor.usq.edu.au, Moodle edit/repository endpoints, Vimeo/Panopto, fonts/CDNs.
- Not driven: toolbox F9 power-user mode, h5p-templates page, Admin/Stylesheets tabs (generic only), anything that submits/downloads/navigates, drag and drop, file uploads (except gift converter, fed by the fixture).
- Normalisation hides: empty comment nodes, hidden tippy roots, transition/animation style declarations, GET css/img/font/media request lines, analytics ingest beacons, ERR_ABORTED failures, per-step request lists.

## Coverage table (generated from the fixtures; "steps" = hand-written interaction steps, then generic ones unless "generic off"; "routes" = number of route registrations in the page's app module)
| page id | url (query keys) | app module | session | steps | routes |
|---|---|---|---|---|---|
| si-manager-status-dashboard | / | si-manager | staff | 0 + generic | 17 |
| si-manager-toolbox-feedback | /toolbox-feedback/ | si-manager | staff | 0 + generic | 17 |
| course-development-checklist | /leap-content-checklist/?sessionID&checklistID&courseLabel&navigation | course-development-checklist | staff | 6 (generic off) | 2 |
| course-development-checklist-section | /leap-content-checklist/?sessionID&checklistID&courseLabel&navigation&associatedSection | course-development-checklist | staff | 6 (generic off) | 2 |
| course-development-reports | /course-development-reports/ | course-development-reports | staff | 9 (generic off) | 6 |
| media-catalogue | /media-catalogue-test/?sessionID&mode | media-catalogue | staff | 27 (generic off) | 25 |
| media-catalogue-standalone | /media-catalogue-test/?mode | media-catalogue | staff | 0 + generic | 25 |
| podcast-manager | /podcast-manager/ | podcast-manager | staff | 3 + generic | 17 |
| podcast-manager-podcast | /podcast-manager/?page&podcastID | podcast-manager | staff | 2 + generic | 17 |
| podcast-manager-episode | /podcast-manager/?page&episodeID | podcast-manager | staff | 2 + generic | 17 |
| podcast-manager-edit-episode | /podcast-manager/?page&episodeID | podcast-manager | staff | 4 + generic | 17 |
| podcast-manager-upload-episode | /podcast-manager/?page&podcastID | podcast-manager | staff | 3 + generic | 17 |
| podcast-manager-create-podcast | /podcast-manager/?page | podcast-manager | staff | 3 + generic | 17 |
| podcast-manager-edit-podcast | /podcast-manager/?page&podcastID | podcast-manager | staff | 2 + generic | 17 |
| si-admin | /admin/?sessionID | si-admin | staff | 10 (generic off) | 7 |
| si-admin-toolbox | /admin/?sessionID&page | si-admin | staff | 4 (generic off) | 7 |
| si-analytics | /analytics/ | si-analytics | staff | 0 (generic off) | 4 |
| si-photography-catalogue | /photography-gallery/?sessionID&mode | si-photography-catalogue | staff | 13 (generic off) | 6 |
| si-photography-catalogue-modal | /photography-gallery/?sessionID&mode&page&photo | si-photography-catalogue | staff | 0 + generic | 6 |
| si-studydesk-styles-website | /styles/admin/?sessionID | si-studydesk-styles | staff | 2 (generic off) | 6 |
| si-studydesk-styles-editor | /styles/admin/?sessionID&file&page | si-studydesk-styles | staff | 3 (generic off) | 6 |
| si-studydesk-styles-nonadmin | /styles/admin/?sessionID | si-studydesk-styles | student | 0 + generic | 6 |
| toolbox-3d-model-viewer | /3d-model-viewer/?modelID | toolbox-3d-model-viewer | staff | 6 (generic off) | 13 |
| toolbox-3d-model-viewer-editing | /3d-model-viewer/?modelID&editing | toolbox-3d-model-viewer | staff | 1 (generic off) | 13 |
| toolbox-3d-model-viewer-all | /3d-model-viewer/?modelID&editing | toolbox-3d-model-viewer | staff | 3 (generic off) | 13 |
| toolbox-3d-model-viewer-new | /3d-model-viewer/?modelID&editing | toolbox-3d-model-viewer | staff | 0 + generic | 13 |
| toolbox-course-roadmap | /roadmapper/?roadmapID | toolbox-course-roadmap | staff | 0 (generic off) | 1 |
| gen-banner-generator | /image-generators/banner-generator/?mode | toolbox-generators | staff | 8 + generic | 40 |
| gen-buttons-and-tiles | /image-generators/buttons-and-tiles/?mode | toolbox-generators | staff | 28 + generic | 40 |
| gen-cards | /image-generators/cards/?mode | toolbox-generators | staff | 34 (generic off) | 40 |
| gen-counter-button-editor | /image-generators/counter-button-editor/?mode | toolbox-generators | staff | 10 + generic | 40 |
| gen-course-banner-generator | /image-generators/course-banner-generator/?mode | toolbox-generators | staff | 6 + generic | 40 |
| gen-horizontal-rule | /image-generators/horizontal-rule/ | toolbox-generators | staff | 1 + generic | 40 |
| gen-introduction-text | /image-generators/introduction-text/?mode | toolbox-generators | staff | 6 + generic | 40 |
| gen-profile-image-generator | /image-generators/profile-image-generator/?mode | toolbox-generators | staff | 2 + generic | 40 |
| gen-resource-templates | /image-generators/resource-templates/?mode | toolbox-generators | staff | 6 + generic | 40 |
| gen-rive-player-editor | /image-generators/rive-player-editor/?mode | toolbox-generators | staff | 6 + generic | 40 |
| gen-rive-player | /image-generators/rive-player/?rive&stateMachine&autoplay | toolbox-generators | staff | 1 + generic | 40 |
| gen-tables | /image-generators/tables/?mode | toolbox-generators | staff | 10 + generic | 40 |
| gen-buttons-and-tiles-embed | /image-generators/buttons-and-tiles/embed.html?id | toolbox-generators | student | 1 + generic | 40 |
| gen-buttons-and-tiles-embed-standard | /image-generators/buttons-and-tiles/embed.html?id | toolbox-generators | student | 0 (generic off) | 40 |
| gen-buttons-and-tiles-embed-large | /image-generators/buttons-and-tiles/embed.html?id | toolbox-generators | student | 1 + generic | 40 |
| gen-buttons-and-tiles-embed-banner | /image-generators/buttons-and-tiles/embed.html?id&mode | toolbox-generators | student | 0 (generic off) | 40 |
| gen-cards-embed | /image-generators/cards/embed.html?id | toolbox-generators | student | 4 + generic | 40 |
| gen-cards-embed-link | /image-generators/cards/embed.html?id | toolbox-generators | student | 0 (generic off) | 40 |
| gen-cards-embed-plain | /image-generators/cards/embed.html?id | toolbox-generators | student | 0 (generic off) | 40 |
| gen-counter-button-editor-embed | /image-generators/counter-button-editor/embed.html?cdtID&data | toolbox-generators | student | 0 (generic off) | 40 |
| gen-counter-button-editor-embed-partial | /image-generators/counter-button-editor/embed.html?cdtID&data | toolbox-generators | student | 0 (generic off) | 40 |
| toolbox-gift-quiz-converter | /gift/ | toolbox-gift-quiz-converter | staff | 7 + generic | 3 |
| toolbox-group-discussion | /group-discussion/?discussionID&courseLabel&title&mode&originActivity | toolbox-group-discussion | staff | 21 + generic | 9 |
| toolbox-group-discussion-admin | /group-discussion/manage/ | toolbox-group-discussion | staff | 6 + generic | 9 |
| toolbox-inline-completion-tracker | /inline-completion-tracker/?id | toolbox-inline-completion-tracker | staff | 0 + generic | 8 |
| toolbox-inline-completion-tracker-config | /inline-completion-tracker/config/ | toolbox-inline-completion-tracker | staff | 6 + generic | 8 |
| toolbox-notes | /notes/ | toolbox-notes | staff | 21 + generic | 23 |
| toolbox-notes-shared | /notes/?editorID | toolbox-notes | staff | 4 + generic | 23 |
| toolbox-photospheres | /photospheres/?sessionID&serverID | toolbox-photospheres | staff | 8 (generic off) | 18 |
| toolbox-photospheres-guided | /photospheres/?sessionID&serverID | toolbox-photospheres | staff | 0 + generic | 18 |
| toolbox-photospheres-debug | /photospheres/?sessionID&serverID&debug | toolbox-photospheres | staff | 0 + generic | 18 |
| toolbox-photospheres-admin | /photospheres/admin/ | toolbox-photospheres | staff | 3 (generic off) | 18 |
| toolbox-photospheres-admin-collections | /photospheres/admin/?galleryTab | toolbox-photospheres | staff | 0 + generic | 18 |
| toolbox-photospheres-admin-session | /photospheres/admin/?page&galleryTab&sessionID | toolbox-photospheres | staff | 2 (generic off) | 18 |
| toolbox-photospheres-admin-collection | /photospheres/admin/?page&galleryTab&photosphereID | toolbox-photospheres | staff | 0 + generic | 18 |
| toolbox-podcast-player | /podcast-player/?rss&episode&title&podcastID | toolbox-podcast-player | staff | 7 + generic | 9 |
| toolbox-podcast-player-episodeid | /podcast-player/?episodeID | toolbox-podcast-player | staff | 4 + generic | 9 |
| toolbox-previews | /previews/reactions/?type&title&previewReactionBar&previewHeight | toolbox-previews | staff | 2 (generic off) | 1 |
| toolbox-previews-audio-player | /previews/podcast-player/?title&author&mp3&image&previewHeight | toolbox-previews | staff | 2 (generic off) | 1 |
| toolbox-pronunciation-guide | /pronunciation-ilar/?contentID | toolbox-pronunciation-guide | staff | 17 + generic | 6 |
| reaction-bar | /reactions/?title&type&sub-type&id | toolbox-reaction-bar | staff | 5 + generic | 5 |
| reaction-bar-dashboard | /reactions/dashboard/ | toolbox-reaction-bar | staff | 5 + generic | 5 |
| reaction-bar-injector | /reactions/injector.html?title&type&sub-type&id | toolbox-reaction-bar | staff | 3 + generic | 5 |
| reaction-bar-modal | /reactions/modal.html?uuid&userID&instanceID&title | toolbox-reaction-bar | staff | 3 + generic | 5 |
| sample-app | /sample/ | toolbox-sample-app | staff | 0 (generic off) | 0 |
| suggest-feature | /suggest-feature/?boardID&sessionID&sessionData | toolbox-suggest-feature | staff | 12 + generic | 2 |
| toolbox | /ilar-toolbox/ | toolbox | staff | 52 + generic | 42 |
| toolbox-content-template-access-modal | /ilar-toolbox/content-template-access-modal/ | toolbox | staff | 4 + generic | 42 |

## No-jQuery first findings (angular on jqLite, jQuery still on the page)
Pages that break or change (file:line in apps):
- si-manager toolbox-feedback: `public/toolbox-feedback/main.js:92-100` `stars` directive: `element.find('.stars-filled .star')` (class selector) then `.each` -> `TypeError: filledStars.each is not a function` (console error; DOM differs by 4 lines).
- toolbox-reaction-bar `public/sys/js/main.js:387` tooltip directive: `element.offset is not a function` (on mouseover).
- toolbox `public/sys/js/main.js:2814` select2 directive (`element.select2`) and `sys/pages/podcast-player.html:12,:25`; `public/index.html:126` `ng-style="{'height': previewItem.maxHeight}"` (jQuery appends `px` to a number, jqLite does not, so the preview panel collapses).
- podcast-manager `html/sys/js/main.js:298` `element.select2 is not a function` (4 pages).
- si-admin (2 pages) and toolbox-3d-model-viewer-editing: `element.select2 is not a function` (si-admin 3 / 2 page errors; 3D editing 2 console errors, DOM 505 vs 519 lines).
- toolbox-pronunciation-guide `public/sys/js/main.js:360-362, 383, 409`: `element.find('.play-button')` finds nothing under jqLite (~49 errors on load); fix `element[0].querySelector(...)`.
- toolbox-podcast-player `public/sys/js/main.js:510, 771` `e.originalEvent` undefined (seek throws), `element.offset()`/`.width()` at 511-513, 530-531, `$(window)`/`$(document)` throughout.
- toolbox-inline-completion-tracker `public/sys/js/main.js:176-177` `element.offset()`/`.width()` (hover only).
- Clean in no-jQuery mode (no new errors/diffs): suggest-feature, sample-app, previews, reaction-bar-dashboard/injector/modal, media-catalogue family, course-development-reports/checklist, group-discussion (already jqLite), notes, gift converter, photospheres, styles, all 21 generator ids (editors' `check.js --nojquery` showed no new errors; I did not run a full A/B `--b-nojquery --interact` across all pages).
This list comes from fixture workers' `check.js`/`ab.js --b-nojquery` runs per group plus my two-page runs; it is a first list, not exhaustive: interaction coverage is partial (e.g. jQuery-only calls inside hover/drag handlers not exercised).

## Real app bugs noticed while building fixtures
(see worker appendices below; all reproduce in the current apps, independent of the angular build)

## Appendix: per-group worker reports (condensed)
## Group 1 worker report (toolbox shell, previews, reaction-bar x4, sample-app, suggest-feature)
- toolbox: 29 items, 4 favourites, layout templates (5 sections/2 subsections/7 books/21 chapters), 5 course templates, lists of guides/photospheres/models/podcasts/discussions/audio/forums. Session access overridden to drop presentation-mode. Every route in toolbox/index.js (~30) stubbed, in-memory state for section access/templates/audio. Extra modules: /images (real images, /images/icons/*.svg recoloured via ?colour/circle/glyph), /announcements/fetch-forum-data pseudo-app, /usage-report stand-in page (leap-components not checked out; Reports tab frames it), /fetch-settings+/save-settings (editorFavourites). Cross-app r.abs: pronunciation guides, photosphere sessions, 3D models, podcast-manager get-all, group-discussion fetch-all, notes course-settings. 48 interact steps (search, sorts, favourites, preview, template pickers, install screens for 7 items, suggestions tab, reports tab). Gaps: F9 power user, h5p-templates page not reachable, Admin/Stylesheets tabs generic only.
- toolbox-content-template-access-modal: waits for ilar-manager postMessage; fixture injects a sender. 4 steps. /schools.json names differ from production ("Business,Law,...").
- reaction-bar (?title&type&sub-type&id): thumbs-up + saved comment (uuid via app's uuidv5), get-reaction-data answered 250ms late to avoid first-paint race. 5 steps.
- reaction-bar-dashboard: 40 students, ~295 reactions, 82 comments; chart.js. 5 steps. Comments unique on purpose (ng-repeat without track by throws ngRepeat:dupes with duplicates: real app bug).
- reaction-bar-injector: raw file is a template with {origin} placeholders (substituted); lacks utilities.js (getQuery undefined; fixture injects); genuine errors remain: /reactions/sys/css/styles.css 404, tooltip="Yes, it was" attrs $eval'd -> $parse:syntax (4 errors).
- reaction-bar-modal: sessionStorage seeded; 3 steps.
- suggest-feature: port of old in-memory backend (14 visible + 1 hidden, boardID=toolbox); needs sessionData in query (with only sessionID, ResizeObserver.observe(.wrapper) races ng-if -> blank page: real app race). 12 steps. Real bug: upvoteSuggestion un-upvote uses downvotes.filter.
- toolbox-previews: unknown first segment serves shell reproduced; pages toolbox-previews and toolbox-previews-audio-player (extra). 
- sample-app: index.html has empty body; renders nothing; no routes.
- no-jQuery (stash) on these 10: 8 SAME. reaction-bar: element.offset is not a function (main.js:387 tooltip directive on mouseover). toolbox: element.select2 is not a function (podcast-player.html:12,:25; directive main.js:2814); preview panel loses height: index.html:126 ng-style={'height': previewItem.maxHeight} (jQuery adds px to numbers, jqLite sets nothing).

## Group 2 worker report (toolbox-generators)
21 page ids (15 assigned + 6 variants), all render saved data. Parent-supplied state: editors read window.parent.m.$root.newIlar, embeds read window.name; fixture serves real index.html/embed.html with one small script added (editors: angular.module(<ng-app>).run seeds $rootScope.newIlar; embeds: window.name=<data> in the exact encoding embed decodes; ?id= picks the design). 
- Editors re-opened with saved design: buttons-and-tiles (6 tiles + 14-template gallery, 2 pages), cards (6 flip cards + gallery), counter-button-editor (graphic + nested embed iframe), tables (5x9 alt-rows-vert), introduction-text and resource-templates (data-toolbox-config), profile-image-generator (stored source restored), rive-player-editor. Blank: banner-generator, course-banner-generator, horizontal-rule. rive-player: autoplay=false.
- Embeds (jqLite, student session): buttons-and-tiles-embed (+standard/large/banner variants), cards-embed (+link/plain), counter-button-editor-embed (+partial).
- Endpoints: fetch-buttons-and-tiles-data, fetch-all-buttons-and-tiles-templates, -existing (paged by 12), fetch-cards-data, fetch-all-cards-existing, fetch-image, save-buttons-and-tiles-template, save-cards-template (state), save-profile-image, save-rive-file, download-base64, banner. abs: /photography-gallery/photos/:id, profile-image storage (.webp/.svg), /storage/*/rive-player and /interactives .riv.
- Steps: b&t editor ~16 (layout, align, colour dot, icon option, 3 themes, text popup, icon picker, change image, add/remove tile, save as template, gallery, filter, search, load template); cards ~16; counter editor +/- and number inputs; embeds click tile / flip cards. Injected toolbox chrome stand-ins ("Save as template" button, photo strip), hover-before-click for overlay popups (race), plain window.m for profile-image-generator, fetch shim for storage port, a stub of window.rive.Rive (unpkg blocked).
- Blocked: unpkg.com (Rive), lor.usq.edu.au (horizontal-rule hero), Moodle edit.php/repository_ajax.php (never reached).
- Scrubs: tippy ids, repaintButtons/repaintCards transform marks (timing race). Residual flakes under load: course-banner rect display:none set from rAF; b&t-embed-standard transient translateZ.
- --nojquery: no new errors on any of these pages (jQuery stays on page).
- App bugs: profile-image-generator storageBase() drops port; counter-button-editor setScale() throws clientWidth of null without ?mode=toolbox; buttons-and-tiles/cards res/embed.js vanilla renderer unused; rive-player/main.js stray console.log(12312312).

## Group 3 worker report (group-discussion, notes, podcast, inline tracker, pronunciation, gift)
- toolbox-group-discussion: 33 messages (threads, images, 4 link previews, 3 anonymous, reactions, edited/deleted, unread markers, roster). Endpoints: GET / (with fake socket SERVER injected after the io stub: register->sync, new-message, toggle-reaction, edit, delete answered like index.js; patches io.engine), fetch-roster, new-messages-for-user, upload-image, set-discussion-page, update-viewed, catch-up/discussions, fetch-all. 20 steps (react, toggle pill, reply with link, @mention, anon post, lightbox, jump, scroll latest, edit with confirm, delete).
- toolbox-group-discussion-admin: 8 catch-up discussions, first unread auto-opens in iframe with the same fake socket server. steps: unread toggle, open discussions.
- toolbox-notes (+extra toolbox-notes-shared): 11 documents, 5 comment threads with replies/reactions, 9 revisions; all 22 routes incl docx export/print stubs; socket join answered. 21 steps. TinyMCE served from toolbox-notes' own node_modules (si-manager lacks tinymce? served via fallback, logged).
- podcast-manager: owns podcasts/episodes state: podcasts get/get-all/get-all-admin/rss/new/edit/delete; episodes get/get-all/new/edit/delete; data get-presenters/get-courses/get-schools; /storage/<env>/podcast-manager/* stub. Pages: dashboard + extras podcast-manager-podcast, -episode, -edit-episode, -upload-episode, -create-podcast, -edit-podcast (select2). Steps: filter, tippy drawer, typing/selects, nothing submits.
- toolbox-podcast-player (rss mode) + toolbox-podcast-player-episodeid: fetch, fetch-rss, fetch-image, fetch-episode, get/save-progress, get-transcript, get-panopto-status, ingest-new-media. fetch delayed 450ms (load-order race sets speed 1.2x half the time). Steps: rewind/forward/volume/play/pause/seek.
- inline-completion-tracker (12 cells) and -config (served with a preamble giving m activity/user as parent would). 6 steps.
- pronunciation-guide: 82 items (lazy loader 48 at a time), /elor/* audio+images. 17 steps.
- gift-quiz-converter: converts a .docx; served page feeds sample docx (from the app res/) through the file input on load and each click on drop zone. 
- Harness normalisation applied (ab.js): request/failed lists drop POST /analytics/ingest*, GET css/img/font/media requests, anything with %7B%7B; origins incl. in base64 query values -> HOST.
- No-jQuery breakages: podcast-manager main.js:298 element.select2 (4 pages); pronunciation-guide main.js:360-362,383,409 element.find('.play-button') returns nothing under jqLite (~49 errors on load; fix element[0].querySelector); podcast-player main.js:510,771 e.originalEvent undefined, element.offset()/.width() at 511-513,530-531, $(window)/$(document) throughout; inline-completion-tracker main.js:176-177 element.offset()/.width() (hover only). Group discussion pages already jqLite; notes, gift clean.
- App bugs: group-discussion main.js sync handler partial reaction/link-preview patches call setDayTime() with no date -> shows "now"; podcast-manager /api/podcasts/get-all filters lowercase coursecode, req.query.username never sent; podcast-manager episode.html iframe uses src not ng-src (requests literal template text); podcast-player episode.mp3.indexOf(location.host) inverted, transcript checkOnly inverted, 1.2x speed race.

## Group 4 worker report (catalogue/checklist/admin/photospheres/3d/styles)
- media-catalogue (+standalone): 650 photos, 13 collections, history, share log, 16-person staff dir; all api/* handlers; photos/<file> + download redirect to img(). 25 steps incl modals, search, sort, favourite, share autocomplete, infinite scroll last (scroll-paging race otherwise).
- course-development-reports: 902 courses (ui-grid pages 500 rows, virtualised), six fetch-checklist-* routes, 9 steps (pager, filters, sort, school multi-select modal). Runs angular on jQuery? page loads jquery; uses global $.getJSON; works with jqLite angular.
- course-development-checklist (2 pages, jqLite): all 8 LEAP sections + single-section mode; fetch-content (two content versions), sections; 6 steps each.
- si-admin (2 pages: manage-access, page=toolbox): 130 editors, 14 groups, 220 courses; 10 steps.
- si-analytics: DEAD PAGE in prod: index.js serves no static files, sys/js/main.js, sys/css/styles.css and chart.js/qs/chroma deleted -> /analytics/ 404 in production; harness loads index.html and gets [$injector:modulerr]. Endpoints stubbed anyway. No steps.
- toolbox-course-roadmap: also DEAD (sys/js, sys/css, sys/pages empty dirs) -> modulerr. fetch-roadmap-data served.
- si-photography-catalogue (2 pages): 1200 photos sent at once; list delayed 400ms (app race: photo.favourited only set if user arrived before list); 13 steps.
- toolbox-photospheres (7 pages: viewer, guided, debug, admin sessions/collections/edit-session/edit-collection): 8 collections, 18 sessions, pannellum on swiftshader w/ generated equirect svg; every index.js route with version/409 behaviour. 
- toolbox-3d-model-viewer (4 pages): 12 models, 10 annotations, generated valid GLB cube; per-page scrubs for model-viewer wall-clock animation; 6 steps.
- si-studydesk-styles (3 pages): gallery of 34 real stylesheets; editor opens real cards.css in monaco; non-admin page. Needs admin-only session (default staff includes presentation-mode which this app rejects).
- No-jQuery (stash): 22/25 identical. si-admin (3 page errors), si-admin-toolbox (2), toolbox-3d-model-viewer-editing (2 console, DOM 505 vs 519 lines): element.select2 is not a function (app select2 directive). Only real jQuery dependency among these.
- App bugs: course-development-reports durationTimeFilter hours always 0; photospheres index.html head duplicated -> utilities.js loaded twice, 'Identifier deliveredSessionCallbacks has already been declared' on every viewer page; photospheres admin gallery previews relative multires/ under /photospheres/admin/ (404 in prod?); createNewPhotosphere reads data.insertedId but server returns doc and client posts to photosphere-upload which no route serves; si-admin removeCourseFromWhitelist posts nested course[regex][regex].

