# suite-ab: prove a candidate AngularJS build behaves like the current one, across the real apps suite

75 page entries (the 46 in-scope pages plus 29 variants: embed variants, query modes, sub-pages). Known flaky areas, normalisation trade-offs and the first no-jQuery findings are in `$S/opt/reports/harness.md`. Use `--real-time` if a page's own setInterval races the frozen clock (si-photography-catalogue). `$S/bench/angular-baseline.min.js` is the fork at commit 74a4ce1a2, not pristine upstream.

`suite-ab` loads the 46 in-scope pages of the apps suite (the brief says 48; the brief's own list expands to 46 distinct html files, and a grep for every html file that loads
`angular(.min).js` outside `non-toolbox`, `node_modules`, `res/old` finds the same 46) in headless Chrome against **build A** and **build B** of `angular.min.js`,
takes a normalised DOM snapshot (plus visible text, console/page errors, failed requests, the sequence of backend requests, optional interaction snapshots) and diffs A against B per page.
It also runs B in a "no-jQuery" mode (AngularJS can't see jQuery) to find out which pages need jQuery.

Everything lives in this folder; the apps and the fork are only read. Dependencies: node >= 18 and `puppeteer-core` (run `npm install` in this folder once), Chrome at `/usr/bin/google-chrome`
(override with `CHROME_BIN`).

## Quick start

```bash
cd libs/angular.js/optimisation-review/suite-ab
CUR=/mnt/109313D2109313D2/sync/www/work/libs/angular.js/angular.min.js        # "A": the committed root build
NEW=/path/to/candidate/angular.min.js                                # "B": a candidate

node ab.js --list                                               # the pages, with URLs
node ab.js --a $CUR --b $NEW                                     # load every page on both builds, diff
node ab.js --a $CUR --b $NEW --interact                          # + generic and hand-written interactions, snapshot after each
node ab.js --a $CUR --b $NEW --pages 'gen-*,toolbox' --runs 7    # subset, plus 7 interleaved timing runs per page
node ab.js --a $CUR --b $NEW --b-nojquery                        # B with jQuery hidden from angular (see below)
node ab.js --a $CUR --b $CUR --interact                          # sanity: must be all SAME
node check.js --pages toolbox --text 40 --shot                   # one build, see what rendered / which errors / unknown endpoints
node server.js --port 4800 --angular $NEW                        # just the server, open pages by hand (prints every page URL)
```

`ab.js` exit code: 0 all SAME, 1 any DIFF, 2 usage/crash. Output per run goes to `results/<timestamp>/`:
`report.md` (table), `summary.json` (everything, incl. timing), `summary.txt`, `A/<page>.txt` + `B/<page>.txt` (the full normalised snapshots, errors, unknown endpoints),
`diffs/<page>.diff.txt` (longer diffs), optional `shots/`.

### ab.js options

| option | meaning |
|---|---|
| `--a FILE --b FILE` | the two angular builds (`angular.min.js` or `angular.js`; `FILE.map` is served if present) |
| `--b-nojquery [stash\|ngjq]` | hide jQuery from angular on B (default `stash`); `--a-nojquery` likewise for A |
| `--pages g1,g2,!g3` | comma separated globs on page id or app name (`gen-*`, `toolbox*`, `!gen-rive*`) |
| `--interact` | after the load snapshot, run interactions (hand-written `interact.steps` first, then ~14 generic) and snapshot after each |
| `--runs N` | after the diff pass, N interleaved (A,B,B,A,...) loads per page with CPU metrics; medians + B/A ratios |
| `--strip-ng-debug-classes` | drop `ng-scope ng-binding ng-isolate-scope` from class lists (use if a candidate changes debugInfo behaviour and you want to see past it) |
| `--strip-ng-classes` | drop every `ng-*` class (validity/pristine/animate states too) |
| `--real-time` | don't freeze the page clock |
| `--screenshots` | save A/B PNGs to `results/<run>/shots` (not compared) |
| `--verbose` | longer diffs on stdout |
| `--settle-max MS`, `--quiet MS`, `--timeout MS`, `--max-steps N`, `--out DIR`, `--label NAME` | tuning |

## How it works

**Server (`server.js`)** - one origin, like HAProxy. Each app's public folder is mounted at its production prefix (from `apps/haproxy-conf/prod/haproxy.cfg` and each `index.js`
`app.use('/<appName>', router)`); the root app is si-manager (`/node_modules/**`, `/utilities.js`, session, suite-wide json); `/styles/**` = si-studydesk-styles; toolbox is mounted at `/ilar-toolbox`,
`/editor-popups` and `/studydesk-toolbox`, `/images/**` = toolbox images. `/get-session-formatted` returns a fake staff/admin LTI session (course `ABC3001_2026_S1`); pages can ask for a student session.
Backends are in-memory fixtures in `fixtures/<app>.js` (see `notes/FIXTURES.md`). Anything unmatched is logged and answered `[]`/`{}`; the log is part of the output (`server.unknown`), so a new endpoint
a candidate build starts calling shows up. Two servers (A, B) run in the one process on random ports and are reset before every page load.

**Angular swap** - any request matching `/angular/angular(.min).js(.map)` is answered from the file given on the command line (so the same page, same assets, same data runs on either build).
`angular-csp.css` etc. still come from si-manager.

