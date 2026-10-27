'use strict'
// Line diff (Myers O(ND)) with common prefix/suffix trimming. Returns hunks: [{aStart, bStart, a:[...], b:[...]}]
function diffLines(a, b, maxD = 4000) {
	let s = 0
	while (s < a.length && s < b.length && a[s] === b[s]) {
		s++
	}
	let ea = a.length, eb = b.length
	while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) {
		ea--
		eb--
	}
	const A = a.slice(s, ea), B = b.slice(s, eb)
	if (!A.length && !B.length) {
		return []
	}
	if (!A.length || !B.length) {
		return [{aStart: s, bStart: s, a: A, b: B}]
	}
	const N = A.length, M = B.length, max = Math.min(N + M, maxD)
	const off = max + 1
	let v = new Int32Array(2 * max + 3)
	const trace = []
	let found = -1
	for (let d = 0; d <= max; d++) {
		trace.push(v.slice())
		for (let k = -d; k <= d; k += 2) {
			let x
			if (k === -d || (k !== d && v[off + k - 1] < v[off + k + 1])) {
				x = v[off + k + 1]
			}
			else {
				x = v[off + k - 1] + 1
			}
			let y = x - k
			while (x < N && y < M && A[x] === B[y]) {
				x++
				y++
			}
			v[off + k] = x
			if (x >= N && y >= M) {
				found = d
				break
			}
		}
		if (found >= 0) {
			break
		}
	}
	if (found < 0) {
		// too different: report as a single hunk
		return [{aStart: s, bStart: s, a: A, b: B, truncated: true}]
	}
	// backtrack into an op list
	const ops = [] // '=' | '-' | '+'
	let x = N, y = M
	for (let d = found; d > 0; d--) {
		const vv = trace[d]
		const k = x - y
		let prevK
		if (k === -d || (k !== d && vv[off + k - 1] < vv[off + k + 1])) {
			prevK = k + 1
		}
		else {
			prevK = k - 1
		}
		const prevX = vv[off + prevK]
		const prevY = prevX - prevK
		while (x > prevX && y > prevY) {
			ops.push('=')
			x--
			y--
		}
		if (x === prevX) {
			ops.push('+')
			y--
		}
		else {
			ops.push('-')
			x--
		}
	}
	while (x > 0 && y > 0) {
		ops.push('=')
		x--
		y--
	}
	ops.reverse()
	const hunks = []
	let ai = 0, bi = 0, cur = null
	for (const op of ops) {
		if (op === '=') {
			cur = null
			ai++
			bi++
			continue
		}
		if (!cur) {
			cur = {aStart: ai + s, bStart: bi + s, a: [], b: []}
			hunks.push(cur)
		}
		if (op === '-') {
			cur.a.push(A[ai++])
		}
		else {
			cur.b.push(B[bi++])
		}
	}
	return hunks
}

function countDiff(hunks) {
	let del = 0, add = 0
	for (const h of hunks) {
		del += h.a.length
		add += h.b.length
	}
	return {del, add}
}

function formatHunks(hunks, limit = 12, width = 220) {
	const out = []
	let n = 0
	for (const h of hunks) {
		out.push(`@@ A:${h.aStart + 1} B:${h.bStart + 1} @@`)
		for (const l of h.a) {
			if (n++ >= limit) {
				return out.concat(['  ...']).join('\n')
			}
			out.push('- ' + (l.length > width ? l.slice(0, width) + '...' : l))
		}
		for (const l of h.b) {
			if (n++ >= limit) {
				return out.concat(['  ...']).join('\n')
			}
			out.push('+ ' + (l.length > width ? l.slice(0, width) + '...' : l))
		}
	}
	return out.join('\n')
}

module.exports = {diffLines, countDiff, formatHunks}
