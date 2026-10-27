# Writing fixtures for the suite-ab harness

Dir: `$S/opt/suite-ab` (S = /tmp/claude-1000/-mnt-109313D2109313D2-sync-www-work-libs-angular-js/17fd069a-7c9d-4c88-9345-d3423566c242/scratchpad).
Read-only on the apps (`/mnt/109313D2109313D2/sync/www/work/apps`) and on the fork. Never `pkill`/`killall` by pattern; kill by recorded PID only; leave nothing running.

## What exists
- `server.js` one-origin server (like HAProxy). Serves each app's public folder at its production prefix, si-manager's
  `/node_modules`, `/utilities.js`, `/styles/...`, toolbox's `/ilar-toolbox/sys/...`, plus fixture routes. Unknown non-asset requests are LOGGED and
  answered `[]` (GET) / `{}` (other). Missing assets 404 and are logged. Analytics beacons (POST .../ingest*) -> 204. External hosts are blocked in the browser.
  socket.io client is stubbed (`/socket.io/socket.io.js`): `window.io()` returns a deterministic fake socket; tests can push events with `window.__sockets[0].__fire('event', data)`.
- `fixtures/<app>.js` one module per app (skeletons already exist for every app with static dir, prefixes and page list, `routes(r)` empty). `fixtures/_si-manager.js` is the root app
  (session, settings, courses-and-schools.json, schools.json, status-data ...). A fixture file may export an ARRAY of modules (to declare extra pseudo-apps, e.g. a stub for an out-of-scope
  app whose endpoints an in-scope page calls, like `/announcements/...`).
- `check.js` debug one build: `node check.js --pages <id,glob> [--text N] [--dom N] [--shot] [--interact] [--log]` prints settle status, pageErrors, console errors/warnings,
  failed/404 requests, blocked external requests, `server.unknown` (endpoints your fixtures don't cover yet), `server.missing` (assets 404). `--shot` writes
  `results/check/<id>.png` - READ IT with the Read tool to see what the page really looks like (do this for every page).
- `ab.js` the A/B runner: `node ab.js --a F --b F --pages <glob> [--interact]` (F = /mnt/109313D2109313D2/sync/www/work/libs/angular.js/angular.min.js). A=B must give SAME.
- `lib/shared.js` helpers: `oid(kind,n)` deterministic 24-hex id, `uuid(kind,n)`, `lorem(seed,nWords)`, `img(w,h,label)` placeholder image URL (served by harness), `AUDIO` silent wav URL,
  `NOW`/`DAY` (fixed clock: 2026-03-02T01:00Z; the browser clock is frozen to the same), `USERS`, `buildSession`.

## Module format
```js
module.exports = {
  name: 'toolbox-notes', prefixes: ['/notes'], ownNodeModules: `${APPS}/toolbox-notes/node_modules`,
  static: [ `${APPS}/toolbox-notes/public`, {dir: `${APPS}/x/other`, mount: '/sub'} ],   // mount: url sub-path (relative to prefix) -> dir
  pages: [ {id, path, query:{...}, session:{role:'student'|'staff', access:[..], activity:{courseLabel,..}, user:{..}},
            interact:{steps:[{kind:'click'|'type'|'select', sel:'css', text, index, label}], generic:true}, // hand-written steps run first, then generic auto-interactions
            scrub:[['regex','replacement']],   // extra normalisation of snapshot lines (regex strings), for volatile text only you identified
            dropAttrs:['data-foo'], settle:{quietMs, maxMs}, realTime:false, notes:'' } ],
  init(state, global, shared) {},          // seed the per-server in-memory state (re-run on every reset, i.e. before every page load)
  routes(r, shared) {
    r.get('fetch-things', ctx => [...])      // path relative to the app prefix; ':id' segments and trailing '*' supported; RegExp ok
    r.post('save-thing', ctx => { ctx.state.things.push(ctx.body); return {ok:true} })
    r.all(...)
    r.abs('GET', '/other-app/api/x', ctx => ...)   // absolute path stub for ANOTHER app's endpoint; app-owned routes take precedence over abs routes
  },
}
```
`ctx`: `query`, `body` (JSON / urlencoded parsed; multipart only simple text fields; raw Buffer in `ctx.raw`), `params`, `state` (this app's state), `global.session`, `session`,
`json(data,status)`, `text()`, `html()`, `status(code)`, `noContent()`, `redirect()`, `file(path)`, `appState(name)`. Return a value to send it as JSON (string -> text, undefined -> 204).
Page URL = origin + path + '?' + query (the pages are normally iframes inside Moodle that get `sessionID`/`mode`/`data` etc. from the parent; you supply the query that makes them render
real content). Pages run top-level so `window.parent === window`.
The session every page gets comes from `GET /get-session-formatted` (root app): staff user `u1234567`, course `ABC3001_2026_S1`, access incl. admin/beta/etc. Use `session:{role:'student'}` for student-facing pages.

## Rules
- Fully deterministic: no Math.random/Date.now()/new Date() in fixtures (use `NOW`, `oid`, `lorem`); no dependence on request order or timing. Data = pure function of state.
- Realistic: lists of 5-30 items, plausible names/dates, a logged in admin/staff user, an activity/course; embed/student pages render saved generator data (read how the editor serialises it / what the
  server stores, in the app's frontend JS and index.js; produce data in exactly that shape). Mirror the real server's response shapes (read each app's `index.js` handler).
- Cover EVERY endpoint the frontend calls (grep the frontend JS, templates, and index.js routes), including POST/save endpoints (store into state and echo what the real server returns).
- Cross-app endpoints are owned by the app whose index.js serves them (e.g. toolbox calls `/podcast-manager/api/podcasts/get-all`). If the owning app belongs to another worker, add an `r.abs(...)` stub
  in your module so your page works now; the owner's real route wins automatically.
- Do NOT edit server.js, ab.js, check.js, lib/*, or other workers' fixture files (report needed harness changes in your final message instead). Put big data builders in `lib/data/<yourapp>.js`.
- Blocked external URLs (CDNs, Moodle, Google fonts, unpkg, lor.usq.edu.au) are expected; list the ones that matter in your report. Use `img()`/`AUDIO` for media.
- When done per page: `check.js` shows no pageErrors/console errors caused by missing fixtures (errors that are genuine app bugs or caused by blocked externals are fine - list them),
  `server.unknown` empty (or justified), the screenshot shows real content. Then `node ab.js --a F --b F --pages '<your ids>' --interact` TWICE: both must be all SAME. Chase flakiness
  into fixtures/page `scrub`/`settle`. If the flakiness needs a normaliser change in lib/snapshot.js, describe the exact rule in your report.
- Interactions: add hand-written `interact.steps` for the busiest pages (what a user does: open a tab, type in the search box, expand a row, select an item, click edit/preview). Steps must not navigate away.
  `check.js --interact` previews the generic plan.
- Final report per page (the lead merges these into a coverage table): what renders; endpoints stubbed (list); cross-app/abs stubs; interaction coverage (steps); known gaps / flaky / blocked-external / pages that
  behave differently when jQuery is hidden (`node check.js --nojquery`: report errors there vs without); anything in the real app that looks like a genuine bug.
