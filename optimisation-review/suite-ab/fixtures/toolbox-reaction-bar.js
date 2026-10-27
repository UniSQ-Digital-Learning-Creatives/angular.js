'use strict'
// toolbox-reaction-bar: the thumbs up/down + comment widget (/reactions/), its feedback modal, the legacy injector page and the staff
// dashboard (/reactions/dashboard/, chart.js) over a deterministic population of 40 students' reactions (lib/data/toolbox-reaction-bar.js).
const fs = require('fs')
const {APPS, NOW, DAY, oid, uuid, lorem, img, AUDIO} = require('../lib/shared')
const D = require('../lib/data/toolbox-reaction-bar')

const RB = `${APPS}/toolbox-reaction-bar`
const STAFF_ID = '2222'

// bars whose state we want to show something specific (uuid computed with the app's own uuidv5; bars not listed here get a state derived from their uuid)
const BAR = {title: 'Week 2 quiz feedback', type: 'ilar', 'sub-type': 'group-discussion'}
const BAR2 = {title: 'Podcast: Voices from the Darling Downs', type: 'ilar', 'sub-type': 'podcast-player'}
const item = b => ({title: b.title, name: b.title, type: b.type, 'sub-type': b['sub-type'], page: null, origin: null})
const SEEDED = {
	[D.uuidOfItem(item(BAR))]: {positive: true, negative: false, feedback: 'This helped me prepare for the quiz, thank you.'},
	[D.uuidOfItem(item(BAR2))]: {positive: false, negative: true, feedback: ''},
}
const MODAL_UUID = D.uuidOfItem(item(BAR))

const q = b => ({title: b.title, type: b.type, 'sub-type': b['sub-type'], id: 'rb-' + b['sub-type']})

module.exports = {
	name: 'toolbox-reaction-bar',
	prefixes: ['/reactions'],
	ownNodeModules: `${RB}/node_modules`,
	static: [`${RB}/public`],
	pages: [
		{
			id: 'reaction-bar', path: '/reactions/', query: q(BAR),
			notes: 'bar with the staff user already having thumbs-up + a comment saved (state keyed by the bar uuid)',
			interact: {
				steps: [
					{kind: 'click', sel: '.question-emoji-negative', label: 'thumbs down'},
					{kind: 'click', sel: '.question-emoji-negative', label: 'untick thumbs down'},
					{kind: 'click', sel: '.question-emoji-positive', label: 'untick thumbs up'},
					{kind: 'click', sel: '.question-emoji-positive', label: 'thumbs up'},
					{kind: 'click', sel: '.question-emoji-feedback', label: 'open feedback (posts showModal to the parent)'},
				],
			},
		},
		{
			id: 'reaction-bar-dashboard', path: '/reactions/dashboard/', query: {},
			notes: 'staff report: summary page (circles, chart.js bar chart, per-type table with 15+ rows), then group-summary pages via the #page= hash',
			interact: {
				steps: [
					{kind: 'click', sel: 'a.table-header-item-description[href$="groupData=ilar"]', label: 'open ILAR group summary'},
					{kind: 'click', sel: 'a.back-to-summary', label: 'back to summary'},
					{kind: 'click', sel: 'a.table-header-item-description[href$="groupData=h5p"]', label: 'open H5P group summary'},
					{kind: 'click', sel: 'a.back-to-summary', label: 'back to summary'},
					{kind: 'click', sel: 'a.table-header-item-description[href$="groupData=page"]', label: 'open page group summary'},
				],
			},
		},
		{
			id: 'reaction-bar-injector', path: '/reactions/injector.html', query: q(BAR2),
			notes: 'legacy template page: init.js substitutes {origin}/{originroot}/{platformStylesheet} and document.writes it into an iframe; the fixture serves it already substituted',
			interact: {
				steps: [
					{kind: 'click', sel: '.question-emoji-positive', label: 'thumbs up'},
					{kind: 'click', sel: '.question-emoji-negative', label: 'thumbs down'},
					{kind: 'click', sel: '.question-emoji-feedback', label: 'open feedback'},
				],
			},
		},
		{
			id: 'reaction-bar-modal', path: '/reactions/modal.html', query: {uuid: MODAL_UUID, userID: STAFF_ID, instanceID: '1772412000000', title: BAR.title},
			notes: 'the feedback popup; the fixture seeds the sessionStorage key the bar writes before opening it, so the textarea holds the existing comment and the button says Update',
			interact: {
				steps: [
					{kind: 'type', sel: '.modal-texteara', text: 'This helped me prepare for the quiz, and the examples were great.', label: 'edit the comment'},
					{kind: 'click', sel: '.save-button', label: 'Update'},
					{kind: 'click', sel: '.cancel-button', label: 'Cancel'},
				],
			},
		},
	],
	init(s) {
		s.reactions = {}
	},
	routes(r) {
		// state of one bar for one user: what the user did in this server state, else the seeded/derived state
		r.get('get-reaction-data', async ctx => {
			if (!(ctx.query.uuid && ctx.query.userID)) {
				return ctx.status(404)
			}
			// The bar paints its outline icons (o) as soon as the session lands and flips to the selected ones (s) when this answers, so whether the
			// outline images get requested at all is a race between the first digest and this response. Answering a beat late makes the order fixed.
			await new Promise(res => setTimeout(res, 250))
			let base = D.reactionFor(ctx.query.uuid)
			let seeded = SEEDED[ctx.query.uuid]
			return Object.assign({}, base, seeded || {})
		})
		r.get('fetch-dashboard-data', ctx => {
			if (!(ctx.query.courseLabel && ctx.query.lms)) {
				return ctx.status(412)
			}
			return D.dashboardData()
		})
		r.all('get-students-seen-reaction-bar', ctx => ctx.query.courseLabel ? 31 : ctx.status(412))

		// modal.html reads its saved comment out of sessionStorage (written by the bar right before it opens the modal)
		r.get('modal.html', ctx => {
			let html = fs.readFileSync(`${RB}/public/modal.html`, 'utf8')
			let comment = (SEEDED[ctx.query.uuid] || {}).feedback || ''
			let seed = `<script>try{sessionStorage.setItem(${JSON.stringify(`${ctx.query.uuid} - ${ctx.query.userID}`)},${JSON.stringify(JSON.stringify(comment))})}catch(e){}</script>`
			return ctx.html(html.replace('<head>', '<head>' + seed))
		})

		// injector.html is a template for init.js: {origin} is the url of this app dir, {originroot} the host
		r.get('injector.html', ctx => {
			let html = fs.readFileSync(`${RB}/public/injector.html`, 'utf8')
			let root = `http://${ctx.req.headers.host}`
			// the template predates utilities.js being required by main.js (getQuery/fetchActivity/reportAnalytics): without it the controller dies on
			// ReferenceError: getQuery. The fixture adds the script so the page actually runs angular, see the report
			html = html.replace('<script src="{origin}sys/js/uuidv5.js"></script>', '<script src="{origin}sys/js/uuidv5.js"></script><script src="{originroot}/utilities.js"></script>')
			return ctx.html(html.split('{originroot}').join(root).split('{origin}').join(root + '/reactions/').split('{platformStylesheet}').join('/styles/lti.min.css'))
		})
	},
}
