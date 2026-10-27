#!/usr/bin/env node
'use strict'
/*
 * Single-build page checker for fixture development: loads pages against one angular build and prints what rendered,
 * every console/page error, failed/404 request, blocked external request and unknown (stub-fallback) endpoint.
 *
 *   node check.js --angular <file> --pages <glob,..> [--shot] [--text] [--dom] [--interact] [--nojquery [stash|ngjq]]
 * default angular: the fork's root angular.min.js
 */
const fs = require('fs')
const path = require('path')
const {createSuiteServer, loadFixtureModules} = require('./server')
const B = require('./lib/browser')
const IX = require('./lib/interact')

const FORK = '/mnt/109313D2109313D2/sync/www/work/libs/angular.js/angular.min.js'

function parse(argv) {
	const o = {}
	for (let i = 0; i < argv.length; i++) {
		if (argv[i].startsWith('--')) {
			const k = argv[i].slice(2)
			const nxt = argv[i + 1]
			o[k] = nxt === undefined || nxt.startsWith('--') ? true : (i++, nxt)
		}
	}
	return o
}

async function main() {
	const args = parse(process.argv.slice(2))
	const modules = loadFixtureModules()
	const globs = String(args.pages || '*').split(',').map(g => new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'))
	const pages = []
	for (const m of modules) {
		for (const p of m.pages || []) {
			if (globs.some(r => r.test(p.id) || r.test(m.name))) {
				pages.push(Object.assign({app: m.name}, p))
			}
		}
	}
	const nj = args.nojquery
	const srv = createSuiteServer({angular: args.angular || FORK, modules, nojquery: nj ? (nj === true ? 'stash' : nj) : false})
	const {origin} = await srv.listen(0)
	const outDir = path.join(__dirname, 'results', 'check')
	fs.mkdirSync(outDir, {recursive: true})
	const browser = await B.launch(path.join(outDir, 'profile-' + process.pid), path.join(outDir, 'chrome-' + process.pid + '.pid'))
	const pid = browser.process().pid
	try {
		for (const p of pages) {
			srv.reset(p.session)
			const qs = new URLSearchParams(p.query || {}).toString()
			const url = origin + p.path + (qs ? '?' + qs : '')
			const t0 = Date.now()
			const s = await B.openPage(browser, url, {consoleAll: !!args.log})
			const st = await B.settle(s, {quietMs: 700, maxMs: +args['settle-max'] || 20000})
			const info = await s.page.evaluate(B.angularInfo).catch(() => ({}))
			const snap = await B.snapshot(s, {})
			console.log(`\n=== ${p.id}  ${url}`)
			console.log(`settled=${st.settled} tts=${st.timeToSettled}ms wall=${Date.now() - t0}ms dom=${snap.dom.length} lines, text=${snap.text.join(' ').length} chars, angular=${JSON.stringify(info)}`)
			const rec = s.rec
			const show = (label, arr, n = 12) => {
				if (arr.length) {
					console.log(`  ${label} (${arr.length}):`)
					arr.slice(0, n).forEach(x => console.log('    ' + x.slice(0, 260)))
				}
			}
			show('pageErrors', rec.pageErrors)
			show('console', rec.console)
			show('failed', rec.failed)
			show('http', rec.http)
			show('blocked-external', rec.blocked)
			show('dialogs', rec.dialogs)
			show('navigations', rec.navigations)
			show('server.unknown', srv.log.unknown.map(u => `${u.method} ${u.url}`))
			show('server.missing', srv.log.missing.map(u => `${u.url} ${u.note || ''}`))
			if (args.text) {
				console.log('  --- visible text ---\n' + snap.text.slice(0, +args.text > 1 ? +args.text : 40).map(l => '    ' + l.slice(0, 200)).join('\n'))
			}
			if (args.dom) {
				console.log(snap.dom.slice(0, +args.dom > 1 ? +args.dom : 120).join('\n'))
			}
			if (args.interact) {
				const plan = await IX.makePlan(s, {max: 14})
				console.log(`  interact plan (${plan.length}):`)
				const res = await IX.runPlan(s, plan, {}, {})
				res.forEach(r => console.log(`    ${r.ok ? 'ok  ' : 'SKIP'} ${r.name}${r.why ? ' ' + r.why : ''} dom=${(r.dom || []).length} err=${r.console.length + r.pageErrors.length} req=${r.requests.length}${r.pageErrors.length ? ' PAGEERR ' + r.pageErrors[0].slice(0, 120) : ''}${r.console.length ? ' CONSOLE ' + r.console[0].slice(0, 120) : ''}`))
				show('server.unknown (after interact)', srv.log.unknown.map(u => `${u.method} ${u.url}`))
			}
			if (args.shot) {
				const f = path.join(outDir, `${p.id}.png`)
				await s.page.screenshot({path: f, fullPage: false})
				console.log('  screenshot:', f)
			}
			await s.close()
		}
	}
	finally {
		await browser.close().catch(() => {})
		try {
			process.kill(pid, 0)
			process.kill(pid, 'SIGKILL')
		}
		catch (e) {
		}
		await srv.close()
		try {
			fs.rmSync(path.join(outDir, 'profile-' + process.pid), {recursive: true, force: true})
			fs.unlinkSync(path.join(outDir, 'chrome-' + process.pid + '.pid'))
		}
		catch (e) {
		}
	}
}

main().catch(e => {
	console.error(e)
	process.exit(2)
})
