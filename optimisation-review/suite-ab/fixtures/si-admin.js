'use strict'
// si-admin (appName "admin"): access manager. GET fetch-access / fetch-editors / fetch-courses / fetch-course-access / fetch-users-access,
// POST save-user-access / save-course-access (urlencoded, state updated like the mongo upserts). Admin check: session access includes 'admin'.
const {APPS, NOW, DAY, oid} = require('../lib/shared')

const FIRST = ['Alex', 'Bianca', 'Callum', 'Dana', 'Elliot', 'Freya', 'Gus', 'Harriet', 'Imran', 'Jess', 'Kenji', 'Lara', 'Marcus', 'Nina', 'Omar', 'Priya', 'Quinn', 'Rosa', 'Sam', 'Tessa']
const LAST = ['Adams', 'Brooks', 'Chowdhury', 'Dalton', 'Evans', 'Foster', 'Grant', 'Hughes', 'Ito', 'Jensen', 'Khan', 'Lopez', 'Mitchell', 'Nolan', 'Owens', 'Pham', 'Quigley', 'Reid', 'Singh', 'Tran']
// the toolbox items that are not published (toolboxItems.js _ITEMS) show up as access groups too
const GROUPS = ['admin', 'beta', 'podcast-manager-beta', 'power-user', 'toolbox-banner-icon', 'presentation-mode',
	'68dc4b7a1f0e4c8a5b2d9101', '690d3c72c13ca970e576b6a2', '69b24f286f9fa6f90902abd3', '6ff455d154a782850353f4d9', '69d87d4891c28132323c061e', '69e1a2c6b1f9d3e4a7c2b5f1', '6ad54f70a0e4dea476aca890', '69b24f286f9fa6f80902abd3']
// select2 builds element ids from Math.random(); the draw order can shift with timing, so blank the random part
const SCRUB = [['select2-data-(\\d+)-[a-z0-9]{4}', 'select2-data-$1-<r>'], ['select2-[a-z0-9]{4}-(container|results|result)', 'select2-<r>-$1']]
const SCHOOLS = ['SBUS', 'SEDU', 'SENG', 'SHCO', 'SNMW', 'SSCI']

// qs-style nested keys (express bodyParser extended): a[b][c]=1 -> {a:{b:{c:'1'}}}
function nest(flat) {
	let out = {}
	for (let k of Object.keys(flat)) {
		let parts = k.replace(/\]/g, '').split('[')
		let o = out
		parts.forEach((p, i) => {
			if (i === parts.length - 1) {
				o[p] = flat[k]
			}
			else {
				o = o[p] = o[p] && typeof o[p] === 'object' ? o[p] : {}
			}
		})
	}
	return out
}

function build(s) {
	// 130 staff editors
	s.editors = []
	for (let i = 0; i < 130; i++) {
		s.editors.push({username: `u${1000000 + i * 7919}`, firstName: FIRST[i % FIRST.length], lastName: LAST[(i * 7 + (i / 20 | 0)) % LAST.length]})
	}
	s.editors.push({username: 'u1234567', firstName: 'Test', lastName: 'Staff'})
	// group membership: deterministic pseudo-random subsets
	s.access = {}
	GROUPS.forEach((g, gi) => {
		let n = g === 'admin' ? 6 : g === 'presentation-mode' ? 2 : 4 + ((gi * 7) % 24)
		s.access[g] = []
		for (let k = 0; k < n; k++) {
			s.access[g].push(s.editors[(gi * 13 + k * 11) % s.editors.length])
		}
		if (g === 'admin') {
			s.access[g][0] = s.editors[s.editors.length - 1]
		}
	})
	// courses that school_relationship knows for this/next year (+ hub)
	s.courses = []
	for (let i = 0; i < 220; i++) {
		s.courses.push(`${['ACC', 'BIO', 'CIV', 'COM', 'EDU', 'ENG', 'HLT', 'LAW', 'NUR', 'PSY'][i % 10]}${1000 + (i * 37) % 3000}_${2026 + (i % 3 === 2 ? 1 : 0)}_S${1 + (i % 2)}`)
	}
	s.courses.push('hub_templates', 'hub_sandbox')
	s.courseAccess = s.courses.filter((c, i) => i % 9 === 0).map((c, i) => ({_id: oid('display-criteria', i), whitelist: true, regex: c, lastModified: new Date(NOW - (i + 1) * DAY).toISOString()}))
	s.courseAccess.unshift({_id: oid('display-criteria', 999), whitelist: true, regex: '^ABC.*', lastModified: new Date(NOW - 90 * DAY).toISOString()})
}

