#!/usr/bin/env node
'use strict'
/*
 * A/B runner: load every in-scope page against AngularJS build A and build B in headless Chrome, normalise,
 * diff. See README.md.
 *
 *   node ab.js --a <fileA> --b <fileB> [--b-nojquery [stash|ngjq]] [--pages <glob,glob,!glob>] [--interact]
 *              [--runs N] [--strip-ng-debug-classes] [--strip-ng-classes] [--out dir] [--list] [--verbose]
 */
const fs = require('fs')
const path = require('path')
const {createSuiteServer, loadFixtureModules} = require('./server')
const B = require('./lib/browser')
const {diffLines, countDiff, formatHunks} = require('./lib/diff')
const IX = require('./lib/interact')

function parseArgs(argv) {
	const o = {_: []}
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i]
		if (!a.startsWith('--')) {
			o._.push(a)
			continue
		}
		let k = a.slice(2), v = true
		const eq = k.indexOf('=')
		if (eq >= 0) {
			v = k.slice(eq + 1)
			k = k.slice(0, eq)
		}
		else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) {
			v = argv[++i]
		}
		o[k] = v
	}
	return o
}

function globToRe(g) {
	return new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$')
}

function selectPages(modules, spec) {
	const all = []
	for (const m of modules) {
		for (const p of m.pages || []) {
			all.push(Object.assign({app: m.name}, p))
		}
	}
	if (!spec || spec === true) {
		return all
	}
	const globs = String(spec).split(',').map(s => s.trim()).filter(Boolean)
	const pos = globs.filter(g => g[0] !== '!').map(globToRe)
	const neg = globs.filter(g => g[0] === '!').map(g => globToRe(g.slice(1)))
	return all.filter(p => (pos.length ? pos.some(r => r.test(p.id) || r.test(p.app)) : true) && !neg.some(r => r.test(p.id) || r.test(p.app)))
}