**No-jQuery mode** (`--b-nojquery`): two implementations, both make `angular.element` jqLite while `window.jQuery` stays available to the page's own scripts and plugins (select2, tippy wrappers, ui-grid...):
- `stash` (default): the server rewrites the html so a tiny inline script `window.__abjq=window.jQuery; delete window.jQuery` runs immediately before the `<script src=".../angular(.min).js">` tag
  and `window.jQuery=window.__abjq` immediately after it. This is the closest simulation of "the fork no longer looks at jQuery": angular binds at load and never sees it. Caveat: it only works when angular is loaded
  by a plain script tag (true for every page here) and the page's jQuery loads before angular (also true; pages where jQuery loads *after* angular already run on jqLite). It does not model a fork that has
  *deleted* the jQuery code paths (e.g. `jqLite.cleanData` interplay, `$animate` jQuery fallback) - it only models "angular uses jqLite".
- `ngjq`: adds `ng-jq=""` to `<html>`, which angular's own `jq()` honours (`ng-jq` with an empty value = "use jqLite"). Supported by upstream, needs no script ordering, but a candidate build that stripped `ng-jq` support
  ignores it. Both modes were checked to give identical results on the pages they were compared on.
The runner records `angular.element`'s identity per page (`jq=jQuery 3.7.1 / jqLite` in the output) so you can see that the mode really applied.

**Determinism** - the page clock is frozen (`Date`/`Date.now` = 2026-03-02T01:00Z, advancing by whole minutes of page age), `Math.random`/`crypto.getRandomValues`/`randomUUID` are seeded,
timezone is Australia/Brisbane, viewport 1280x900, fresh browser context per load (clean storage), `window.open`/`print` are stubs, dialogs auto-dismissed (alerts accepted), top-level navigations after load are aborted
and recorded, every non-localhost request is answered with an empty stub and listed as `blocked`.

**Settling** - a page is settled when no request has been in flight, `$http.pendingRequests` is empty, no digest is running and the DOM signature (hash of the full outerHTML incl. same-origin iframes) hasn't
changed for 700 ms (max 20 s; an unsettled page is flagged). `timeToSettled` is the page-time of the last observed change.

**Snapshot normalisation** (`lib/snapshot.js`): one line per node; attributes and class tokens sorted; inline `style` parsed, sorted, `transition*`/`animation*` declarations dropped; form control *properties*
(value, checked, selectedIndex) emitted; origins (`http://127.0.0.1:PORT`) -> `HOST`; uuids, ISO timestamps, epoch numbers -> placeholders; ids/for/aria refs have 5+ digit runs masked; `<script>` bodies dropped, `<style>`
reduced to a length; same-origin iframes and open shadow roots walked inline; the harness's own injected scripts ignored. Angular's `ng-*` classes are **kept** by default (a candidate that stops adding
`ng-binding` is a visible change); use the strip options to look past them. Per page you can add `scrub: [[regex, replacement]]` and `dropAttrs`. Errors are compared as multisets after masking ports, angular
error-doc versions and stack positions. The A/B comparison covers: DOM lines, visible text lines, console errors/warnings, page errors, failed requests, HTTP >=400, dialogs, aborted navigations,
the multiset of backend requests (so a build that stops/starts calling something is a diff), blocked externals, server-side unknown endpoints/missing assets, and each interaction step (ok/skipped, DOM, text, new errors).

**Interactions** - hand-written `interact.steps` per page (in the fixture's page entry) followed by generic ones planned from the *first build's* DOM and replayed verbatim on the other build: type into up to 3
visible `ng-model` text inputs (then Tab), choose an option in 2 `select[ng-model]`, toggle 2 checkboxes/radios, click up to 8 visible `ng-click`/`[role=tab]` elements, skipping anything whose text/attrs/ng-click mention
delete/remove/clear/reset/logout/download/print/export/upload/send/email/insert/copy/..., real `<a href>` navigation and `window.open`/`location`. A step that can't be resolved on B is recorded as `missing` (a diff).

**Timing (`--runs N`)** - secondary output: for each page N interleaved A/B loads (order alternates) in the same Chrome; per page the median of: Chrome `ScriptDuration`, `TaskDuration`, `LayoutDuration`,
`RecalcStyleDuration` (CDP `Performance.getMetrics`, ms, cumulative to the settle point), DOMContentLoaded, load, time-to-settled, JS heap; then B/A ratios and their geometric mean. The machine is noisy: only trust
ratios over many runs, never absolute ms. Note ScriptDuration includes the harness's own polling `evaluate` calls (same on both builds).

## Adding / fixing a fixture

See `notes/FIXTURES.md` (module format, ctx, `r.abs` cross-app stubs, rules). `node check.js --pages <id> --text 40 --shot` is the development loop; the screenshot lands in `results/check/<id>.png`.

## Files

```
ab.js            A/B runner            check.js     single-build checker (fixture development)
server.js        suite server          lib/         browser.js (puppeteer, settle), snapshot.js (in-page serialiser), diff.js (Myers), interact.js, inject.js (determinism), shared.js (session, ids, media)
fixtures/        one module per app (+ _si-manager.js root app)               notes/       FIXTURES.md, mount/asset/endpoint survey notes
results/         run outputs
```
