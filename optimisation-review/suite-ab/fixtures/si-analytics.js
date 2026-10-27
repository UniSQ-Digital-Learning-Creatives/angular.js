'use strict'
// si-analytics ("analytics" app): in PRODUCTION this app serves no static files at all (index.js has no express.static, public/ holds only
// the dead index.html, whose sys/js/main.js, sys/css/styles.css and chart.js/qs/chroma-js deps were deleted from the repo/package.json).
// So /analytics/ is a 404 in production; the harness still loads the file from public/ (the only way the fork gets exercised): angular and
// jquery come from the generic node_modules fallback, the module 'LTI - Analytics' never gets defined => [$injector:modulerr] (same on A and B).
// The data endpoints below are what the real app answers (fetch, fetch-stats; ingest/ingest-bulk fall through to the harness's 204).
const {APPS, NOW, DAY, oid, uuid} = require('../lib/shared')

const APPS_STATS = ['Reaction Bar', 'Compact Announcements / Opportunities', 'Podcast/Audio Player', 'Pronunciation Guide', 'Photography Catalogue', 'Announcements',
	'Course Content Checklist', 'StudyDesk Toolbox', '360 Photosphere', 'Inline Group Discussion', 'Buttons and Tiles', 'Banner Generator', 'Course Banner Generator',
	'3D Model Viewer', 'Inline Completion Tracker', 'Text Styles']

function stats() {
	let out = {}
	APPS_STATS.forEach((a, i) => {
		let staff = 20 + ((i * 37) % 180)
		let students = (i * 211) % 4000
		out[a] = {uniqueUsersTotal: staff + students, uniqueStaff: staff, staffInserts: (i * 53) % 900, uniqueStudents: students, studentActions: students * (2 + i % 5), uniqueCourses: 10 + ((i * 17) % 160), staffActions: staff * (8 + i % 7)}
	})
	return out
}

module.exports = {
	name: 'si-analytics',
	prefixes: ['/analytics'],
	ownNodeModules: `${APPS}/si-analytics/node_modules`,
	static: [`${APPS}/si-analytics/public`],
	pages: [
		{
			id: 'si-analytics', path: '/analytics/', query: {},
			notes: 'dead page in production (see fixture header): renders only the unbound template + a $injector:modulerr page error; expected on both builds',
			interact: {steps: [], generic: false},
		},
	],
	init(s) {
		s.rows = []
		for (let i = 0; i < 300; i++) {
			s.rows.push({app: 'Reaction Bar LTI', feature: 'reaction', featureID: ['like', 'love', 'laugh'][i % 3], uuid: uuid('analytics', i), timestamp: NOW - i * 3600000,
				meta: {user: {email: i % 4 ? `Student${i % 50}@umail.example.edu` : 'Test.Staff@unisq.edu.au'}, activity: {courseLabel: `ABC${1000 + (i % 30) * 7}_2026_S1`}}})
		}
	},
	routes(r) {
		r.all('fetch', ctx => ctx.query.app ? ctx.state.rows.filter(x => x.app === ctx.query.app || true) : ctx.status(412))
		r.all('fetch-stats', ctx => stats())
		r.all('fetch-data-vimeo', ctx => [{slowQueryName: 'vimeo-data', videos: 120, plays: 48213}])
		r.all('fetch-data-panopto', ctx => [{slowQueryName: 'panopto-data', sessions: 310, views: 90412}])
	},
}