const median = a => {
	if (!a.length) {
		return null
	}
	const s = a.slice().sort((x, y) => x - y)
	return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

// capture one page load on one build
async function capture(browser, srv, origin, page, opts, planCache) {
	srv.reset(page.session)
	const qs = new URLSearchParams(page.query || {}).toString()
	const url = origin + page.path + (qs ? '?' + qs : '')
	const s = await B.openPage(browser, url, {timeout: opts.timeout, realTime: opts.realTime || page.realTime})
	const out = {url, id: page.id, navErr: s.navErr}
	const snapO = Object.assign({}, opts.snap, {dropAttrs: page.dropAttrs || []})
	const scrubs = (page.scrub || []).map(([re, rep]) => [new RegExp(re, 'g'), rep])
	const scrubLines = lines => scrubs.length ? lines.map(l => scrubs.reduce((acc, [re, rep]) => acc.replace(re, rep), l)) : lines
	const snap = async () => {
		const r = await B.snapshot(s, snapO)
		r.dom = scrubLines(r.dom)
		r.text = scrubLines(r.text)
		return r
	}
	try {
		const ps = page.settle || {}
		const st = await B.settle(s, {quietMs: ps.quietMs || opts.quiet, maxMs: ps.maxMs || opts.settleMax})
		out.settled = st.settled
		out.timeToSettled = st.timeToSettled
		out.info = await s.page.evaluate(B.angularInfo).catch(() => ({}))
		Object.assign(out, await snap())
		out.metrics = await B.pageMetrics(s)
		if (opts.screenshots) {
			try {
				fs.mkdirSync(path.join(opts.outDir, 'shots'), {recursive: true})
				await s.page.screenshot({path: path.join(opts.outDir, 'shots', `${page.id}.${opts.tag}.png`)})
			}
			catch (e) {
			}
		}
		// freeze the "initial load" error lists before interactions add to them
		out.initial = {
			console: s.rec.console.slice(), pageErrors: s.rec.pageErrors.slice(), failed: s.rec.failed.slice(), http: s.rec.http.slice(),
			dialogs: s.rec.dialogs.slice(), navigations: s.rec.navigations.slice(), blocked: s.rec.blocked.slice(), requests: s.rec.requests.slice(),
		}
		if (opts.interact) {
			const cache = planCache[page.id] || (planCache[page.id] = {})
			out.steps = []
			const custom = page.interact && Array.isArray(page.interact.steps) ? page.interact.steps : (Array.isArray(page.interact) ? page.interact : [])
			if (custom.length) {
				out.steps.push(...await IX.runPlan(s, custom, snapO, {quietMs: ps.stepQuietMs || (page.settle && page.settle.quietMs) || 450}, scrubLines))
			}
			if (!(page.interact && page.interact.generic === false)) {
				if (!cache.generic) {
					cache.generic = await IX.makePlan(s, {max: opts.maxSteps}).catch(() => [])
				}
				out.steps.push(...await IX.runPlan(s, cache.generic, snapO, {quietMs: ps.stepQuietMs || (page.settle && page.settle.quietMs) || 450}, scrubLines))
			}
			out.final = await snap()
		}
		out.rec = {
			console: s.rec.console.slice(), pageErrors: s.rec.pageErrors.slice(), failed: s.rec.failed.slice(), http: s.rec.http.slice(),
			dialogs: s.rec.dialogs.slice(), navigations: s.rec.navigations.slice(), blocked: s.rec.blocked.slice(), requests: s.rec.requests.slice(),
		}
	}
	catch (e) {
		out.captureError = String(e && e.stack || e)
		out.dom = out.dom || []
		out.text = out.text || []
		out.rec = out.rec || {console: [], pageErrors: [], failed: [], http: [], dialogs: [], navigations: [], blocked: [], requests: []}
		out.initial = out.initial || out.rec
	}
	const log = JSON.parse(JSON.stringify(srv.log))
	out.server = {unknown: log.unknown.map(u => `${u.method} ${B.normUrl('http://x' + u.url)}`), missing: log.missing.map(u => B.normUrl('http://x' + u.url) + (u.note ? ' (' + u.note + ')' : ''))}
	await s.close()
	return out
}

function multisetDiff(a, b) {
	const cnt = new Map()
	for (const x of a) {
		cnt.set(x, (cnt.get(x) || 0) + 1)
	}
	const onlyB = []
	for (const x of b) {
		const c = cnt.get(x) || 0
		if (c > 0) {
			cnt.set(x, c - 1)
		}
		else {
			onlyB.push(x)
		}
	}
	const onlyA = []
	for (const [x, c] of cnt) {
		for (let i = 0; i < c; i++) {
			onlyA.push(x)
		}
	}
	return {onlyA, onlyB}
}

// PROPOSED harness normalisation (fixture worker): request/failed lists must not depend on timing or the server port
const IMG_FONT = /\.(css|svg|png|jpe?g|gif|webp|ico|woff2?|ttf|eot|wav|mp3|mp4)(\?|$)/i
function normReqLine(l) {
	return l.replace(/127\.0\.0\.1(?::|%3A)\d+/g, 'HOST').replace(/([?&][^=&]+=)([A-Za-z0-9+/=]{16,})(?=&|$)/g, (m, k, v) => {
		try {
			let d = Buffer.from(v, 'base64').toString('latin1')
			return /127\.0\.0\.1:\d+/.test(d) ? k + '<b64:' + d.replace(/127\.0\.0\.1:\d+/g, 'HOST') + '>' : m
		}
		catch (e) {
			return m
		}
	})
}
const dropReq = l => /\/analytics\/ingest|%7B%7B/.test(l) || (/^GET /.test(l) && IMG_FONT.test(l.split(' ')[1] || ''))
function normList(list, isFailed) {
	return (list || []).filter(l => !(isFailed ? /\/analytics\/ingest|%7B%7B|ERR_ABORTED/.test(l) : dropReq(l))).map(normReqLine)
}
function normCapture(c) {
	if (!c) {
		return c
	}
	if (c.rec) {
		c.rec = Object.assign({}, c.rec, {requests: normList(c.rec.requests), failed: normList(c.rec.failed, true)})
	}
	if (c.steps) {
		c.steps = c.steps.map(s => Object.assign({}, s, {requests: normList(s.requests)}))
	}
	return c
}

function compare(a, b, opts) {
	normCapture(a)
	normCapture(b)
	const r = {categories: {}, detail: {}}
	const dd = diffLines(a.dom || [], b.dom || [])
	if (dd.length) {
		r.categories.dom = countDiff(dd)
		r.detail.dom = dd
	}
	const td = diffLines(a.text || [], b.text || [])
	if (td.length) {
		r.categories.text = countDiff(td)
		r.detail.text = td
	}
	for (const k of ['console', 'pageErrors', 'failed', 'http', 'dialogs', 'navigations', 'requests', 'blocked']) {
		const d = multisetDiff((a.rec || {})[k] || [], (b.rec || {})[k] || [])
		if (d.onlyA.length || d.onlyB.length) {
			r.categories[k] = {onlyA: d.onlyA.length, onlyB: d.onlyB.length}
			r.detail[k] = d
		}
	}
	for (const k of ['unknown', 'missing']) {
		const d = multisetDiff((a.server || {})[k] || [], (b.server || {})[k] || [])
		if (d.onlyA.length || d.onlyB.length) {
			r.categories['server.' + k] = {onlyA: d.onlyA.length, onlyB: d.onlyB.length}
			r.detail['server.' + k] = d
		}
	}
	if (a.steps || b.steps) {
		const n = Math.max((a.steps || []).length, (b.steps || []).length)
		const stepDiffs = []
		for (let i = 0; i < n; i++) {
			const sa = (a.steps || [])[i], sb = (b.steps || [])[i]
			if (!sa || !sb) {
				stepDiffs.push({i, name: (sa || sb).name, note: 'step only in ' + (sa ? 'A' : 'B')})
				continue
			}
			const d = {i, name: sa.name}
			let any = false
			if (sa.ok !== sb.ok) {
				d.ok = [sa.ok, sb.ok, sa.why, sb.why]
				any = true
			}
			const sd = diffLines(sa.dom || [], sb.dom || [])
			if (sd.length) {
				d.dom = sd
				any = true
			}
			const st = diffLines(sa.text || [], sb.text || [])
			if (st.length) {
				d.text = st
				any = true
			}
			for (const k of ['console', 'pageErrors', 'dialogs', 'navigations']) {
				const m = multisetDiff(sa[k] || [], sb[k] || [])
				if (m.onlyA.length || m.onlyB.length) {
					d[k] = m
					any = true
				}
			}
			if (any) {
				stepDiffs.push(d)
			}
		}
		if (stepDiffs.length) {
			r.categories.steps = {differing: stepDiffs.length, of: n}
			r.detail.steps = stepDiffs
		}
	}
	if (a.settled !== b.settled) {
		r.categories.settled = {a: a.settled, b: b.settled}
	}
	if (a.captureError || b.captureError) {
		r.categories.captureError = {a: !!a.captureError, b: !!b.captureError}
	}
	r.same = Object.keys(r.categories).length === 0
	return r
}

function writeCapture(dir, tag, id, c) {
	fs.mkdirSync(path.join(dir, tag), {recursive: true})
	const parts = [`# ${id} (${tag})  ${c.url}`, `# angular: ${JSON.stringify(c.info)}`, `# settled: ${c.settled} timeToSettled: ${c.timeToSettled}ms`, '## DOM', ...(c.dom || []), '## VISIBLE TEXT', ...(c.text || [])]
	for (const s of c.steps || []) {
		parts.push(`## STEP ${s.name} ok=${s.ok}${s.why ? ' ' + s.why : ''}`)
		if (s.dom) {
			parts.push(...s.dom, '### text', ...(s.text || []))
		}
	}
	parts.push('## ERRORS', ...Object.entries(c.rec || {}).filter(([k, v]) => v.length && k !== 'requests').map(([k, v]) => `${k}:\n  ` + v.join('\n  ')))
	parts.push('## SERVER', ...((c.server && c.server.unknown) || []).map(x => 'unknown ' + x), ...((c.server && c.server.missing) || []).map(x => 'missing ' + x))
	fs.writeFileSync(path.join(dir, tag, id + '.txt'), parts.join('\n'))
}

function summarise(page, cmp, a, b, opts) {
	const lines = []
	const cat = cmp.categories
	const keys = Object.keys(cat)
	const head = cmp.same ? 'SAME' : 'DIFF'
	const bits = keys.map(k => {
		const v = cat[k]
		if (k === 'dom' || k === 'text') {
			return `${k}:-${v.del}/+${v.add}`
		}
		if (k === 'steps') {
			return `steps:${v.differing}/${v.of}`
		}
		if (v && v.onlyA !== undefined) {
			return `${k}:-${v.onlyA}/+${v.onlyB}`
		}
		return k
	})
	lines.push(`${head.padEnd(5)} ${page.id.padEnd(36)} dom=${(a.dom || []).length}/${(b.dom || []).length} errs=${((a.rec || {}).console || []).length + ((a.rec || {}).pageErrors || []).length}/${((b.rec || {}).console || []).length + ((b.rec || {}).pageErrors || []).length} jq=${a.info && a.info.jq || '-'}/${b.info && b.info.jq || '-'} ${bits.join(' ')}`)
	if (!cmp.same && !opts.quiet_out) {
		const lim = opts.verbose ? 40 : 8
		if (cmp.detail.dom) {
			lines.push('    DOM:\n' + formatHunks(cmp.detail.dom, lim).split('\n').map(l => '      ' + l).join('\n'))
		}
		if (cmp.detail.text) {
			lines.push('    TEXT:\n' + formatHunks(cmp.detail.text, Math.min(lim, 6)).split('\n').map(l => '      ' + l).join('\n'))
		}
		for (const k of ['pageErrors', 'console', 'failed', 'http', 'dialogs', 'navigations', 'requests', 'blocked', 'server.unknown', 'server.missing']) {
			const d = cmp.detail[k]
			if (!d) {
				continue
			}
			if (d.onlyB.length) {
				lines.push(`    new in B (${k}):` + d.onlyB.slice(0, 5).map(x => '\n      + ' + x.slice(0, 200)).join(''))
			}
			if (d.onlyA.length) {
				lines.push(`    gone in B (${k}):` + d.onlyA.slice(0, 3).map(x => '\n      - ' + x.slice(0, 200)).join(''))
			}
		}
		if (cmp.detail.steps) {
			for (const sd of cmp.detail.steps.slice(0, opts.verbose ? 20 : 4)) {
				lines.push(`    STEP ${sd.name}${sd.note ? ' ' + sd.note : ''}${sd.ok ? ' ok=' + JSON.stringify(sd.ok) : ''}`)
				if (sd.dom) {
					lines.push(formatHunks(sd.dom, 5).split('\n').map(l => '        ' + l).join('\n'))
				}
				for (const k of ['pageErrors', 'console', 'requests']) {
					if (sd[k] && sd[k].onlyB.length) {
						lines.push(`        new in B (${k}): ` + sd[k].onlyB.slice(0, 3).join(' | ').slice(0, 300))
					}
				}
			}
		}
	}
	return lines.join('\n')
}

async function main() {
	const args = parseArgs(process.argv.slice(2))
	const modules = loadFixtureModules()
	if (args.list) {
		for (const p of selectPages(modules, args.pages)) {
			console.log(p.id.padEnd(38), p.path + (p.query && Object.keys(p.query).length ? '?' + new URLSearchParams(p.query) : ''), '  [' + p.app + ']')
		}
		return
	}
	if (!args.a || !args.b) {
		console.error('usage: node ab.js --a <fileA> --b <fileB> [--b-nojquery [stash|ngjq]] [--pages glob,..] [--interact] [--runs N] [--out dir]')
		process.exit(2)
	}
	const pages = selectPages(modules, args.pages)
	if (!pages.length) {
		console.error('no pages match', args.pages)
		process.exit(2)
	}
	const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
	const outDir = path.resolve(args.out || path.join(__dirname, 'results', stamp + (args.label ? '-' + args.label : '')))
	fs.mkdirSync(outDir, {recursive: true})
	const opts = {
		timeout: +args.timeout || 30000, settleMax: +args['settle-max'] || 20000, quiet: +args.quiet || 700, realTime: !!args['real-time'],
		interact: !!args.interact, maxSteps: +args['max-steps'] || 14, verbose: !!args.verbose, screenshots: !!args.screenshots, outDir,
		snap: {stripNgClasses: !!args['strip-ng-classes'], stripNgDebug: !!args['strip-ng-debug-classes'] || !!args['strip-ng-classes']},
	}
	const nj = args['b-nojquery']
	const naj = args['a-nojquery']
	const aSrv = createSuiteServer({angular: args.a, modules, nojquery: naj ? (naj === true ? 'stash' : naj) : false})
	const bSrv = createSuiteServer({angular: args.b, modules, nojquery: nj ? (nj === true ? 'stash' : nj) : false})
	const aOrigin = (await aSrv.listen(0)).origin
	const bOrigin = (await bSrv.listen(0)).origin
	const pidFile = path.join(outDir, 'chrome.pid')
	const browser = await B.launch(path.join(outDir, 'chrome-profile'), pidFile)
	const chromePid = browser.process().pid
	let cleaned = false
	const cleanup = async () => {
		if (cleaned) {
			return
		}
		cleaned = true
		try {
			await browser.close()
		}
		catch (e) {
		}
		try {
			process.kill(chromePid, 0)
			process.kill(chromePid, 'SIGKILL')
		}
		catch (e) {
		}
		await aSrv.close()
		await bSrv.close()
		try {
			fs.rmSync(path.join(outDir, 'chrome-profile'), {recursive: true, force: true})
			fs.unlinkSync(pidFile)
		}
		catch (e) {
		}
	}
	for (const sig of ['SIGINT', 'SIGTERM']) {
		process.on(sig, async () => {
			await cleanup()
			process.exit(130)
		})
	}

	console.log(`A: ${args.a}\nB: ${args.b}${nj ? `   (B hides jQuery from angular: ${bSrv.nojq})` : ''}\npages: ${pages.length}  interact: ${opts.interact}  out: ${outDir}\n`)
	const results = []
	const planCache = {}
	try {
		for (const page of pages) {
			const t0 = Date.now()
			const cA = await capture(browser, aSrv, aOrigin, page, Object.assign({tag: 'A'}, opts), planCache)
			const cB = await capture(browser, bSrv, bOrigin, page, Object.assign({tag: 'B'}, opts), planCache)
			const cmp = compare(cA, cB, opts)
			writeCapture(outDir, 'A', page.id, cA)
			writeCapture(outDir, 'B', page.id, cB)
			const text = summarise(page, cmp, cA, cB, opts)
			console.log(text + `   [${((Date.now() - t0) / 1000).toFixed(1)}s]`)
			if (!cmp.same) {
				fs.mkdirSync(path.join(outDir, 'diffs'), {recursive: true})
				fs.writeFileSync(path.join(outDir, 'diffs', page.id + '.diff.txt'), summarise(page, cmp, cA, cB, Object.assign({}, opts, {verbose: true})))
			}
			results.push({
				id: page.id, app: page.app, same: cmp.same, categories: cmp.categories,
				a: {settled: cA.settled, tts: cA.timeToSettled, info: cA.info, errs: [(cA.rec || {}).console, (cA.rec || {}).pageErrors].map(x => (x || []).length), metrics: cA.metrics, captureError: cA.captureError},
				b: {settled: cB.settled, tts: cB.timeToSettled, info: cB.info, errs: [(cB.rec || {}).console, (cB.rec || {}).pageErrors].map(x => (x || []).length), metrics: cB.metrics, captureError: cB.captureError},
				newErrorsInB: {
					pageErrors: (cmp.detail.pageErrors || {onlyB: []}).onlyB, console: (cmp.detail.console || {onlyB: []}).onlyB,
					failed: (cmp.detail.failed || {onlyB: []}).onlyB, http: (cmp.detail.http || {onlyB: []}).onlyB,
				},
				aErrors: {pageErrors: (cA.rec || {}).pageErrors || [], console: (cA.rec || {}).console || [], failed: (cA.rec || {}).failed || [], http: (cA.rec || {}).http || []},
				bErrors: {pageErrors: (cB.rec || {}).pageErrors || [], console: (cB.rec || {}).console || [], failed: (cB.rec || {}).failed || [], http: (cB.rec || {}).http || []},
				unknownEndpoints: cA.server.unknown, missingAssets: cA.server.missing, blocked: (cA.rec || {}).blocked || [],
				steps: (cA.steps || []).map(s => `${s.ok ? 'ok ' : 'SKIP'} ${s.name}`),
			})
		}

		// timing: interleaved
		let timing = null
		const runs = +args.runs || 0
		if (runs > 0) {
			console.log(`\n== timing: ${runs} interleaved runs per page ==`)
			timing = {}
			for (const page of pages) {
				const ta = [], tb = []
				for (let i = 0; i < runs; i++) {
					const order = i % 2 ? ['B', 'A'] : ['A', 'B']
					for (const w of order) {
						const srv = w === 'A' ? aSrv : bSrv
						const c = await capture(browser, srv, w === 'A' ? aOrigin : bOrigin, page, Object.assign({tag: w}, opts, {interact: false, screenshots: false}), planCache)
						;(w === 'A' ? ta : tb).push(Object.assign({tts: c.timeToSettled}, c.metrics))
					}
				}
				const pick = (arr, k) => median(arr.map(x => x[k]).filter(x => typeof x === 'number'))
				const row = {}
				for (const k of ['script', 'task', 'layout', 'style', 'dcl', 'load', 'tts', 'heapMB']) {
					row[k] = {a: pick(ta, k), b: pick(tb, k)}
					row[k].ratio = row[k].a ? +(row[k].b / row[k].a).toFixed(3) : null
				}
				timing[page.id] = row
				console.log(`${page.id.padEnd(36)} script A=${row.script.a} B=${row.script.b} (${row.script.ratio})  task ${row.task.a}/${row.task.b} (${row.task.ratio})  dcl ${row.dcl.a}/${row.dcl.b}  settled ${row.tts.a}/${row.tts.b}`)
			}
			const geo = k => {
				const r = Object.values(timing).map(x => x[k].ratio).filter(x => x > 0)
				return r.length ? +Math.exp(r.reduce((s, x) => s + Math.log(x), 0) / r.length).toFixed(3) : null
			}
			timing._geomean = {script: geo('script'), task: geo('task'), dcl: geo('dcl'), tts: geo('tts')}
			console.log('geomean B/A ratios:', JSON.stringify(timing._geomean))
		}

		const nSame = results.filter(r => r.same).length
		console.log(`\n== ${nSame}/${results.length} SAME, ${results.length - nSame} DIFF ==`)
		for (const r of results.filter(x => !x.same)) {
			console.log('  DIFF', r.id, Object.keys(r.categories).join(','))
		}
		const newErr = results.filter(r => r.newErrorsInB.pageErrors.length || r.newErrorsInB.console.length)
		if (newErr.length) {
			console.log(`\npages with NEW console/page errors in B (${newErr.length}):`)
			for (const r of newErr) {
				console.log('  ' + r.id + ': ' + [...r.newErrorsInB.pageErrors, ...r.newErrorsInB.console].slice(0, 2).map(x => x.slice(0, 140)).join(' || '))
			}
		}
		fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify({args, A: args.a, B: args.b, nojquery: nj || false, results, timing}, null, 1))
		const md = ['# suite-ab run', '', `- A: \`${args.a}\`${naj ? ` (jQuery hidden from angular: ${aSrv.nojq})` : ''}`, `- B: \`${args.b}\`${nj ? ` (jQuery hidden from angular: ${bSrv.nojq})` : ''}`, `- interact: ${opts.interact}, pages: ${results.length}, SAME: ${nSame}, DIFF: ${results.length - nSame}`, '',
			'| page | verdict | angular.element A / B | categories | errors A (console/page) | errors B | new in B (first) |', '|---|---|---|---|---|---|---|']
		for (const r of results) {
			const first = [...r.newErrorsInB.pageErrors, ...r.newErrorsInB.console][0] || ''
			md.push(`| ${r.id} | ${r.same ? 'SAME' : '**DIFF**'} | ${(r.a.info && r.a.info.jq) || '-'} / ${(r.b.info && r.b.info.jq) || '-'} | ${Object.keys(r.categories).join(', ')} | ${r.a.errs.join('/')} | ${r.b.errs.join('/')} | ${first.replace(/\|/g, '/').slice(0, 120)} |`)
		}
		fs.writeFileSync(path.join(outDir, 'report.md'), md.join('\n') + '\n')
		fs.writeFileSync(path.join(outDir, 'summary.txt'), results.map(r => `${r.same ? 'SAME' : 'DIFF'} ${r.id} ${Object.keys(r.categories).join(',')}`).join('\n') + '\n')
		console.log('\nresults:', outDir)
		process.exitCode = nSame === results.length ? 0 : 1
	}
	finally {
		await cleanup()
	}
}

main().catch(e => {
	console.error(e)
	process.exit(2)
})
