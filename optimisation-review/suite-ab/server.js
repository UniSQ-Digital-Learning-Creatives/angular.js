#!/usr/bin/env node
'use strict'
/*
 * suite-ab server: serves the in-scope pages of the apps suite from each app's own public folder at its
 * production URL prefix, plus the shared assets other apps pull in (si-manager's /node_modules and
 * /utilities.js, /styles, toolbox's /ilar-toolbox/sys/...), with fixture-backed API stubs.
 * One origin, like HAProxy in production.
 *
 * Standalone:  node server.js --port 4800 --angular /path/angular.min.js [--nojquery [stash|ngjq]]
 * Library:     const {createSuiteServer} = require('./server')
 */
const http = require('http')
const fs = require('fs')
const path = require('path')
const {APPS, buildSession} = require('./lib/shared')

const TYPES = {
	'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.map': 'application/json',
	'.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
	'.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
	'.eot': 'application/vnd.ms-fontobject', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.mp4': 'video/mp4',
	'.webm': 'video/webm', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.txt': 'text/plain',
	'.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm', '.xml': 'application/xml', '.pdf': 'application/pdf',
}
const ASSET_EXT = new Set(Object.keys(TYPES).map(e => e.slice(1)))

function loadFixtureModules() {
	let dir = path.join(__dirname, 'fixtures')
	return fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort().map(f => {
		let m = require(path.join(dir, f))
		let list = Array.isArray(m) ? m : [m]
		list.forEach(x => x.file = f)
		return list
	}).reduce((a, b) => a.concat(b), [])
}

// -- tiny route table ------------------------------------------------------------------------------------------
function makeRouter(app, ABS) {
	let list = []
	let add = (method, pattern, handler) => {
		let keys = []
		let re
		if (pattern instanceof RegExp) {
			re = pattern
		}
		else {
			let p = String(pattern).replace(/^\/+/, '')
			let src = p.split('/').map(seg => {
				if (seg === '*') {
					return '.*'
				}
				if (seg[0] === ':') {
					keys.push(seg.slice(1))
					return '([^/]+)'
				}
				return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
			}).join('/')
			re = new RegExp('^' + src + '/?$')
		}
		list.push({method, re, keys, handler, app: app.name})
	}
	return {
		list,
		// absolute-path route (matches the full request path, from any page): r.abs('GET', '/other-app/fetch-x', handler)
		// App-owned routes win over abs routes, so a temporary abs stub is replaced as soon as the owning app defines the real one.
		abs: (method, pattern, handler) => {
			let before = list.length
			add(method, pattern, handler)
			let route = list.pop()
			ABS.push(route)
		},
		get: (p, h) => add('GET', p, h),
		post: (p, h) => add('POST', p, h),
		all: (p, h) => add('*', p, h),
		// absolute-path variant is handled by passing a leading '~' : r.root('/x') not needed, see _global.js
	}
}

