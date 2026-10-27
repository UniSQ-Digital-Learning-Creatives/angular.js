'use strict'
// Generic, safe interactions. The plan (which elements, in which order) is derived from the first build's DOM and
// replayed verbatim on the other build, so A and B always perform the same steps.
const {settle, snapshot} = require('./browser')

const DENY = /delet|remov|trash|discard|destroy|clear|reset|log ?out|sign ?out|download|print|window\.open|location|\.href|navigat|launch|install|export|upload|send|e-?mail|insert|embed|copy|publish|archive|unpublish|disable|deactivate|\bquit\b|\bexit\b|leave|logout|close-?all/i

// Runs in the page: returns a list of steps
function planInPage(deny, max) {
	const denyRe = new RegExp(deny, 'i')
	function visible(el) {
		if (!el.isConnected) {
			return false
		}
		const r = el.getBoundingClientRect()
		if (r.width < 2 || r.height < 2) {
			return false
		}
		const cs = getComputedStyle(el)
		if (cs.visibility === 'hidden' || cs.display === 'none' || cs.pointerEvents === 'none') {
			return false
		}
		if (el.disabled || el.getAttribute('disabled') !== null) {
			return false
		}
		return true
	}

	function path(el) {
		const parts = []
		while (el && el.nodeType === 1 && el !== document.documentElement) {
			const p = el.parentElement
			if (!p) {
				break
			}
			parts.unshift(el.tagName.toLowerCase() + ':nth-child(' + (Array.prototype.indexOf.call(p.children, el) + 1) + ')')
			el = p
		}
		return 'html > ' + parts.join(' > ')
	}

	function label(el) {
		return ((el.innerText || el.value || el.getAttribute('title') || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.id || el.className || el.tagName) + '').replace(/\s+/g, ' ').trim().slice(0, 40)
	}

	function denied(el) {
		const hay = [el.innerText, el.getAttribute('ng-click'), el.getAttribute('title'), el.getAttribute('aria-label'), el.className && el.className.baseVal === undefined ? el.className : '', el.id, el.getAttribute('ng-href'), el.getAttribute('href'), el.getAttribute('data-ng-click')].join(' | ')
		return denyRe.test(hay) || (el.tagName === 'A' && el.getAttribute('href') && !/^#|^javascript:/.test(el.getAttribute('href')))
	}

	const steps = []
	const seen = new Set()
	const add = (kind, el, extra) => {
		if (steps.length >= max || seen.has(el)) {
			return
		}
		seen.add(el)
		steps.push(Object.assign({kind, sel: path(el), label: label(el)}, extra || {}))
	}
	// 1. text inputs bound with ng-model
	let n = 0
	for (const el of document.querySelectorAll('input[ng-model],input[data-ng-model],textarea[ng-model],textarea[data-ng-model]')) {
		const t = (el.type || 'text').toLowerCase()
		if (['checkbox', 'radio', 'file', 'hidden', 'password', 'range', 'color', 'submit', 'button', 'date', 'datetime-local', 'time', 'month', 'week'].indexOf(t) >= 0) {
			continue
		}
		if (!visible(el) || el.readOnly || n >= 3) {
			continue
		}
		n++
		add('type', el, {text: t === 'number' ? '5' : t === 'email' ? 'a@b.co' : t === 'url' ? 'https://example.org' : 'abc 12'})
	}
	// 2. selects
	n = 0
	for (const el of document.querySelectorAll('select[ng-model],select[data-ng-model]')) {
		if (visible(el) && el.options.length > 1 && n < 2) {
			n++
			add('select', el, {index: Math.min(2, el.options.length - 1)})
		}
	}
	// 3. checkboxes / radios
	n = 0
	for (const el of document.querySelectorAll('input[type=checkbox][ng-model],input[type=radio][ng-model]')) {
		if (visible(el) && n < 2) {
			n++
			add('click', el)
		}
	}
	// 4. ng-click things (tabs, toggles, expanders)
	n = 0
	for (const el of document.querySelectorAll('[ng-click],[data-ng-click],[role=tab]')) {
		if (n >= 8) {
			break
		}
		if (el.matches('input,textarea,select')) {
			continue
		}
		if (!visible(el) || denied(el)) {
			continue
		}
		// skip things nested in something we already clicked
		let nested = false
		for (const s of steps) {
			try {
				const prev = document.querySelector(s.sel)
				if (prev && prev !== el && (prev.contains(el) || el.contains(prev))) {
					nested = true
					break
				}
			}
			catch (e) {
			}
		}
		if (nested) {
			continue
		}
		n++
		add('click', el)
	}
	return steps
}

async function makePlan(s, o = {}) {
	return s.page.evaluate(`(${planInPage.toString()})(${JSON.stringify(DENY.source)}, ${o.max || 14})`)
}

async function runStep(s, step) {
	const page = s.page
	const exists = await page.evaluate(sel => !!document.querySelector(sel), step.sel).catch(() => false)
	if (!exists) {
		return {ok: false, why: 'missing'}
	}
	try {
		if (step.kind === 'type') {
			await page.evaluate(sel => {
				const el = document.querySelector(sel)
				el.scrollIntoView({block: 'center'})
				el.focus()
				if (el.select) {
					el.select()
				}
			}, step.sel)
			await page.keyboard.type(step.text, {delay: 0})
			await page.keyboard.press('Tab')
		}
		else if (step.kind === 'select') {
			await page.evaluate((sel, index) => {
				const el = document.querySelector(sel)
				el.scrollIntoView({block: 'center'})
				el.selectedIndex = index
				el.dispatchEvent(new Event('input', {bubbles: true}))
				el.dispatchEvent(new Event('change', {bubbles: true}))
			}, step.sel, step.index)
		}
		else {
			try {
				await page.evaluate(sel => document.querySelector(sel).scrollIntoView({block: 'center'}), step.sel)
				const h = await page.$(step.sel)
				await h.click({delay: 0})
				await h.dispose()
			}
			catch (e) {
				await page.evaluate(sel => document.querySelector(sel).click(), step.sel)
			}
		}
		return {ok: true}
	}
	catch (e) {
		return {ok: false, why: 'error: ' + String(e.message || e).slice(0, 120)}
	}
}

// Runs a list of steps, snapshotting after each. Returns [{name, ok, why, dom, text, errors:{console,pageErrors}}]
async function runPlan(s, plan, snapOpts, settleOpts, scrubLines) {
	const results = []
	let ci = s.rec.console.length, pi = s.rec.pageErrors.length, ri = s.rec.requests.length, di = s.rec.dialogs.length, ni = s.rec.navigations.length
	let i = 0
	for (const step of plan) {
		i++
		const name = `i${i}:${step.kind} "${step.label}"`
		const r = await runStep(s, step)
		let out = {name, ok: r.ok, why: r.why}
		if (r.ok) {
			await settle(s, Object.assign({quietMs: 450, maxMs: 6000}, settleOpts))
			Object.assign(out, await snapshot(s, snapOpts))
			if (scrubLines) {
				out.dom = scrubLines(out.dom)
				out.text = scrubLines(out.text)
			}
		}
		out.console = s.rec.console.slice(ci)
		out.pageErrors = s.rec.pageErrors.slice(pi)
		out.requests = s.rec.requests.slice(ri)
		out.dialogs = s.rec.dialogs.slice(di)
		out.navigations = s.rec.navigations.slice(ni)
		ci = s.rec.console.length
		pi = s.rec.pageErrors.length
		ri = s.rec.requests.length
		di = s.rec.dialogs.length
		ni = s.rec.navigations.length
		results.push(out)
	}
	return results
}

// Helpers handed to hand-written per-page scripts (fixture page.interact functions)
function makeHelpers(s, snapOpts, settleOpts) {
	const steps = []
	const h = {
		page: s.page,
		plan: steps,
		async click(sel, label) {
			steps.push({kind: 'click', sel, label: label || sel})
		},
		async type(sel, text, label) {
			steps.push({kind: 'type', sel, text, label: label || sel})
		},
		async select(sel, index, label) {
			steps.push({kind: 'select', sel, index, label: label || sel})
		},
	}
	return h
}

module.exports = {makePlan, runPlan, runStep, makeHelpers, DENY}
