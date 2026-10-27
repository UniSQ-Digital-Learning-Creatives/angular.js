'use strict'
const fs = require('fs')
const path = require('path')
const puppeteer = require('puppeteer-core')
const inject = require('./inject')
const {snapshotSource, visibleTextSource} = require('./snapshot')

const CHROME = process.env.CHROME_BIN || '/usr/bin/google-chrome'
const PNG1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

async function launch(userDataDir, pidFile) {
	fs.mkdirSync(userDataDir, {recursive: true})
	const browser = await puppeteer.launch({
		executablePath: CHROME,
		headless: true,
		userDataDir,
		args: ['--no-sandbox', '--disable-gpu-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
			'--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
			'--disable-features=Translate,MediaRouter', '--no-first-run', '--no-default-browser-check', '--mute-audio', '--autoplay-policy=no-user-gesture-required',
			'--window-size=1280,900', '--hide-scrollbars'],
		defaultViewport: null,
	})
	if (pidFile) {
		fs.writeFileSync(pidFile, String(browser.process().pid))
	}
	return browser
}

function normMsg(t) {
	return String(t)
		.split('\n    at ')[0]
		.replace(/https?(?::|%3A)(?:\/\/|%2F%2F)(?:127\.0\.0\.1|localhost)(?::|%3A)\d+/gi, 'HOST')
		.replace(/https?:\/\/(127\.0\.0\.1|localhost):\d+/g, 'HOST')
		.replace(/(errors\.angularjs\.org(?:\/|%2F))[\d.]+(?:-[\w.]+)?/gi, '$1<ver>')
		.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>')
		.replace(/\b1[5-9]\d{11}\b/g, '<epoch>')
		.replace(/:\d+:\d+\)?$/g, ':L:C')
		.slice(0, 400)
}