function createSuiteServer(opts = {}) {
	const modules = opts.modules || loadFixtureModules()
	const state = {session: buildSession(opts.session || {}), apps: {}}
	const log = {unknown: [], missing: [], served: 0, byApp: {}}
	const fileCache = new Map()
	const nojq = opts.nojquery ? (opts.nojquery === true ? 'stash' : opts.nojquery) : false
	const angularFile = opts.angular ? path.resolve(opts.angular) : null
	let angularBuf = null
	if (angularFile) {
		angularBuf = fs.readFileSync(angularFile)
	}
	const angularIsMin = angularFile ? /\.min\.js$/.test(angularFile) : true

	// Build app table
	const apps = []
	const ABS = []
	for (let m of modules) {
		let app = Object.assign({prefixes: [], static: []}, m)
		app.router = makeRouter(app, ABS)
		if (typeof m.routes === 'function') {
			m.routes(app.router, require('./lib/shared'))
		}
		apps.push(app)
	}
	function reset(sessionOverride) {
		state.session = buildSession(Object.assign({}, opts.session || {}, sessionOverride || {}))
		state.apps = {}
		log.unknown.length = 0
		log.missing.length = 0
		log.served = 0
		log.byApp = {}
		for (let app of apps) {
			state.apps[app.name] = {}
			if (typeof app.init === 'function') {
				app.init(state.apps[app.name], state, require('./lib/shared'))
			}
		}
	}
	reset()

	// prefix table, longest first. '' (root) matches everything and is checked last.
	const prefixTable = []
	for (let app of apps) {
		for (let p of app.prefixes) {
			prefixTable.push({prefix: p.replace(/\/+$/, ''), app})
		}
	}
	prefixTable.sort((a, b) => b.prefix.length - a.prefix.length)

	function readCached(f) {
		let c = fileCache.get(f)
		if (c === undefined) {
			try {
				c = fs.statSync(f).isFile() ? fs.readFileSync(f) : null
			}
			catch (e) {
				c = null
			}
			fileCache.set(f, c)
		}
		return c
	}

	function transformHtml(html) {
		let out = html
		if (nojq === 'ngjq') {
			// ng-jq="" makes angular's bindJQuery pick jqLite even though window.jQuery exists
			out = out.replace(/<html\b([^>]*)>/i, (m, a) => /\bng-jq\b/.test(a) ? m : `<html${a} ng-jq="">`)
		}
		else if (nojq === 'stash') {
			// hide window.jQuery while the angular script executes, put it back directly after
			out = out.replace(/<script\b[^>]*\bsrc=["'][^"']*\/angular(?:\.min)?\.js(?:\?[^"']*)?["'][^>]*>\s*<\/script>/gi, tag =>
				'<script data-ab>window.__abjq=window.jQuery;try{delete window.jQuery}catch(e){window.jQuery=undefined}</script>' + tag +
				'<script data-ab>if(window.__abjq){window.jQuery=window.__abjq}</script>')
		}
		return out
	}

	const send = (res, code, body, type, extra) => {
		let headers = Object.assign({'content-type': type || 'application/octet-stream', 'cache-control': 'no-store'}, extra || {})
		res.writeHead(code, headers)
		res.end(body)
	}

	function sendFile(req, res, f, buf) {
		let ext = path.extname(f).toLowerCase()
		let type = TYPES[ext] || 'application/octet-stream'
		if (ext === '.html') {
			return send(res, 200, transformHtml(buf.toString('utf8')), type)
		}
		// Range support for media
		let range = req.headers.range
		if (range && /^bytes=/.test(range)) {
			let m = /bytes=(\d*)-(\d*)/.exec(range)
			let start = m[1] ? +m[1] : 0
			let end = m[2] ? Math.min(+m[2], buf.length - 1) : buf.length - 1
			res.writeHead(206, {'content-type': type, 'content-range': `bytes ${start}-${end}/${buf.length}`, 'accept-ranges': 'bytes', 'content-length': end - start + 1, 'cache-control': 'no-store'})
			return res.end(buf.subarray(start, end + 1))
		}
		return send(res, 200, buf, type, {'accept-ranges': 'bytes'})
	}

	// Resolve p (already stripped of the app prefix) in an app's static dirs
	function staticLookup(app, rel) {
		let dirs = app.static || []
		for (let d of dirs) {
			let root = typeof d === 'string' ? d : d.dir
			let mount = typeof d === 'string' ? '' : (d.mount || '')
			let sub = rel
			if (mount) {
				if (rel !== mount && !rel.startsWith(mount + '/')) {
					continue
				}
				sub = rel.slice(mount.length)
			}
			let f = path.join(root, sub)
			if (!f.startsWith(root)) {
				continue
			}
			let endsSlash = /\/$/.test(rel)
			let buf = endsSlash ? null : readCached(f)
			if (buf) {
				return {f, buf}
			}
			let idx = path.join(f, 'index.html')
			let ibuf = (endsSlash || !path.extname(f)) ? readCached(idx) : null
			if (ibuf) {
				return {f: idx, buf: ibuf, dir: !endsSlash}
			}
		}
		return null
	}

	function collectBody(req) {
		return new Promise(resolve => {
			let chunks = []
			req.on('data', c => chunks.push(c))
			req.on('end', () => resolve(Buffer.concat(chunks)))
			req.on('error', () => resolve(Buffer.concat(chunks)))
		})
	}

	function parseBody(req, raw) {
		let ct = (req.headers['content-type'] || '').toLowerCase()
		let text = raw.toString('utf8')
		if (!raw.length) {
			return {}
		}
		if (ct.includes('json')) {
			try {
				return JSON.parse(text)
			}
			catch (e) {
				return {}
			}
		}
		if (ct.includes('x-www-form-urlencoded') || ct.includes('text/plain')) {
			let o = {}
			for (let [k, v] of new URLSearchParams(text)) {
				o[k] = v
			}
			if (ct.includes('text/plain')) {
				try {
					return JSON.parse(text)
				}
				catch (e) {
				}
			}
			return o
		}
		if (ct.includes('multipart/form-data')) {
			// naive: pull out simple text fields only
			let o = {}
			let re = /name="([^"]+)"(?!; filename)\r\n\r\n([\s\S]*?)\r\n--/g
			let m
			while ((m = re.exec(text))) {
				o[m[1]] = m[2]
			}
			return o
		}
		return {}
	}

	const server = http.createServer(async (req, res) => {
		try {
			await handle(req, res)
		}
		catch (e) {
			log.unknown.push({method: req.method, url: req.url, error: String(e && e.stack || e)})
			try {
				send(res, 500, JSON.stringify({error: String(e && e.message || e)}), 'application/json')
			}
			catch (e2) {
			}
		}
	})

	async function handle(req, res) {
		log.served++
		let u = new URL(req.url, 'http://x')
		let p
		try {
			p = decodeURIComponent(u.pathname)
		}
		catch (e) {
			p = u.pathname
		}

		// -- harness control
		if (p === '/__reset') {
			reset()
			return send(res, 200, '{}', 'application/json')
		}
		if (p === '/__log') {
			return send(res, 200, JSON.stringify(log), 'application/json')
		}
		if (p === '/__fixtures/silence.wav') {
			return send(res, 200, silenceWav(), 'audio/wav')
		}
		let mi = /^\/__fixtures\/img\/(\d+)x(\d+)\.svg$/.exec(p)
		if (mi) {
			let w = +mi[1], h = +mi[2], t = u.searchParams.get('t') || `${w}x${h}`
			let hue = [...t].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7)
			return send(res, 200, `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="hsl(${hue},45%,70%)"/><text x="50%" y="50%" font-family="sans-serif" font-size="${Math.max(10, Math.min(w, h) / 8)}" text-anchor="middle" dominant-baseline="middle" fill="#fff">${t.replace(/[<&]/g, '')}</text></svg>`, 'image/svg+xml')
		}
		if (p === '/__state') {
			return send(res, 200, JSON.stringify(state), 'application/json')
		}

		// -- the angular swap: any request for angular(.min).js is served from the file under test
		let ma = /\/angular\/angular(\.min)?\.js(\.map)?$/.exec(p)
		if (ma && angularBuf) {
			if (ma[2]) {
				let mp = angularFile + '.map'
				let mb = readCached(mp)
				return mb ? send(res, 200, mb, 'application/json') : send(res, 404, 'no map', 'text/plain')
			}
			return send(res, 200, angularBuf, TYPES['.js'], {'x-suite-ab-angular': path.basename(angularFile)})
		}

		// -- socket.io client stub (group discussion, notes, photospheres): deterministic, no realtime
		if (/\/socket\.io\/socket\.io\.js$/.test(p)) {
			return send(res, 200, SOCKET_STUB, TYPES['.js'])
		}
		if (/^\/socket\.io\/|\/socket\.io\/\?/.test(p)) {
			return send(res, 200, '{}', 'application/json')
		}

		// -- find the owning app (longest prefix, then root app with prefix '')
		let owner = null
		let rel = p
		for (let {prefix, app} of prefixTable) {
			if (prefix && (p === prefix || p.startsWith(prefix + '/'))) {
				owner = app
				rel = p.slice(prefix.length) || '/'
				break
			}
		}
		let rootApps = prefixTable.filter(x => !x.prefix).map(x => x.app)

		let raw = req.method === 'GET' || req.method === 'HEAD' ? Buffer.alloc(0) : await collectBody(req)
		let body = parseBody(req, raw)

		const candidates = owner ? [{app: owner, rel}] : []
		for (let ra of rootApps) {
			candidates.push({app: ra, rel: p})
		}
		// Allow a prefixed app to fall back on root assets (e.g. /ilar-toolbox/node_modules/... is not a thing, but /x/utilities.js is not either)

		// express.static redirects "/prefix" -> "/prefix/" (relative asset urls depend on it)
		if (owner && rel === '/' && !p.endsWith('/') && req.method === 'GET' && owner.static && owner.static.length) {
			return send(res, 301, '', 'text/plain', {location: p + '/' + u.search})
		}

		// 1. routes
		for (let {app, rel: r} of candidates) {
			let relNoSlash = r.replace(/^\/+/, '')
			for (let route of app.router.list) {
				if (route.method !== '*' && route.method !== req.method && !(route.method === 'GET' && req.method === 'HEAD')) {
					continue
				}
				let m = route.re.exec(relNoSlash)
				if (!m) {
					continue
				}
				let params = {}
				route.keys.forEach((k, i) => params[k] = decodeURIComponent(m[i + 1]))
				if (route.re.source.indexOf('(?<') >= 0 && m.groups) {
					Object.assign(params, m.groups)
				}
				let q = {}
				for (let [k, v] of u.searchParams) {
					q[k] = v
				}
				let ctx = makeCtx({req, res, u, q, body, raw, params, app, rel: relNoSlash, m})
				log.byApp[app.name] = (log.byApp[app.name] || 0) + 1
				let ret = await route.handler(ctx)
				if (!res.headersSent && !res.writableEnded) {
					if (ret === undefined) {
						return send(res, 204, '')
					}
					if (ret === null) {
						return send(res, 200, 'null', 'application/json')
					}
					if (typeof ret === 'string') {
						return send(res, 200, ret, 'text/plain; charset=utf-8')
					}
					return send(res, 200, JSON.stringify(ret), 'application/json')
				}
				return
			}
		}

		// 1b. absolute routes (cross-app stubs)
		for (let route of ABS) {
			if (route.method !== '*' && route.method !== req.method && !(route.method === 'GET' && req.method === 'HEAD')) {
				continue
			}
			let relNoSlash = p.replace(/^\/+/, '')
			let m = route.re.exec(relNoSlash)
			if (!m) {
				continue
			}
			let params = {}
			route.keys.forEach((k, i) => params[k] = decodeURIComponent(m[i + 1]))
			let q = {}
			for (let [k, v] of u.searchParams) {
				q[k] = v
			}
			let app = apps.find(a => a.name === route.app) || candidates[0].app
			let ctx = makeCtx({req, res, u, q, body, raw, params, app, rel: relNoSlash, m})
			let ret = await route.handler(ctx)
			if (!res.headersSent && !res.writableEnded) {
				if (ret === undefined) {
					return send(res, 204, '')
				}
				if (typeof ret === 'string') {
					return send(res, 200, ret, 'text/plain; charset=utf-8')
				}
				return send(res, 200, JSON.stringify(ret), 'application/json')
			}
			return
		}

		// 2. static
		for (let {app, rel: r} of candidates) {
			if (!app.static || !app.static.length) {
				continue
			}
			if (owner === app && r === '/' && /\/$/.test(p) === false && p !== '/') {
				// "/prefix" -> "/prefix/" like express.static
				return send(res, 301, '', 'text/plain', {location: p + '/' + u.search})
			}
			let hit = staticLookup(app, r)
			if (hit) {
				if (hit.dir && !/\/$/.test(p)) {
					return send(res, 301, '', 'text/plain', {location: p + '/' + u.search})
				}
				log.byApp[app.name] = (log.byApp[app.name] || 0) + 1
				return sendFile(req, res, hit.f, hit.buf)
			}
		}

		// 3. fall back to a "foreign" node_modules (an app's own, when si-manager lacks the package)
		let nm = /(?:^|\/)node_modules\/(.+)$/.exec(p)
		if (nm) {
			for (let m of modules) {
				if (m.ownNodeModules) {
					let f = path.join(m.ownNodeModules, nm[1])
					let b = readCached(f)
					if (b) {
						log.missing.push({url: req.url, note: `only in ${m.name}/node_modules (404 in production, si-manager lacks it)`, served: true})
						return sendFile(req, res, f, b)
					}
				}
			}
		}

		// 4. nothing matched
		let ext = path.extname(p).slice(1).toLowerCase()
		if (ext && ASSET_EXT.has(ext) && ext !== 'json') {
			log.missing.push({url: req.url, method: req.method})
			return send(res, 404, 'not found', 'text/plain')
		}
		// Analytics/beacon style endpoints
		if (/\/(ingest|ingest-bulk|beacon|log-error|analytics)\b/.test(p) && req.method !== 'GET') {
			return send(res, 204, '')
		}
		log.unknown.push({method: req.method, url: req.url, body: Object.keys(body).length ? JSON.stringify(body).slice(0, 200) : undefined})
		if (req.method === 'GET') {
			return send(res, 200, '[]', 'application/json')
		}
		return send(res, 200, '{}', 'application/json')
	}

	function makeCtx({req, res, u, q, body, raw, params, app, rel, m}) {
		const ctx = {
			req, res, url: u, query: q, body, raw, params, rel, match: m, method: req.method,
			state: state.apps[app.name], global: state, session: state.session, app,
			json(data, status = 200) {
				send(res, status, JSON.stringify(data), 'application/json')
			},
			text(s, status = 200, type = 'text/plain; charset=utf-8') {
				send(res, status, s, type)
			},
			html(s, status = 200) {
				send(res, status, transformHtml(s), TYPES['.html'])
			},
			status(code) {
				send(res, code, '', 'text/plain')
			},
			noContent() {
				send(res, 204, '')
			},
			redirect(loc, code = 302) {
				send(res, code, '', 'text/plain', {location: loc})
			},
			file(f, type) {
				let b = readCached(f)
				if (!b) {
					return send(res, 404, 'nf', 'text/plain')
				}
				send(res, 200, b, type || TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream')
			},
			// other apps' state (cross-app endpoints)
			appState(name) {
				return state.apps[name]
			},
		}
		return ctx
	}

	return {
		server, log, state, reset, apps, modules,
		listen(port = 0) {
			return new Promise(resolve => {
				server.listen(port, '127.0.0.1', () => {
					let p = server.address().port
					resolve({port: p, origin: `http://127.0.0.1:${p}`})
				})
			})
		},
		close() {
			return new Promise(resolve => {
				server.closeAllConnections && server.closeAllConnections()
				server.close(() => resolve())
			})
		},
		angularFile, nojq,
	}
}

