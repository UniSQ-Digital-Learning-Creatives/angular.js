'use strict'
// si-studydesk-styles (appName styles): the admin at /styles/admin/ (gallery of stylesheets, monaco editor in a same-origin iframe, versions select,
// save/delete). The real stylesheets come from the app's own styles/ dir; the same static dirs also serve every production stylesheet at /styles/<name>.min.css
// for all other pages (unchanged skeleton config). get-stylesheets lists styles/*.css, get-single-stylesheet returns the file text + a version list.
// Every route is behind requireAdmin (session access includes 'admin' and not 'presentation-mode'), like production.
const fs = require('fs')
const {APPS, NOW, DAY, oid} = require('../lib/shared')

const STYLES = `${APPS}/si-studydesk-styles/styles`
// the default staff session carries 'presentation-mode' too, which the styles admin treats as an admin pretending to be a student: use an admin-only set
const ADMIN = {role: 'staff', access: ['published', 'admin', 'beta', 'podcast-manager-admin', 'toolbox-suggestions', 'content-template-editor']}

// ObjectId whose first 4 bytes are a unix timestamp (the admin UI renders the version date out of the id)
function stampedId(seconds, n) {
	return seconds.toString(16).padStart(8, '0') + oid('style-version', n).slice(8)
}

function listFiles() {
	try {
		return fs.readdirSync(STYLES).filter(f => f.endsWith('.css')).sort()
	}
	catch (e) {
		return ['ilar-global-styles.css']
	}
}

module.exports = {
	name: 'si-studydesk-styles',
	prefixes: ['/styles'],
	ownNodeModules: `${APPS}/si-studydesk-styles/node_modules`,
	static: [`${APPS}/si-studydesk-styles/styles`, `${APPS}/si-studydesk-styles/public`, {dir: `${APPS}/si-studydesk-styles/website`, mount: '/admin'}],
	pages: [
		{
			id: 'si-studydesk-styles-website', path: '/styles/admin/', query: {sessionID: 'ab-session'}, session: ADMIN,
			notes: 'gallery of every stylesheet (34) + filter box + add/delete',
			interact: {
				steps: [
					{kind: 'type', sel: '.filter-wrapper input', text: 'ilar', label: 'filter stylesheets'},
					{kind: 'type', sel: '.filter-wrapper input', text: '', label: 'clear filter'},
				],
				generic: false,
			},
		},
		{
			id: 'si-studydesk-styles-editor', path: '/styles/admin/', query: {sessionID: 'ab-session', file: 'cards.css', page: 'editor'}, session: ADMIN,
			notes: 'editor page: monaco (AMD loader from /node_modules/monaco-editor/min/vs) opens the real cards.css in an iframe; versions select; save posts JSON',
			settle: {quietMs: 1200, maxMs: 30000},
			interact: {
				steps: [
					{kind: 'select', sel: 'select[ng-model="$root.currentDocumentVersion"]', index: 1, label: 'switch to an older version (read-only)'},
					{kind: 'select', sel: 'select[ng-model="$root.currentDocumentVersion"]', index: 0, label: 'back to the latest'},
					{kind: 'click', sel: '.save-button', label: 'save (POST save-file)'},
				],
				generic: false,
			},
		},
		{
			id: 'si-studydesk-styles-nonadmin', path: '/styles/admin/', query: {sessionID: 'ab-session'}, session: {role: 'student'},
			notes: 'a non-admin session gets the "Admins only" panel',
		},
	],
	init(s) {
		s.files = listFiles()
		s.deleted = []
		s.saved = {}
	},
	routes(r) {
		let admin = ctx => {
			let access = ctx.session.user.access || []
			if (!ctx.query.sessionID && !ctx.body.sessionID) {
				ctx.status(403)
				return false
			}
			if (!access.includes('admin') || access.includes('presentation-mode')) {
				ctx.status(403)
				return false
			}
			return true
		}
		let text = (state, f) => {
			if (state.saved[f] !== undefined) {
				return state.saved[f]
			}
			try {
				return fs.readFileSync(`${STYLES}/${f}`, 'utf8')
			}
			catch (e) {
				return ''
			}
		}
		let versions = f => {
			// newest first, like the sort({_id: -1}) in the real route; 4 versions per file, one day apart
			let base = Math.floor(NOW / 1000)
			return [0, 1, 2, 3].map(k => ({_id: stampedId(base - (k * 9 + 2) * 86400 / 1, f.length * 10 + k)}))
		}
		r.get('course-styles.css', ctx => ctx.redirect('/styles/lti.min.css', 301))
		r.get('get-stylesheets', ctx => admin(ctx) ? ctx.state.files.filter(f => ctx.state.deleted.indexOf(f) < 0).map(filename => ({filename})) : undefined)
		r.get('get-single-stylesheet', ctx => {
			if (!admin(ctx)) {
				return
			}
			let f = ctx.query.filename
			if (typeof f !== 'string' || !f) {
				return ctx.status(412)
			}
			if (ctx.state.files.indexOf(f) < 0 || ctx.state.deleted.indexOf(f) >= 0) {
				return ctx.status(404)
			}
			let vs = versions(f)
			let current = ctx.query.id ? vs.find(v => v._id === ctx.query.id) : vs[0]
			if (!current) {
				return ctx.status(404)
			}
			// older versions: same file with a header comment so the editor visibly differs
			let code = current._id === vs[0]._id ? text(ctx.state, f) : `/* version ${current._id} */\n` + text(ctx.state, f)
			return {filename: f, code, currentVersion: current._id, latestVersion: vs[0]._id, versions: vs}
		})
		r.post('save-file', ctx => {
			if (!admin(ctx)) {
				return
			}
			let f = ctx.body.filename
			let code = ctx.body.code
			if (typeof f !== 'string' || !/^[\w.-]+\.css$/.test(f) || typeof code !== 'string') {
				return ctx.status(412)
			}
			// the real server refuses css csso can't parse (422 + the offending lines); an unbalanced brace is the case worth keeping
			let open = (code.match(/{/g) || []).length
			let close = (code.match(/}/g) || []).length
			if (open !== close) {
				return ctx.json({error: 'This CSS has syntax errors, so it has not been saved.', errors: ['Unbalanced braces']}, 422)
			}
			ctx.state.saved[f] = code
			if (ctx.state.files.indexOf(f) < 0) {
				ctx.state.files.push(f)
				ctx.state.files.sort()
			}
			let vs = versions(f)
			return {filename: f, currentVersion: vs[0]._id, latestVersion: vs[0]._id, versions: vs}
		})
		r.post('delete-file', ctx => {
			if (!admin(ctx)) {
				return
			}
			let f = ctx.body.filename
			if (typeof f !== 'string' || !/^[\w.-]+\.css$/.test(f)) {
				return ctx.status(412)
			}
			ctx.state.deleted.push(f)
			return ctx.status(200)
		})
		r.post('object-upload', ctx => admin(ctx) ? ctx.status(200) : undefined)
	},
}
