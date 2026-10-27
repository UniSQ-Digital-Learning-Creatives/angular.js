'use strict'
// toolbox-inline-completion-tracker: the embedded tracker (/?id=<settings id>) and its config screen (/config/, which the toolbox normally
// loads in an iframe and talks to through window.parent.m). Both are top level here, so window.parent === window: the config page is served
// with a tiny preamble that gives the page's own `m` the activity/user a toolbox parent scope would have.
const fs = require('fs')
const {APPS, oid} = require('../lib/shared')
const D = require('../lib/data/toolbox-inline-completion-tracker')

const CONFIG = `${APPS}/toolbox-inline-completion-tracker/public/config/index.html`

function preamble(ctx) {
	let s = ctx.global.session
	let cfg = {activity: s.activity, user: s.user}
	// `m = $scope` in main.js assigns the global; the setter adds what window.parent.m would carry in the toolbox
	return `<script>(function(c){var v;Object.defineProperty(window,'m',{configurable:true,enumerable:true,get:function(){return v},set:function(x){v=x;if(x&&x.$root&&!x.activity){x.activity=c.activity;x.user=c.user;x.items=[]}}})})(${JSON.stringify(cfg).replace(/</g, '\\u003c')})</script>`
}

function serveConfig(ctx) {
	let html = fs.readFileSync(CONFIG, 'utf8').replace('<head>', '<head>\n' + preamble(ctx))
	return ctx.html(html)
}

module.exports = {
	name: 'toolbox-inline-completion-tracker',
	prefixes: ['/inline-completion-tracker'],
	ownNodeModules: `${APPS}/toolbox-inline-completion-tracker/node_modules`,
	static: [`${APPS}/toolbox-inline-completion-tracker/public`],
	pages: [
		{
			id: 'toolbox-inline-completion-tracker', path: '/inline-completion-tracker/', query: {id: oid('tracker', 1)},
			notes: 'embedded tracker, 12 cells; hover tooltips post a message to window.parent (nothing listens when top level)',
			interact: {steps: []},
		},
		{
			id: 'toolbox-inline-completion-tracker-config', path: '/inline-completion-tracker/config/', query: {},
			settle: {quietMs: 900, maxMs: 15000},
			notes: 'config screen with the live preview iframe (/inline-completion-tracker/?mode=toolbox). Needs the window.parent.m preamble, see fixtures file. ilar-checkbox template comes from /editor-popups (toolbox fixture)',
			interact: {steps: [
				{kind: 'select', sel: '.option-select-completion-block', index: 1, label: 'pick another completion block'},
				{kind: 'click', sel: '.options-row:nth-of-type(2) ilar-checkbox', label: 'toggle show title'},
				{kind: 'click', sel: '.options-row:nth-of-type(3) ilar-checkbox', label: 'toggle show percentage'},
				{kind: 'click', sel: '.dots .dot:nth-child(4)', label: 'pick green'},
				{kind: 'click', sel: '.dots .dot:nth-child(6)', label: 'pick blue'},
				{kind: 'select', sel: '.option-select-completion-block', index: 2, label: 'pick third block'},
			]},
		},
	],
	init(s) {
		s.blocks = D.blocks()
		s.settings = D.settings()
		s.saved = []
	},
	routes(r) {
		r.get('config', serveConfig)
		r.get('config/', serveConfig)
		r.get('config/index.html', serveConfig)

		r.get('fetch-completion-data', ctx => {
			if (isNaN(parseInt(ctx.query.courseID)) || isNaN(parseInt(ctx.query.userID))) {
				return ctx.status(412)
			}
			return ctx.state.blocks
		})
		r.post('save-completion-data', ctx => {
			let data
			try {
				data = JSON.parse(ctx.body.data)
			}
			catch (e) {
			}
			if (Array.isArray(data) && !isNaN(parseInt(ctx.body.courseID)) && parseInt(ctx.body.userID)) {
				ctx.state.blocks = data
				return ctx.status(200)
			}
			return ctx.status(412)
		})
		r.get('fetch-tracker-data', ctx => {
			if (!/^[0-9a-f]{24}$/.test(ctx.query.id || '') || !ctx.query.userID || !ctx.query.courseID) {
				return ctx.status(412)
			}
			let settings = ctx.state.settings.find(x => x.id === ctx.query.id)
			if (!settings) {
				return ctx.status(404)
			}
			let blk = ctx.state.blocks.find(b => (b.stableid && b.stableid === settings.blockID) || String(b.blockid) === String(settings.blockID))
			if (!blk) {
				return ctx.status(404)
			}
			return {colour: settings.colour, showTitle: settings.showTitle, showPercentage: settings.showPercentage, block: blk}
		})
		r.post('save-new-tracker', ctx => {
			let data
			try {
				data = JSON.parse(ctx.body.data)
			}
			catch (e) {
			}
			if (data && /^[0-9a-f]{24}$/.test(data.id || '') && data.blockTitle && data.courseID && data.blockID) {
				ctx.state.settings.push(Object.assign({}, data, {courseID: parseInt(data.courseID), colour: data.colour || '--default-gradient', showTitle: !!data.showTitle, showPercentage: !!data.showPercentage}))
				return ctx.status(200)
			}
			return ctx.status(412)
		})
		r.post('update-title', ctx => {
			let data
			try {
				data = JSON.parse(ctx.body.data)
			}
			catch (e) {
			}
			if (data && data.courseID && data.oldTitle && data.newTitle) {
				ctx.state.settings.filter(x => x.courseID === data.courseID && x.blockTitle === data.oldTitle).forEach(x => x.blockTitle = data.newTitle)
				return ctx.status(200)
			}
			return ctx.status(412)
		})
	},
}