function silenceWav() {
	// 1 second of 8kHz 8-bit silence
	const n = 8000
	const b = Buffer.alloc(44 + n, 128)
	b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVE', 8); b.write('fmt ', 12)
	b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24)
	b.writeUInt32LE(8000, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write('data', 36); b.writeUInt32LE(n, 40)
	return b
}

// Minimal deterministic socket.io client. Pages can drive it from tests: window.__sockets[i].__fire('event', data)
const SOCKET_STUB = `(function(){
	window.__sockets = window.__sockets || [];
	function Socket(){ this._h = {}; this.connected = true; this.id = 'stub-socket'; this.__emitted = []; this.io = {on:function(){return this}, off:function(){}, opts:{}}; this.disconnected = false; }
	Socket.prototype.on = function(e, f){ (this._h[e] = this._h[e] || []).push(f); return this };
	Socket.prototype.once = Socket.prototype.on;
	Socket.prototype.off = function(e, f){ if (!e) { this._h = {}; } else if (!f) { delete this._h[e]; } else { this._h[e] = (this._h[e] || []).filter(function(x){ return x !== f }) } return this };
	Socket.prototype.removeAllListeners = Socket.prototype.off;
	Socket.prototype.emit = function(e){ var a = Array.prototype.slice.call(arguments, 1); this.__emitted.push([e].concat(a)); var cb = a[a.length-1]; if (typeof cb === 'function' && e !== 'disconnect') { try { cb({}) } catch(x){} } return this };
	Socket.prototype.connect = Socket.prototype.open = function(){ return this };
	Socket.prototype.disconnect = Socket.prototype.close = function(){ return this };
	Socket.prototype.__fire = function(e){ var a = Array.prototype.slice.call(arguments, 1); var self = this; (this._h[e] || []).slice().forEach(function(f){ f.apply(self, a) }) };
	function io(){ var s = new Socket(); window.__sockets.push(s); setTimeout(function(){ s.__fire('connect') }, 0); return s }
	io.connect = io; io.Manager = function(){}; io.Socket = Socket;
	window.io = io;
})();`

module.exports = {createSuiteServer, loadFixtureModules, TYPES}

if (require.main === module) {
	let args = process.argv.slice(2)
	let get = (n, d) => {
		let i = args.indexOf('--' + n)
		return i >= 0 ? args[i + 1] : d
	}
	let nj = args.indexOf('--nojquery')
	let s = createSuiteServer({
		angular: get('angular'),
		nojquery: nj >= 0 ? (args[nj + 1] && !args[nj + 1].startsWith('--') ? args[nj + 1] : true) : false,
	})
	s.listen(+get('port', 4800)).then(({origin}) => {
		console.log('suite-ab server on', origin, 'angular:', s.angularFile || '(si-manager copy)', 'nojquery:', s.nojq || false)
		console.log('pages:')
		for (let m of s.modules) {
			for (let pg of m.pages || []) {
				console.log('  ' + (pg.id || '').padEnd(34), origin + pg.path + (pg.query ? '?' + new URLSearchParams(pg.query) : ''))
			}
		}
	})
	process.on('SIGTERM', () => process.exit(0))
}