function normUrl(u) {
	try {
		const x = new URL(u)
		let q = [...x.searchParams].map(([k, v]) => k + '=' + v.replace(/https?(?::|%3A)(?:\/\/|%2F%2F)(?:127\.0\.0\.1|localhost)(?::|%3A)\d+/gi, 'HOST').replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>').replace(/\b1[5-9]\d{11}\b/g, '<epoch>')).sort()
		return x.pathname + (q.length ? '?' + q.join('&') : '')
	}
	catch (e) {
		return u
	}
}

// -- in-page helpers -----------------------------------------------------------------------------------------------
function quickSig() {
	function sigOf(doc) {
		let s = 0, n = 0
		try {
			const html = doc.documentElement.outerHTML
			n = html.length
			for (let i = 0; i < html.length; i += 7) {
				s = (Math.imul(s, 31) + html.charCodeAt(i)) | 0
			}
			for (const f of Array.from(doc.querySelectorAll('iframe'))) {
				if (f.contentDocument && f.contentDocument.documentElement) {
					const r = sigOf(f.contentDocument)
					s = (Math.imul(s, 31) + r) | 0
					n += 1
				}
			}
		}
		catch (e) {
		}
		return s ^ n
	}
	let pending = 0, ng = false
	try {
		const root = document.querySelector('[ng-app],[data-ng-app]') || document.documentElement
		const inj = window.angular && window.angular.element(root).injector()
		if (inj) {
			ng = true
			pending = inj.get('$http').pendingRequests.length
			const rs = inj.get('$rootScope')
			if (rs.$$phase) {
				pending += 1
			}
		}
	}
	catch (e) {
	}
	return {sig: sigOf(document), pending, ng, t: performance.now(), rs: document.readyState}
}

function angularInfo() {
	const out = {angular: null, jq: null, version: null, bootstrapped: false}
	try {
		if (window.angular) {
			out.angular = true
			out.version = window.angular.version && window.angular.version.full
			const el = window.angular.element
			out.jq = el && el.fn && typeof el.fn.jquery === 'string' ? 'jQuery ' + el.fn.jquery : 'jqLite'
			const root = document.querySelector('[ng-app],[data-ng-app]') || document.documentElement
			out.bootstrapped = !!window.angular.element(root).injector()
			out.jQueryGlobal = typeof window.jQuery === 'function' ? window.jQuery.fn.jquery : null
			// digest counter for the secondary timing output
		}
	}
	catch (e) {
		out.err = String(e)
	}
	return out
}

// -- page lifecycle ------------------------------------------------------------------------------------------------

/**
 * Open a page in a fresh context, wire up capture, navigate and settle.
 * Returns a session object {page, ctx, rec, close, ...}
 */
async function openPage(browser, url, o = {}) {
	const ctx = await browser.createBrowserContext()
	const page = await ctx.newPage()
	await page.setViewport({width: 1280, height: 900, deviceScaleFactor: 1})
	await page.emulateTimezone('Australia/Brisbane')
	await page.setExtraHTTPHeaders({'Accept-Language': 'en-AU,en;q=0.9'})
	await page.evaluateOnNewDocument(inject.script(Object.assign({}, inject.defaults, {realTime: !!o.realTime})))
	page.setDefaultTimeout(o.timeout || 30000)

	const rec = {
		console: [], pageErrors: [], failed: [], http: [], blocked: [], dialogs: [], navigations: [], requests: [],
		inflight: new Set(), reqCount: 0,
	}
	const origin = new URL(url).origin
	let started = false
	rec.pendingP = []
	page.on('console', m => {
		const t = m.type()
		if (!(o.consoleAll || t === 'error' || t === 'warning' || t === 'assert')) {
			return
		}
		const idx = rec.console.length
		rec.console.push(`${t}: ${normMsg(m.text())}`)
		if (/JSHandle@/.test(m.text())) {
			// objects/errors print as JSHandle@..; ask the page for a real description
			rec.pendingP.push(Promise.all(m.args().map(a => a.evaluate(x => {
				try {
					if (x instanceof Error) {
						return x.name + ': ' + x.message
					}
					if (x && x.nodeType === 1) {
						return '<' + x.tagName.toLowerCase() + '>'
					}
					return typeof x === 'object' ? JSON.stringify(x) : String(x)
				}
				catch (e) {
					return String(x)
				}
			}).catch(() => '?'))).then(parts => {
				rec.console[idx] = `${t}: ${normMsg(parts.join(' '))}`
			}).catch(() => {}))
		}
	})
	page.on('pageerror', e => rec.pageErrors.push(normMsg((e && e.message) || e)))
	page.on('dialog', async d => {
		rec.dialogs.push(`${d.type()}: ${normMsg(d.message())}`)
		try {
			if (d.type() === 'alert') {
				await d.accept()
			}
			else {
				await d.dismiss()
			}
		}
		catch (e) {
		}
	})
	await page.setRequestInterception(true)
	page.on('request', req => {
		const rurl = req.url()
		if (/^(data|blob|about|chrome-extension):/.test(rurl)) {
			return req.continue().catch(() => {})
		}
		let u
		try {
			u = new URL(rurl)
		}
		catch (e) {
			return req.continue().catch(() => {})
		}
		if (u.origin !== origin) {
			const type = req.resourceType()
			rec.blocked.push(`${req.method()} ${rurl.slice(0, 160)}`)
			const base = {status: 200, headers: {'access-control-allow-origin': '*'}}
			const body = type === 'script' ? '/* suite-ab: external script blocked */' : type === 'stylesheet' ? '/* blocked */' : type === 'image' ? PNG1 : type === 'document' ? '<!doctype html><title>blocked</title>' : type === 'xhr' || type === 'fetch' ? '{}' : ''
			const ct = type === 'script' ? 'text/javascript' : type === 'stylesheet' ? 'text/css' : type === 'image' ? 'image/png' : type === 'document' ? 'text/html' : 'application/json'
			return req.respond(Object.assign(base, {contentType: ct, body})).catch(() => {})
		}
		if (req.isNavigationRequest() && req.frame() === page.mainFrame()) {
			if (started) {
				rec.navigations.push(`${req.method()} ${normUrl(rurl)}`)
				req.__abAborted = true
				return req.abort('aborted').catch(() => {})
			}
		}
		if (!/\/ingest(-bulk)?$/.test(u.pathname)) {
			rec.requests.push(`${req.method()} ${normUrl(rurl)}`)
		}
		req.__abT = Date.now()
		if (req.resourceType() !== 'font') {
			rec.inflight.add(req)
		}
		rec.reqCount++
		req.continue().catch(() => {})
	})
	page.on('requestfinished', r => rec.inflight.delete(r))
	page.on('requestfailed', r => {
		rec.inflight.delete(r)
		if (r.__abAborted) {
			return
		}
		const f = r.failure()
		rec.failed.push(`${r.method()} ${normUrl(r.url())} ${f && f.errorText}`)
	})
	page.on('response', r => {
		rec.inflight.delete(r.request())
		if (r.status() >= 400 && r.url().startsWith(origin)) {
			rec.http.push(`${r.status()} ${r.request().method()} ${normUrl(r.url())}`)
		}
	})

	const t0 = Date.now()
	let navErr = null
	try {
		await page.goto(url, {waitUntil: 'domcontentloaded', timeout: o.timeout || 30000})
	}
	catch (e) {
		navErr = String(e.message || e)
	}
	started = true
	const s = {page, ctx, rec, origin, url, navErr, t0}
	s.close = async () => {
		try {
			await page.close({runBeforeUnload: false})
		}
		catch (e) {
		}
		try {
			await ctx.close()
		}
		catch (e) {
		}
	}
	return s
}

/**
 * Wait until: no requests in flight, no angular pending http, and the DOM signature is unchanged for `quietMs`.
 * Returns {settled, timeToSettled (ms of page time of last observed change), waited}
 */
async function settle(s, o = {}) {
	const quietMs = o.quietMs || 700
	const max = o.maxMs || 20000
	const poll = 100
	const start = Date.now()
	let last = null, lastChangeT = 0, lastChangeWall = Date.now(), t = 0
	while (Date.now() - start < max) {
		let r
		try {
			r = await s.page.evaluate(quickSig)
		}
		catch (e) {
			// navigation/destroyed context: treat as a change
			await new Promise(r => setTimeout(r, poll))
			lastChangeWall = Date.now()
			continue
		}
		t = r.t
		const nowT = Date.now()
		let live = 0
		for (const q of s.rec.inflight) {
			if (nowT - q.__abT < 4000) {
				live++
			}
		}
		const busy = live > 0 || r.pending > 0 || r.rs === 'loading'
		const sig = r.sig + ':' + r.pending
		if (sig !== last || busy) {
			last = sig
			lastChangeT = r.t
			lastChangeWall = Date.now()
		}
		if (!busy && Date.now() - lastChangeWall >= quietMs) {
			return {settled: true, timeToSettled: Math.round(lastChangeT), waited: Date.now() - start}
		}
		await new Promise(r => setTimeout(r, poll))
	}
	return {settled: false, timeToSettled: Math.round(lastChangeT), waited: Date.now() - start}
}

async function snapshot(s, o = {}) {
	await Promise.all(s.rec.pendingP || []).catch(() => {})
	const lines = await s.page.evaluate(`(${snapshotSource})(${JSON.stringify({stripNgClasses: !!o.stripNgClasses, stripNgDebug: !!o.stripNgDebug, dropAttrs: o.dropAttrs || []})})`)
	const text = await s.page.evaluate(`(${visibleTextSource})()`)
	return {dom: lines, text}
}

async function pageMetrics(s) {
	let m = {}
	try {
		const raw = await s.page.metrics()
		m = {
			script: Math.round((raw.ScriptDuration || 0) * 1000), layout: Math.round((raw.LayoutDuration || 0) * 1000),
			style: Math.round((raw.RecalcStyleDuration || 0) * 1000), task: Math.round((raw.TaskDuration || 0) * 1000),
			heapMB: +((raw.JSHeapUsedSize || 0) / 1048576).toFixed(1), nodes: raw.Nodes, listeners: raw.JSEventListeners,
		}
	}
	catch (e) {
	}
	try {
		const nav = await s.page.evaluate(() => {
			const n = performance.getEntriesByType('navigation')[0]
			const a = performance.getEntriesByType('resource').filter(r => /angular(\.min)?\.js$/.test(r.name))[0]
			return {dcl: n && Math.round(n.domContentLoadedEventEnd), load: n && Math.round(n.loadEventEnd), angularFetch: a && Math.round(a.responseEnd - a.startTime)}
		})
		Object.assign(m, nav)
	}
	catch (e) {
	}
	return m
}

module.exports = {launch, openPage, settle, snapshot, pageMetrics, angularInfo, quickSig, normMsg, normUrl, PNG1}
