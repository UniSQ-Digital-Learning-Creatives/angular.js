'use strict'
// course-development-reports: ui-grid report. Six GET endpoints joined client-side by courseLabel (see main.js populateDatabase).
// ~900 course offerings -> ui-grid pages 500 rows at a time and virtualises the rendered rows. Shapes mirror the mongo aggregates in index.js.
const {APPS} = require('../lib/shared')
const CD = require('../lib/data/course-development')

const COURSES = 900

module.exports = {
	name: 'course-development-reports',
	prefixes: ['/course-development-reports'],
	ownNodeModules: `${APPS}/course-development-reports/node_modules`,
	static: [`${APPS}/course-development-reports/public`],
	pages: [
		{
			id: 'course-development-reports', path: '/course-development-reports/', query: {},
			notes: 'ui-grid (pagination, filtering, exporter, resizeColumns, selection modal): 900 rows, 500/page. Page makes no session call.',
			// grid dates render in local time and sugar formats with the local tz; the harness TZ is fixed per machine so same on A and B
			interact: {
				steps: [
					{kind: 'click', sel: '.ui-grid-pager-next', label: 'next page (rows 501-902)'},
					{kind: 'click', sel: '.ui-grid-pager-previous', label: 'previous page'},
					{kind: 'type', sel: '.ui-grid-header-cell:nth-child(5) .ui-grid-filter-container:nth-child(1) input', text: '60', label: 'filter total completion < 60%'},
					{kind: 'type', sel: '.ui-grid-header-cell:nth-child(13) .ui-grid-filter-container:nth-child(1) input', text: '2026-01-01', label: 'filter first edit date before'},
					{kind: 'click', sel: '.ui-grid-header-cell:nth-child(1) .ui-grid-cell-contents', label: 'sort by course code'},
					{kind: 'click', sel: '.ui-grid-header-cell:nth-child(5) .ui-grid-cell-contents', label: 'sort by total completion'},
					{kind: 'click', sel: '.ui-grid-header-cell:nth-child(4) .ui-grid-filter-container button', label: 'open school multi-select modal'},
					{kind: 'click', sel: '.modalGrid .ui-grid-row:nth-child(2) .ui-grid-selection-row-header-buttons', label: 'select a school'},
					{kind: 'click', sel: '.apply-button', label: 'apply school filter'},
				],
				generic: false,
			},
		},
	],
	init(s) {
		s.data = CD.reportData(COURSES)
	},
	routes(r) {
		r.get('fetch-global-checklist-progression', ctx => ctx.state.data.progression)
		r.get('fetch-checklist-edit-dates', ctx => ctx.state.data.edit)
		r.get('fetch-checklist-teachers', ctx => ctx.state.data.teachers)
		r.get('fetch-checklist-documentation-click-count', ctx => ctx.state.data.clicks)
		r.get('fetch-checklist-teachers-that-read-documentation', ctx => ctx.state.data.readers)
		r.get('fetch-checklist-school-relationship', ctx => ctx.state.data.schools)
	},
}
