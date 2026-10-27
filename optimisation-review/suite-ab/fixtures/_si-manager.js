'use strict'
// si-manager is the root app of the production host: it owns /node_modules (every page's vendor libs),
// /utilities.js, the fake-LTI session lookup, and the suite-wide helper endpoints other pages call at the root.
// It also serves the status dashboard (at "/") and the toolbox-feedback page.
const path = require('path')
const {APPS, oid, NOW, DAY, lorem} = require('../lib/shared')

const MGR = `${APPS}/si-manager`

const PROCESSES = ['announcements', 'availableHours', 'analytics', 'assessment-accordion-ilar', 'banner-generator', 'chatgpt', 'checklist-report',
	'crosswords', 'emailmanager', 'emotional-response', 'globe', 'group-discussion', 'ilar-toolbox', 'image-generators', 'inline-completion-tracker',
	'job-opportunities', 'leap-content-checklist', 'manager', 'media-catalogue', 'notes', 'obsidian-sync', 'photography-gallery', 'photospheres',
	'podcast-manager', 'podcast-player', 'previews', 'pronunciation-ilar', 'reactions', 'roadmapper', 'storage', 'styles', 'suggest-feature', '3d-model-viewer']

const SCHOOLS = ['School of Business', 'School of Education', 'School of Engineering', 'School of Humanities and Communication', 'School of Nursing and Midwifery', 'School of Science']

function courses() {
	let out = []
	let n = 0
	for (let s = 0; s < SCHOOLS.length; s++) {
		for (let c = 0; c < 5; c++) {
			n++
			out.push({
				CourseCode: `ABC${1000 + n * 7}`, CourseDescription: `Course ${n}: ${lorem(n, 3)}`, SchoolDescription: SCHOOLS[s],
				StudyPeriod: `2026 Semester ${1 + (n % 2)}`, StartDate: Math.floor((NOW - 30 * DAY) / 1000), EndDate: Math.floor((NOW + 90 * DAY) / 1000),
				MidTermStartDate: Math.floor((NOW + 20 * DAY) / 1000), MidTermEndDate: Math.floor((NOW + 27 * DAY) / 1000), WeeksOfInstruction: 14,
				CourseLabel: `ABC${1000 + n * 7}_2026_S${1 + (n % 2)}`,
			})
		}
	}
	return out
}

module.exports = {
	name: 'si-manager',
	prefixes: [''],
	ownNodeModules: `${MGR}/node_modules`,
	static: [
		{dir: `${MGR}/node_modules`, mount: '/node_modules'},
		{dir: `${MGR}/public/status-dashboard`, mount: '/toolbox-server-status'},
		{dir: `${MGR}/public/status-dashboard`, mount: ''}, // "/" is the status dashboard in production
		`${MGR}/public`,
	],
	pages: [
		{id: 'si-manager-status-dashboard', path: '/', query: {}, interact: 'status-dashboard', notes: 'jqLite page; served at / like production'},
		{id: 'si-manager-toolbox-feedback', path: '/toolbox-feedback/', query: {}, notes: 'jQuery page'},
	],
	routes(r) {
		r.get('get-session-formatted', ctx => ({data: ctx.global.session}))
		r.all('status-data', ctx => [PROCESSES.filter((x, i) => i % 11 !== 5), PROCESSES.filter((x, i) => i % 11 === 5)])
		r.all('fetch-settings', ctx => ({favourites: ['buttons-and-tiles', 'cards'], language: 'en', lastTab: 'insert', hiddenIlars: []}))
		r.all('save-settings', ctx => ctx.status(200))
		r.all('fetch-new-messages', ctx => ({new: [], direct: [], count: 0}))
		r.all('courses-and-schools.json', ctx => courses())
		r.all('schools.json', ctx => SCHOOLS)
		r.all('versions.json', ctx => ({'ilar-toolbox': '3.14.0', manager: '2.9.1', notes: '1.2.0', 'group-discussion': '4.0.3'}))
		r.all('fetch-checklist-whitelist', ctx => [{regex: '^ABC.*', whitelist: true}])
		r.all('fetch-checklist-whitelist-single', ctx => true)
		r.all('get-user-data', ctx => null)
		r.all('set-user-data', ctx => ctx.status(200))
		r.get('cache-manifest', ctx => ({epoch: 0, apps: {}}))
		r.get('notifications/unread', ctx => [])
		r.post('notifications/read', ctx => ({}))
		r.all('ilar-manager.js', ctx => ctx.text('/* ilar-manager stub */', 200, 'text/javascript'))
		r.all('ilar-manager', ctx => ctx.text('/* ilar-manager stub */', 200, 'text/javascript'))
	},
}