module.exports = {
	name: 'si-admin',
	prefixes: ['/admin'],
	ownNodeModules: `${APPS}/si-admin/node_modules`,
	static: [`${APPS}/si-admin/public`],
	pages: [
		{
			id: 'si-admin', path: '/admin/', query: {sessionID: 'ab-session'}, scrub: SCRUB,
			notes: 'manage-access page (default): access group select2 + editors select, course checklist whitelist (220 courses, 130 editors)',
			interact: {
				steps: [
					{kind: 'select', sel: '.beta-group-wrapper:nth-of-type(2) .access-groups', index: 2, label: 'pick access group (beta)'},
					{kind: 'type', sel: '.beta-group-list-wrapper-filter input', text: 'a', label: 'filter members'},
					{kind: 'select', sel: '.beta-group-wrapper:nth-of-type(2) .editors-input', index: 3, label: 'pick an editor'},
					{kind: 'click', sel: '.beta-group-wrapper:nth-of-type(2) .add-to-group', label: 'add editor to group (POST save-user-access)'},
					{kind: 'select', sel: '.access-groups', index: 7, label: 'pick another group'},
					{kind: 'select', sel: '.beta-group-wrapper:nth-of-type(3) .editors-input', index: 4, label: 'pick a course'},
					{kind: 'click', sel: '.beta-group-wrapper:nth-of-type(3) .add-to-group', label: 'whitelist the course (POST save-course-access)'},
					{kind: 'type', sel: '.beta-group-wrapper:nth-of-type(3) .beta-group-list-wrapper-filter input', text: 'ABC', label: 'filter whitelist'},
					{kind: 'click', sel: '.beta-group-wrapper:nth-of-type(3) .beta-tester:nth-of-type(2) .beta-group-remove-entry', label: 'un-whitelist a course'},
					{kind: 'click', sel: '.presentation-mode', label: 'toggle presentation mode'},
				],
				generic: false,
			},
		},
		{
			id: 'si-admin-toolbox', path: '/admin/', query: {sessionID: 'ab-session', page: 'toolbox'}, scrub: SCRUB,
			notes: 'page=toolbox variant (opened from the toolbox for the current course): add/remove checklist for ABC3001_2026_S1',
			interact: {
				steps: [
					{kind: 'click', sel: '.checklist-access-buttons-wrapper .btn-primary', label: 'add checklist to this course'},
					{kind: 'click', sel: '.checklist-access-buttons-wrapper .btn-primary', label: 'remove it again'},
					{kind: 'select', sel: '.access-groups', index: 1, label: 'pick access group (admin)'},
					{kind: 'type', sel: '.beta-group-list-wrapper-filter input', text: 'e', label: 'filter members'},
				],
				generic: false,
			},
		},
	],
	init(s) {
		build(s)
	},
	routes(r) {
		let admin = ctx => {
			if (!ctx.query.sessionID) {
				ctx.status(412)
				return false
			}
			if (!(ctx.session.user.access || []).includes('admin')) {
				ctx.json({}, 403)
				return false
			}
			return true
		}
		r.get('fetch-courses', ctx => ctx.query.sessionID ? ctx.state.courses : ctx.json({}, 412))
		r.get('fetch-editors', ctx => ctx.query.sessionID ? ctx.state.editors : ctx.json({}, 412))
		r.get('fetch-access', ctx => admin(ctx) ? ctx.state.access : undefined)
		r.get('fetch-course-access', ctx => {
			if (!admin(ctx)) {
				return
			}
			let c = ctx.query.course
			let list = ctx.state.courseAccess.filter(x => x.whitelist && (!c || x.regex === c))
			// real server: course given -> boolean (exactly one match); course empty -> the whole list
			return c && c.length > 0 ? list.length === 1 : list
		})
		r.get('fetch-users-access', ctx => {
			let u = ctx.query.username
			if (!u) {
				return ctx.json({}, 412)
			}
			return Object.keys(ctx.state.access).filter(g => ctx.state.access[g].some(x => x.username === u))
		})
		r.post('save-user-access', ctx => {
			let s = ctx.state
			let access
			try {
				access = JSON.parse(ctx.body.access)
			}
			catch (e) {
				return ctx.status(412)
			}
			if (access !== true && access !== false) {
				return ctx.status(412)
			}
			if (!(ctx.session.user.access || []).includes('admin')) {
				return ctx.status(403)
			}
			// the client posts $.param(data): user[username]=..&user[firstName]=..&group=..&access=..
			let u = nest(ctx.body).user || {}
			let user = {username: u.username, firstName: u.firstName, lastName: u.lastName}
			let group = ctx.body.group
			let list = s.access[group] = s.access[group] || []
			let i = list.findIndex(x => x.username === user.username)
			if (access && i < 0) {
				list.push(user)
			}
			else if (!access && i >= 0) {
				list.splice(i, 1)
			}
			return {username: user.username, group, access}
		})
		r.post('save-course-access', ctx => {
			let s = ctx.state
			if (!(ctx.session.user.access || []).includes('admin')) {
				return ctx.status(403)
			}
			let course = nest(ctx.body).course
			if (!course) {
				return ctx.status(412)
			}
			// removeCourseFromWhitelist() in the client hands a whole course object as the regex, so the form arrives as course[regex][regex]=..:
			// the real server would upsert on that object. Here the nested regex string is used so the entry flips to whitelist:false.
			let regex = typeof course.regex === 'object' && course.regex ? course.regex.regex : course.regex
			let whitelist = course.whitelist === 'true'
			let i = s.courseAccess.findIndex(x => x.regex === regex)
			if (i >= 0) {
				s.courseAccess[i].whitelist = whitelist
			}
			else {
				s.courseAccess.push({_id: oid('display-criteria', s.courseAccess.length + 1000), whitelist, regex, lastModified: new Date(NOW).toISOString()})
			}
			return ctx.status(200)
		})
	},
}
