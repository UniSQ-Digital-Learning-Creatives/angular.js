'use strict'
// Script injected into every document (and iframe) before page scripts run. Makes runs deterministic:
// frozen-ish clock, seeded Math.random/crypto, window.open stub. Runs via page.evaluateOnNewDocument.
function injected(cfg) {
	// ---- clock: Date.now()/new Date() report BASE + whole minutes of page age, so they are stable inside a run
	if (!cfg.realTime) {
		const RealDate = Date
		const perfNow = performance.now.bind(performance)
		const nowFn = () => cfg.base + Math.floor(perfNow() / 60000) * 60000
		window.Date = new Proxy(RealDate, {
			construct(target, args) {
				return args.length ? new target(...args) : new target(nowFn())
			},
			apply(target) {
				return new target(nowFn()).toString()
			},
			get(target, key, recv) {
				if (key === 'now') {
					return nowFn
				}
				return Reflect.get(target, key, target)
			},
		})
	}
	// ---- seeded randomness
	let seed = cfg.seed >>> 0
	const rnd = () => {
		seed = (seed + 0x6D2B79F5) >>> 0
		let t = seed
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
	Math.random = rnd
	try {
		const gv = function (arr) {
			for (let i = 0; i < arr.length; i++) {
				arr[i] = Math.floor(rnd() * 256)
			}
			return arr
		}
		Crypto.prototype.getRandomValues = gv
		Crypto.prototype.randomUUID = function () {
			const h = () => Math.floor(rnd() * 65536).toString(16).padStart(4, '0')
			return `${h()}${h()}-${h()}-4${h().slice(1)}-a${h().slice(1)}-${h()}${h()}${h()}`
		}
	}
	catch (e) {
	}
	// ---- window.open: record, never open
	window.__abOpened = []
	window.open = function (u) {
		window.__abOpened.push(String(u))
		return {closed: true, focus() {}, close() {}, blur() {}, location: {href: String(u)}, document: {write() {}, close() {}, open() {}}, postMessage() {}}
	}
	// ---- window.print is a blocking dialog in some chrome modes
	window.print = function () {
		window.__abOpened.push('print()')
	}
	// ---- the suite's own error beacon etc. needs nothing; expose a flag for tooling
	window.__abHarness = true
}

module.exports = {
	script(cfg) {
		return `(${injected.toString()})(${JSON.stringify(cfg)})`
	},
	defaults: {base: Date.UTC(2026, 2, 2, 1, 0, 0), seed: 20260302, realTime: false},
}
