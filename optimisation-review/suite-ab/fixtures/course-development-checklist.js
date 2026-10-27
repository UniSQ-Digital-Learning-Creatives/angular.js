'use strict'
// course-development-checklist (appName leap-content-checklist): jqLite page, GET fetch-content?courseLabel= and /sections.
// Mirrors index.js: latest content version, or the version the course was locked to by its first 'versionSet' event, with the latest
// check state dropped onto each checkbox (currentValue), plus versionID/showHideCheck.
const {APPS, NOW, DAY, oid} = require('../lib/shared')
const CD = require('../lib/data/course-development')

const NAV = {
	'marker-getstarted': 'https://lms.example.edu/course/view.php?id=1111&section=1',
	'marker-courseactivity': 'https://lms.example.edu/course/view.php?id=1111&section=2',
	'marker-studyschedule': 'https://lms.example.edu/course/view.php?id=1111&section=3',
	'marker-assessments': 'https://lms.example.edu/course/view.php?id=1111&section=4',
	'marker-forums': 'https://lms.example.edu/course/view.php?id=1111&section=5',
	'marker-teachingstaff': 'https://lms.example.edu/course/view.php?id=1111&section=6',
	'marker-learningsupport': 'https://lms.example.edu/course/view.php?id=1111&section=7',
	'marker-finalchecks': 'https://lms.example.edu/course/view.php?id=1111&section=8',
}
const QS = {sessionID: 'ab-session', checklistID: '1111', courseLabel: 'ABC3001_2026_S1', navigation: JSON.stringify(NAV)}

function hash(str) {
	let h = 7
	for (let i = 0; i < str.length; i++) {
		h = (Math.imul(h, 31) + str.charCodeAt(i)) >>> 0
	}
	return h
}

// per course: locked version (1 for courses whose label hashes into the old set, null for untouched courses) and ticked boxes
function courseState(label) {
	let h = hash(label)
	let untouched = label === 'NEW1000_2026_S1'
	let versionId = untouched ? null : (h % 5 === 0 ? 1 : 2)
	return {untouched, versionId, showHideCheck: h % 3 !== 0}
}

module.exports = {
	name: 'course-development-checklist',
	prefixes: ['/leap-content-checklist'],
	ownNodeModules: `${APPS}/course-development-checklist/node_modules`,
	static: [`${APPS}/course-development-checklist/public`],
	pages: [
		{
			id: 'course-development-checklist', path: '/leap-content-checklist/', query: QS,
			notes: 'LEAP page (no associatedSection): every section, progress bar, show/hide flag. jqLite page.',
			interact: {
				steps: [
					{kind: 'click', sel: 'label[for="show-hide-check"]', label: 'toggle show checklist in sections'},
					{kind: 'click', sel: '.checklist-section:nth-child(1) .checkbox-repeater:nth-child(1) label', label: 'tick a box'},
					{kind: 'click', sel: '.checklist-section:nth-child(2) .checkbox-repeater:nth-child(2) label', label: 'tick another box'},
					{kind: 'click', sel: '.checklist-section:nth-child(2) .checkbox-repeater:nth-child(2) label', label: 'untick it'},
					{kind: 'click', sel: '.checklist-section:nth-child(4) .checkbox-repeater:nth-child(3) label', label: 'tick a third'},
					{kind: 'click', sel: '.checklist-section:nth-child(8) .checkbox-repeater:nth-child(2) label', label: 'tick in last section'},
				],
				generic: false,
			},
		},
		{
			id: 'course-development-checklist-section', path: '/leap-content-checklist/', query: Object.assign({}, QS, {associatedSection: 'marker-courseactivity'}),
			notes: 'single-section mode (what the iframe on a course page shows): collapsed header, expand, nested checkboxes',
			interact: {
				steps: [
					{kind: 'click', sel: '.chevron-container', label: 'expand'},
					{kind: 'click', sel: '.checkbox-repeater:nth-child(2) .checkbox-container-child:nth-child(2) label', label: 'tick a child (nested parent follows)'},
					{kind: 'click', sel: '.checkbox-repeater:nth-child(2) .checkbox-container-child:nth-child(3) label', label: 'tick another child'},
					{kind: 'click', sel: '.checkbox-repeater:nth-child(4) .checkbox-container-child:nth-child(2) label', label: 'tick a child in another parent'},
					{kind: 'click', sel: '.checkbox-repeater:nth-child(1) label', label: 'tick a plain box'},
					{kind: 'click', sel: '.chevron-container', label: 'collapse'},
				],
				generic: false,
			},
		},
	],
	init(s) {
		s.content = {1: CD.buildContent(1), 2: CD.buildContent(2)}
	},
	routes(r) {
		r.get('fetch-content', ctx => {
			let label = ctx.query.courseLabel
			if (!label || typeof label !== 'string') {
				return ctx.status(400)
			}
			let st = courseState(label)
			let content = JSON.parse(JSON.stringify(ctx.state.content[st.versionId || 2]))
			content.versionID = st.versionId ? content._id : null
			content.showHideCheck = st.showHideCheck
			let h = hash(label)
			// the "recorded events" for this course: roughly 40% of boxes ticked, more in the early sections, none for an untouched course
			let n = 0
			let apply = (box, si) => {
				n++
				box.currentValue = !st.untouched && ((hash(box._id) ^ h) % 100) < (si < 3 ? 70 : 30)
			}
			content.sections.forEach((section, si) => section.checkboxes.forEach(box => {
				apply(box, si);
				(box.checkboxes || []).forEach(c => apply(c, si))
			}))
			return content
		})
		r.get('sections', ctx => {
			let label = ctx.query.courseLabel
			if (!label || typeof label !== 'string') {
				return ctx.status(400)
			}
			let st = courseState(label)
			return {sections: ctx.state.content[st.versionId || 2].sections.map(s => s.associatedSection)}
		})
	},
}
