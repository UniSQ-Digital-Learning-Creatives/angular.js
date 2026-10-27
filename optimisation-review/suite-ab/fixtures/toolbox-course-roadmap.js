'use strict'
// toolbox-course-roadmap (appName roadmapper): in the repo this app is an empty clone ("staging first commity - empty clone of previous tool"):
// public/sys/js, sys/css and sys/pages are EMPTY dirs, so main.js and styles.css 404 and the module 'Module Checklist' never exists =>
// [$injector:modulerr] and the unbound template (same on every build). The one real endpoint is served so the data shape exists once main.js lands:
// GET fetch-roadmap-data?roadmapID= -> the whole roadmap doc (model.title, columns, rows, entries), shape inferred from index.html's template.
const {APPS, NOW, oid, lorem} = require('../lib/shared')

const ROADMAP_ID = oid('roadmap', 0)

function build() {
	let columns = ['Orientation', 'Week 1', 'Week 2', 'Week 3', 'Week 4', 'Mid-semester break', 'Week 5', 'Week 6', 'Week 7', 'Week 8'].map((h, i) => ({id: oid('col', i), heading: h}))
	let rows = ['Readings', 'Videos', 'Quizzes', 'Assessment', 'Live sessions', 'Labs', 'Forums', 'Support'].map((h, i) => ({id: oid('row', i), heading: h}))
	let entries = []
	rows.forEach((row, ri) => {
		columns.forEach((col, ci) => {
			if ((ri * 7 + ci * 3) % 5 === 0) {
				return
			}
			let span = ((ri + ci) % 4 === 0 && ci < columns.length - 1) ? 2 : 1
			entries.push({id: oid('entry', ri * 100 + ci), rowID: row.id, columnID: col.id, span, data: {title: `${row.heading} ${ci + 1}`, colour: ['blue', 'green', 'orange'][(ri + ci) % 3], description: lorem(ri * 10 + ci, 8)}})
		})
	})
	return {_id: ROADMAP_ID, title: 'Introduction to Anatomy: semester roadmap', timestamp: NOW, columns, rows, entries}
}

module.exports = {
	name: 'toolbox-course-roadmap',
	prefixes: ['/roadmapper'],
	ownNodeModules: `${APPS}/toolbox-course-roadmap/node_modules`,
	static: [`${APPS}/toolbox-course-roadmap/public`],
	pages: [
		{
			id: 'toolbox-course-roadmap', path: '/roadmapper/', query: {roadmapID: ROADMAP_ID},
			notes: 'dead page (main.js/styles missing in the repo): unbound template + $injector:modulerr, the same on A and B',
			interact: {steps: [], generic: false},
		},
	],
	init(s) {
		s.roadmap = build()
	},
	routes(r) {
		r.get('fetch-roadmap-data', ctx => {
			if (!/^[0-9a-f]{24}$/i.test(ctx.query.roadmapID || '')) {
				return ctx.status(412)
			}
			return ctx.query.roadmapID === ROADMAP_ID ? ctx.state.roadmap : ctx.status(404)
		})
	},
}
