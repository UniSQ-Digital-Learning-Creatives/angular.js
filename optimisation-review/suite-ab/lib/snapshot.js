'use strict'
// In-page DOM serialiser. Produces a normalised, line-per-node text tree so A/B runs can be line-diffed.
// Evaluated in the page: page.evaluate(snapshotSource, opts).
//
// Normalisations (all deliberate, all documented in README):
//  - attributes sorted by name; class tokens sorted (optionally drop ng-scope/ng-binding/ng-isolate-scope/...)
//  - inline style parsed, declarations sorted, transition*/animation* dropped
//  - form control *properties* (value/checked/selectedIndex) emitted as pseudo attributes
//  - volatile values replaced: uuids, epoch ms, ISO timestamps, long digit runs in ids, origins
//  - script bodies dropped, <style> bodies reduced to a length
//  - same-origin iframes and open shadow roots are walked inline
function snapshotInPage(opts) {
	const NG_CLASSES = /^(ng-scope|ng-binding|ng-isolate-scope|ng-scope|ng-pristine|ng-untouched|ng-valid|ng-valid-.*|ng-empty|ng-not-empty|ng-dirty|ng-touched|ng-invalid|ng-invalid-.*|ng-pending|ng-hide-animate|ng-animate|ng-enter.*|ng-leave.*|ng-move.*|ng-anchor.*)$/
	const NG_DEBUG = /^(ng-scope|ng-binding|ng-isolate-scope)$/
	const lines = []

	function scrub(s) {
		if (typeof s !== 'string') {
			return s
		}
		return s
			.replace(/https?:\/\/(127\.0\.0\.1|localhost):\d+/g, 'HOST')
			.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>')
			.replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g, '<iso>')
			.replace(/\b1[5-9]\d{11}\b/g, '<epoch>')
			.replace(/\b1[5-9]\d{8}\b/g, '<epoch-s>')
			.replace(/\bobject:\d+\b/g, 'object:N')
			.replace(/(errors\.angularjs\.org\/)[\d.]+(?:-[\w.]+)?/g, '$1<ver>')
	}

	function scrubId(s) {
		return scrub(s).replace(/\d{5,}/g, '<n>')
	}

	function normStyle(st) {
		if (!st) {
			return ''
		}
		st = scrub(st)
		const decls = st.split(';').map(d => d.trim()).filter(Boolean).filter(d => !/^(-webkit-|-moz-)?(transition|animation)/i.test(d))
			.map(d => {
				const i = d.indexOf(':')
				return i < 0 ? d : d.slice(0, i).trim().toLowerCase() + ': ' + d.slice(i + 1).trim().replace(/\s+/g, ' ')
			})
		decls.sort()
		return decls.join('; ')
	}

	function attrsOf(el) {
		const out = []
		for (const a of Array.from(el.attributes)) {
			const n = a.name
			let v = a.value
			if (n === 'ng-jq' && el === document.documentElement) {
				continue
			}
			if (n === 'style') {
				v = normStyle(v)
				if (!v) {
					continue
				}
			}
			else if (n === 'class') {
				let toks = v.split(/\s+/).filter(Boolean)
				if (opts.stripNgClasses) {
					toks = toks.filter(t => !NG_CLASSES.test(t))
				}
				else if (opts.stripNgDebug) {
					toks = toks.filter(t => !NG_DEBUG.test(t))
				}
				toks.sort()
				v = toks.join(' ')
				if (!v) {
					continue
				}
			}
			else if (n === 'id' || n === 'for' || n === 'aria-labelledby' || n === 'aria-describedby' || n === 'aria-controls' || n === 'aria-owns') {
				v = scrubId(v)
			}
			else if (n === 'data-tippy-root') {
				v = ''
			}
			else {
				v = scrub(v)
			}
			if (opts.dropAttrs && opts.dropAttrs.indexOf(n) >= 0) {
				continue
			}
			out.push(n + (v === '' ? '' : '=' + JSON.stringify(v.length > 400 ? v.slice(0, 400) + '...(' + v.length + ')' : v)))
		}
		out.sort()
		return out
	}

	function props(el) {
		const p = []
		const tag = el.tagName
		if (tag === 'INPUT') {
			const t = (el.type || '').toLowerCase()
			if (t === 'checkbox' || t === 'radio') {
				p.push('.checked=' + el.checked)
			}
			else if (t !== 'file' && t !== 'password') {
				p.push('.value=' + JSON.stringify(scrub(el.value)))
			}
		}
		else if (tag === 'TEXTAREA') {
			p.push('.value=' + JSON.stringify(scrub(el.value)))
		}
		else if (tag === 'SELECT') {
			p.push('.selectedIndex=' + el.selectedIndex, '.value=' + JSON.stringify(scrub(el.value)))
		}
		else if (tag === 'OPTION') {
			p.push('.selected=' + el.selected)
		}
		else if (tag === 'DETAILS') {
			p.push('.open=' + el.open)
		}
		else if (tag === 'CANVAS') {
			p.push('.size=' + el.width + 'x' + el.height)
		}
		else if (tag === 'VIDEO' || tag === 'AUDIO') {
			p.push('.paused=' + el.paused)
		}
		return p
	}

	function walk(node, depth) {
		const pad = '  '.repeat(depth)
		if (node.nodeType === 3) {
			const t = scrub(node.nodeValue.replace(/\s+/g, ' ').trim())
			if (t) {
				lines.push(pad + '"' + (t.length > 600 ? t.slice(0, 600) + '...(' + t.length + ')' : t) + '"')
			}
			return
		}
		if (node.nodeType === 8) {
			const t = scrub(node.nodeValue.replace(/\s+/g, ' ').trim())
			if (!t) {
				return // empty comments (ui-grid / ng-repeat leftovers) carry no information and come and go with timing
			}
			lines.push(pad + '<!-- ' + (t.length > 200 ? t.slice(0, 200) + '...' : t) + ' -->')
			return
		}
		if (node.nodeType !== 1) {
			return
		}
		const tag = node.tagName.toLowerCase()
		if (tag === 'script' && node.hasAttribute('data-ab')) {
			return
		}
		if (tag === 'script') {
			lines.push(pad + '<script' + (node.src ? ' src=' + JSON.stringify(scrub(node.getAttribute('src'))) : '') + '>')
			return
		}
		if (tag === 'style') {
			lines.push(pad + '<style len=' + (node.textContent || '').length + '>')
			return
		}
		if (node.hasAttribute('data-tippy-root') && node.querySelector('.tippy-box[data-state="hidden"]')) {
			return // a tooltip that has finished (or is finishing) hiding: invisible, and its removal is timing dependent
		}
		const parts = attrsOf(node).concat(props(node))
		lines.push(pad + '<' + tag + (parts.length ? ' ' + parts.join(' ') : '') + '>')
		if (tag === 'iframe' || tag === 'frame') {
			try {
				const d = node.contentDocument
				if (d && d.documentElement) {
					lines.push(pad + '  #iframe-document')
					walk(d.documentElement, depth + 2)
				}
			}
			catch (e) {
				lines.push(pad + '  #iframe-cross-origin')
			}
			return
		}
		if (node.shadowRoot) {
			lines.push(pad + '  #shadow-root')
			for (const c of Array.from(node.shadowRoot.childNodes)) {
				walk(c, depth + 2)
			}
		}
		for (const c of Array.from(node.childNodes)) {
			walk(c, depth + 1)
		}
	}

	walk(document.documentElement, 0)
	return lines
}

// What the visible text looks like (catches CSS-only visibility differences that matter to a user)
function visibleTextInPage() {
	const out = []
	function grab(doc) {
		try {
			out.push((doc.body.innerText || '').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim())
			for (const f of Array.from(doc.querySelectorAll('iframe'))) {
				if (f.contentDocument && f.contentDocument.body) {
					out.push('--- iframe ---')
					grab(f.contentDocument)
				}
			}
		}
		catch (e) {
		}
	}
	grab(document)
	return out.join('\n').replace(/https?:\/\/(127\.0\.0\.1|localhost):\d+/g, 'HOST').split('\n')
}

module.exports = {
	snapshotSource: snapshotInPage.toString(),
	visibleTextSource: visibleTextInPage.toString(),
	snapshotInPage,
	visibleTextInPage,
}
