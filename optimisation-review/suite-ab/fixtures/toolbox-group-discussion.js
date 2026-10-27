'use strict'
// toolbox-group-discussion: static pages at /group-discussion + API stubs.
// The discussion itself only talks socket.io. The harness's socket stub never delivers events, so GET /group-discussion/
// is served here (instead of the static file) with a script injected after the stubbed socket.io client that plays the server
// (see lib/data/toolbox-group-discussion.js): register -> sync of ~33 messages, reactions, replies, images, link previews,
// anonymous posts, unread markers; new-message / toggle-reaction / edit / delete are answered like index.js does.
const fs = require('fs')
const {APPS, NOW} = require('../lib/shared')
const D = require('../lib/data/toolbox-group-discussion')

const INDEX = `${APPS}/toolbox-group-discussion/public/index.html`

const ORIGIN_ACTIVITY = encodeURIComponent(JSON.stringify({
	courseLabel: D.COURSE, courseTitle: 'Test Environment', origin: 'https://lms.example.edu/mod/page/view.php?id=77',
}))

const R = key => '#mcp-' + D.rowID(key)

function servePage(ctx) {
	let q = ctx.query
	let discussionID = q.discussionID || D.MAIN_ID
	let courseLabel = q.courseLabel || D.COURSE
	let title = q.title || (discussionID === D.MAIN_ID ? D.MAIN_TITLE : discussionID)
	let html = fs.readFileSync(INDEX, 'utf8')
	let tag = '<script src="socket.io/socket.io.js"></script>'
	html = html.replace(tag, tag + '\n' + D.serverScript(discussionID, courseLabel, title))
	return ctx.html(html)
}

module.exports = {
	name: 'toolbox-group-discussion',
	prefixes: ['/group-discussion'],
	ownNodeModules: `${APPS}/toolbox-group-discussion/node_modules`,
	static: [`${APPS}/toolbox-group-discussion/public`, {dir: `${APPS}/toolbox-group-discussion/public-admin`, mount: '/manage'}],
	pages: [
		{
			id: 'toolbox-group-discussion', path: '/group-discussion/',
			query: {discussionID: D.MAIN_ID, courseLabel: D.COURSE, title: D.MAIN_TITLE, mode: 'view', originActivity: ORIGIN_ACTIVITY},
			settle: {quietMs: 900, maxMs: 15000},
			notes: 'jqLite page (cash-dom). Messages come from an in-page fake socket server, see fixtures/toolbox-group-discussion.js',
			interact: {
				steps: [
					// the react palette on a message (opens it), pick the second emoji
					{kind: 'click', sel: `${R('m11')} .mcp-react-button`, label: 'open reaction picker'},
					{kind: 'click', sel: `${R('m11')} .mcp-reaction-picker-emoji:nth-child(2)`, label: 'react with heart'},
					// toggle an existing pill (removes my own reaction again)
					{kind: 'click', sel: `${R('m4')} .mcp-reaction-pill:nth-child(3)`, label: 'toggle own reaction pill'},
					// reply to the post that mentions me
					{kind: 'click', sel: `${R('m26')} .mcp-reply-button`, label: 'reply button'},
					{kind: 'type', sel: '.mcp-textarea', text: 'Thanks Chloe, I will bring my outline along. Also see https://library.example.edu/referencing for the style guide.', label: 'type reply'},
					{kind: 'click', sel: '.mcp-send', label: 'send reply'},
					// mention autocomplete (the step's trailing Tab picks the highlighted entry), then an anonymous post
					{kind: 'type', sel: '.mcp-textarea', text: 'Great thread @Pri', label: 'type @mention'},
					{kind: 'click', sel: '.mcp-anonymous-toggle input', label: 'toggle anonymous'},
					{kind: 'click', sel: '.mcp-send', label: 'send anonymous post'},
					// image lightbox, jump to a replied-to post, jump to latest
					{kind: 'click', sel: `${R('m10')} .mcp-message-image`, label: 'open image lightbox'},
					{kind: 'click', sel: '.swal2-close', label: 'close lightbox'},
					{kind: 'click', sel: `${R('m3')} .mcp-reply-information`, label: 'jump to replied-to post'},
					{kind: 'click', sel: '.scroll-to-latest-message', label: 'scroll to latest'},
					// edit one of my own posts (confirm dialogs), then delete another
					{kind: 'click', sel: `${R('m30')} .mcp-text-options .mcp-edit-button`, label: 'edit own post'},
					{kind: 'type', sel: '.mcp-textarea', text: 'Edited: it is in the Week 3 block under Placement documents, and pinned in the announcements.', label: 'type edit'},
					{kind: 'click', sel: '.mcp-send', label: 'save edit'},
					{kind: 'click', sel: '.swal2-confirm', label: 'confirm edit'},
					{kind: 'click', sel: '.swal2-confirm', label: 'dismiss edit done'},
					{kind: 'click', sel: `${R('m22')} .mcp-text-options .mcp-delete-button`, label: 'delete own post'},
					{kind: 'click', sel: '.swal2-confirm', label: 'confirm delete'},
					{kind: 'click', sel: '.swal2-confirm', label: 'dismiss delete done'},
				],
			},
		},
		{
			id: 'toolbox-group-discussion-admin', path: '/group-discussion/manage/', query: {},
			settle: {quietMs: 900, maxMs: 15000},
			notes: 'catch-up list + the selected discussion in an iframe (../?discussionID=...), which is served by the same fake socket server',
			interact: {
				steps: [
					{kind: 'click', sel: '.cu-unread-toggle input', label: 'unread only on'},
					{kind: 'click', sel: '.cu-unread-toggle input', label: 'unread only off'},
					{kind: 'click', sel: '.cu-list-items .cu-item:nth-of-type(3)', label: 'open third discussion'},
					{kind: 'click', sel: '.cu-list-items .cu-item:nth-of-type(1)', label: 'open first discussion'},
					{kind: 'click', sel: '.cu-list-items .cu-item:nth-of-type(5)', label: 'open fifth discussion'},
					{kind: 'click', sel: '.cu-back', label: 'back to list'},
				],
			},
		},
	],
	// per-server state (reset by /__reset): everything the stub backend keeps in memory
	init(s) {
		s.viewed = []
		s.discussionPages = []
	},
	routes(r) {
		r.get('', servePage)
		r.get('index.html', servePage)
		r.get('fetch-roster', ctx => D.roster())
		r.get('new-messages-for-user', ctx => ctx.query.returnMessages ? [] : false)
		r.all('upload-image', ctx => ({url: '/__fixtures/img/480x320.svg?t=upload', width: 480, height: 320}))
		r.all('set-discussion-page', ctx => ctx.status(200))
		r.all('update-viewed', ctx => {
			ctx.state.viewed.push(ctx.query.rowID)
			return ctx.status(200)
		})
		r.get('catch-up/discussions', ctx => ({discussions: D.catchUp(ctx.query.courseLabel || D.COURSE)}))
		// who has the discussion open in this course (used by the toolbox's "discussions" picker: [{_id: uuid, title: [titles]}])
		r.all('fetch-all', ctx => D.discussions(ctx.query.courseLabel || D.COURSE).map(d => ({_id: d.discussionID, title: [d.title]})))
	},
}
