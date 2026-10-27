'use strict'
// toolbox: static pages at /ilar-toolbox (+ the /editor-popups and /studydesk-toolbox aliases), the /images prefix (icon recolouring route),
// and pseudo-apps for the endpoints the toolbox pre-fetches from sibling apps whose fixtures belong to other workers or are out of scope
// (announcements, /fetch-settings + /save-settings with the toolbox's favourites shape).
const fs = require('fs')
const path = require('path')
const {APPS, NOW, DAY, oid, uuid, lorem, img, AUDIO} = require('../lib/shared')
const D = require('../lib/data/toolbox')

const TB = `${APPS}/toolbox`
const STAFF_ID = '2222'
const ACCESS = ['published', 'admin', 'beta', 'toolbox-suggestions', 'content-template-editor', 'podcast-manager-admin', 'podcast-manager-beta']

// iconColours fallback table from toolbox/index.js (the live copy is synced off si-studydesk-styles' palette.css)
const ICON_COLOURS = {charcoal: '#777777', gold: '#ffb448', orange: '#ED6A21', green: '#3E8521', purple: '#775d94', blue: '#0080A8', transparent: '#00000000'}

function iconHex(v) {
	let hex = String(v || '').trim().replace(/^#/, '')
	return /^([0-9a-f]{3}){1,2}$/i.test(hex) ? `#${hex}` : null
}

// the three prefixes share one router in production, so every route is relative to whichever prefix was used
const toolbox = {
	name: 'toolbox',
	prefixes: ['/ilar-toolbox', '/editor-popups', '/studydesk-toolbox'],
	ownNodeModules: `${TB}/node_modules`,
	static: [`${TB}/public`],
	pages: [
		{
			id: 'toolbox', path: '/ilar-toolbox/', query: {},
			// the suite default access list carries 'presentation-mode', which hides every unpublished item; an admin without it sees all 29 (incl. Layout/Course Templates)
			session: {role: 'staff', access: ACCESS},
			// ng-options writes object:<n> option values off angular's global uid counter, whose value depends on how many objects were hashed before (timing of the pre-fetches)
			scrub: [['object:\\d+', 'object:N']],
			notes: 'staff+admin user; populated catalogue, favourites, popularity, layout/course/h5p templates, podcasts, discussions, photospheres, models, guides, forums',
			interact: {
				steps: [
					// search, sort, favourites filter (all re-filter m.items through updateDisplayItems)
					{kind: 'type', sel: '.search-bar', text: 'photo', label: 'search "photo"'},
					{kind: 'type', sel: '.search-bar', text: 'banner', label: 'search "banner"'},
					{kind: 'type', sel: '.search-bar', text: ' ', label: 'clear search'},
					{kind: 'click', sel: '.sort-options .sort-option:nth-child(2)', label: 'sort Popular'},
					{kind: 'click', sel: '.sort-options .sort-option:nth-child(3)', label: 'sort New'},
					{kind: 'click', sel: '.sort-options .sort-option:nth-child(1)', label: 'sort A-Z'},
					{kind: 'click', sel: '.favourite-filter-button', label: 'favourites only'},
					{kind: 'click', sel: '.favourite-filter-button', label: 'all items'},
					// favourite one card, open and close a preview
					{kind: 'click', sel: '.tb-card:nth-child(2) .tb-star-icon', label: 'favourite card 2'},
					{kind: 'click', sel: '.tb-card:nth-child(1) .btn-preview', label: 'preview card 1'},
					// layout templates: pick a section, then a chapter, hover-free; recolour
					{kind: 'type', sel: '.search-bar', text: 'layout templates', label: 'search "layout templates"'},
					{kind: 'click', sel: '.tb-card .btn-select', label: 'select Layout Templates'},
					{kind: 'click', sel: '.content-templates-groups .tb-dropdown-trigger', label: 'open section dropdown'},
					{kind: 'click', sel: '.tb-dropdown-menu .tb-dropdown-option:nth-child(1)', label: 'pick first section'},
					{kind: 'click', sel: '.content-templates-templates .tb-dropdown-trigger', label: 'open template dropdown'},
					{kind: 'click', sel: '.tb-dropdown-menu .tb-dropdown-option', label: 'pick first template'},
					{kind: 'click', sel: '.content-templates-colour-override-wrapper colour-dots .dot:nth-child(4)', label: 'recolour template'},
					{kind: 'click', sel: '.header-install-page .btn-select', label: 'back to list'},
					// course templates (course backups list)
					{kind: 'type', sel: '.search-bar', text: 'course templates', label: 'search "course templates"'},
					{kind: 'click', sel: '.tb-card .btn-select', label: 'select Course Templates'},
					{kind: 'select', sel: '.page-install select.ilar-option-input', index: 2, label: 'pick a course template'},
					{kind: 'click', sel: '.header-install-page .btn-select', label: 'back to list'},
					// podcast player: podcasts come from podcast-manager, the select is a select2
					{kind: 'type', sel: '.search-bar', text: 'podcast', label: 'search "podcast"'},
					{kind: 'click', sel: '.tb-row-cards .tb-card:nth-child(2) .btn-select', label: 'select Podcast Player (2nd card)'},
					{kind: 'select', sel: '.page-install select#podcast', index: 3, label: 'pick a podcast'},
					{kind: 'click', sel: '.header-install-page .btn-select', label: 'back to list'},
					// pronunciation guide
					{kind: 'type', sel: '.search-bar', text: 'pronunciation', label: 'search "pronunciation"'},
					{kind: 'click', sel: '.tb-card .btn-select', label: 'select Pronunciation Guide'},
					{kind: 'select', sel: '.page-install select.ilar-option-input', index: 2, label: 'pick a guide'},
					{kind: 'click', sel: '.header-install-page .btn-select', label: 'back to list'},
					// inline group discussion
					{kind: 'type', sel: '.search-bar', text: 'discussion', label: 'search "discussion"'},
					{kind: 'click', sel: '.tb-card .btn-select', label: 'select Inline Group Discussion'},
					{kind: 'select', sel: '.page-install select.ilar-option-input', index: 2, label: 'pick a discussion'},
					{kind: 'click', sel: '.header-install-page .btn-select', label: 'back to list'},
					// announcements forum picker
					{kind: 'type', sel: '.search-bar', text: 'compact announcements', label: 'search "compact announcements"'},
					{kind: 'click', sel: '.tb-card .btn-select', label: 'select Compact Announcements'},
					{kind: 'select', sel: '.page-install select.ilar-option-input', index: 2, label: 'pick a forum'},
					{kind: 'click', sel: '.header-install-page .btn-select', label: 'back to list'},
					// 3D model viewer
					{kind: 'type', sel: '.search-bar', text: '3d model', label: 'search "3d model"'},
					{kind: 'click', sel: '.tb-card .btn-select', label: 'select 3D Model Viewer'},
					{kind: 'select', sel: '.page-install select.ilar-option-input', index: 2, label: 'pick a model'},
					{kind: 'click', sel: '.header-install-page .btn-select', label: 'back to list'},
					// student note taker: course on/off toggle loaded from the notes app
					{kind: 'type', sel: '.search-bar', text: 'note taker', label: 'search "note taker"'},
					{kind: 'click', sel: '.tb-card .btn-select', label: 'select Student Note Taker'},
					{kind: 'click', sel: '.notes-settings-toggle-row .ilar-toggle-switch', label: 'toggle note taker'},
					{kind: 'click', sel: '.header-install-page .btn-select', label: 'back to list'},
					// header pages that frame this suite's own apps: the suggestion board, then the usage + reaction reports
					{kind: 'type', sel: '.search-bar', text: ' ', label: 'clear search'},
					{kind: 'click', sel: '.page-main .top-header-buttons .top-header-button:nth-child(3)', label: 'open Suggestions'},
					{kind: 'click', sel: '.page-feedback .header-other-page .btn-select', label: 'back from Suggestions'},
					{kind: 'click', sel: '.page-main .top-header-button-report', label: 'open Reports'},
					{kind: 'click', sel: '.report-selection-button:nth-child(2)', label: 'User Reaction Report tab'},
					{kind: 'click', sel: '.page-reports .header-other-page .btn-select', label: 'back from Reports'},
				],
			},
		},
		{
			id: 'toolbox-content-template-access-modal', path: '/ilar-toolbox/content-template-access-modal/', query: {},
			notes: 'the page waits for ilar-manager to postMessage {transferData}; the fixture serves the real index.html with a tiny injected sender so the section/access list is populated',
			interact: {
				steps: [
					{kind: 'click', sel: '.groups .group:nth-child(2)', label: 'toggle 2nd access group'},
					{kind: 'click', sel: '.groups .group:nth-child(4)', label: 'toggle 4th access group'},
					{kind: 'click', sel: '.groups .group:nth-child(2)', label: 'untoggle 2nd access group'},
					{kind: 'click', sel: '.tb-btn-filled', label: 'save access groups'},
				],
			},
		},
	],
	// per-server state (reset by /__reset): everything the stub backend keeps in memory
	init(s) {
		s.sections = D.sectionDocs()
		s.templates = D.contentTemplateDocs()
		s.audioItems = D.audioPlayerItems()
		s.feedback = []
		s.courseBackups = D.courseTemplates()
		s.saved = []
	},
	routes(r) {
		// ---- layout (content) templates
		r.get('fetch-content-templates', ctx => D.fetchContentTemplates(ctx.query, ctx.query.allSections === 'true' && ctx.session.access.includes('admin')))
		r.get('fetch-course-templates', ctx => ctx.state.courseBackups)
		r.get('fetch-h5p-templates', ctx => D.h5pTemplates())
		r.get('fetch-content-template-sections', ctx => ctx.state.sections.filter(x => x.lmsURL === ctx.query.lmsURL))
		r.get('get-template-published-state', ctx => {
			let t = ctx.state.templates.find(x => x.chapterID === parseInt(ctx.query.id) && x.lmsURL === ctx.query.lmsURL)
			return !!(t && t.published)
		})
		r.get('get-content-template-section', ctx => ctx.state.sections.find(x => x.sectionID === parseInt(ctx.query.id) && x.lmsURL === ctx.query.lmsURL) || {})
		r.get('get-content-template-book-state', ctx => {
			let ids = String(ctx.query.bookIDs || '').split(',').map(x => parseInt(x)).filter(x => !isNaN(x))
			return {
				books: ids.map(id => ({
					bookID: id,
					chapters: ctx.state.templates.filter(t => t.bookID === id).map(t => ({chapterID: t.chapterID, hasCode: !!t.code, title: t.chapterTitle})),
				})),
			}
		})
		r.get('get-template-needing-update', ctx => [])
		r.post('save-content-template-preview', ctx => ctx.text('OK'))
		r.post('save-content-template', ctx => {
			let data
			try {
				data = JSON.parse(ctx.body.data)
			}
			catch (e) {
				return ctx.status(412)
			}
			if (!data || !data.chapterID || !data.chapterTitle || !data.code) {
				return ctx.status(412)
			}
			let existing = ctx.state.templates.find(t => t.chapterID === parseInt(data.chapterID))
			if (existing) {
				Object.assign(existing, data, {chapterID: parseInt(data.chapterID), needsUpdate: true})
			}
			else {
				ctx.state.templates.push(Object.assign({}, data, {chapterID: parseInt(data.chapterID), needsUpdate: true, published: false}))
			}
			ctx.text('OK')
		})
		r.post('save-content-template-order', ctx => ctx.text('OK'))
		r.post('sync-content-template-chapters', ctx => ctx.text('OK'))
		r.post('sync-content-template-book-settings', ctx => ctx.text('OK'))
		r.post('save-content-template-section', ctx => {
			let data
			try {
				data = JSON.parse(ctx.body.data)
			}
			catch (e) {
				return ctx.status(412)
			}
			if (!data || !data.sectionID || !data.access || !data.lmsURL) {
				return ctx.status(412)
			}
			data.sectionID = parseInt(data.sectionID)
			let sec = ctx.state.sections.find(x => x.sectionID === data.sectionID)
			if (sec) {
				Object.assign(sec, {title: data.title, access: data.access, lmsURL: data.lmsURL})
			}
			else {
				ctx.state.sections.push({_id: oid('ct-section', data.sectionID), sectionID: data.sectionID, title: data.title, access: data.access, lmsURL: data.lmsURL})
			}
			ctx.text('OK')
		})
		r.all('upload-course-backup', ctx => ({ok: true, courseID: parseInt(ctx.body.courseID) || 0}))

		// ---- self-hosted H5P previews
		r.get('h5p-preview/map', ctx => D.h5pPreviewMap())
		r.get('h5p-preview/have', ctx => ({}))
		r.post('h5p-preview/content-ids', ctx => ({}))
		r.post('h5p-preview/bind', ctx => ({ok: true}))
		r.get('h5p-preview/:hash', ctx => ctx.html(D.h5pPlayerPage(ctx.params.hash)))
		r.post('flag-content-template-h5p', ctx => ctx.text('OK'))
		r.post('save-content-template-h5p', ctx => ctx.text('OK'))

		// ---- catalogue, popularity, misc
		r.all('items', ctx => {
			let full = D.catalogue()
			if (ctx.query.lite !== 'true') {
				return JSON.parse(JSON.stringify(full, (k, v) => typeof v === 'function' ? undefined : v))
			}
			let lite = {}
			for (let item of full) {
				let s = Object.assign({}, item)
				for (let k of ['func', 'iconFile', 'maxHeight', 'preview', 'requiredFields', 'supportLink', 'thumbnailDescription']) {
					delete s[k]
				}
				lite[s.editorID] = JSON.parse(JSON.stringify(s, (k, v) => typeof v === 'function' ? undefined : v))
			}
			return lite
		})
		r.all('get-inserts-by-item', ctx => D.insertsByItem())
		r.post('sync-icon-colours', ctx => ({changed: false, iconColours: ICON_COLOURS}))
		r.all('changelog', ctx => ctx.text(D.CHANGELOG, 200, 'text/markdown; charset=utf-8'))
		r.post('send-feedback', ctx => {
			ctx.state.feedback.push({text: ctx.body.text})
			ctx.text('OK')
		})

		// feedback.html is an ng-include whose first render (before the session lands) shows the non-admin dropzone form, and Dropzone appends a hidden
		// <input> to <body> that outlives the ng-if. Whether the template or the session wins that race is pure timing, so the template is answered
		// late (the session always lands first, as it does on the real host where the page is cached but the session is a round trip).
		r.get('sys/pages/feedback.html', async ctx => {
			await new Promise(res => setTimeout(res, 700))
			return ctx.file(`${TB}/public/sys/pages/feedback.html`, 'text/html; charset=utf-8')
		})

		// ---- audio player / Panopto
		r.get('fetch-audio-player-items', ctx => ctx.state.audioItems.filter(x => x.courseCode === ctx.query.courseCode || x.username === ctx.query.username))
		r.get('audio-player-status/:id', ctx => ctx.state.audioItems.find(x => x._id === ctx.params.id) || ctx.status(404))
		r.post('upload-audio', ctx => {
			let item = {_id: oid('audio-item', 100 + ctx.state.audioItems.length), title: ctx.body.title || 'Untitled', author: ctx.body.author || '', courseCode: ctx.body.courseCode || 'ABC3001', username: 'u1234567',
				mp3Filename: 'upload.mp3', thumbnailFilename: 'upload.png', panoptoSessionId: uuid('panopto', 100), status: 'ready', uploaded: NOW}
			ctx.state.audioItems.push(item)
			return item
		})
		r.post('upload-audio-thumbnail', ctx => ({ok: true, thumbnailFilename: 'upload.png'}))
		r.get('fetch-panopto-transcript', ctx => '1\n00:00:00,000 --> 00:00:04,000\nWelcome to the course.\n')
		r.all('panopto-auth', ctx => ctx.text('Panopto authorization successful.'))

		// ---- the access modal needs a postMessage from ilar-manager before it shows anything; serve the real page with a sender appended
		r.get('content-template-access-modal', ctx => {
			let html = fs.readFileSync(`${TB}/public/content-template-access-modal/index.html`, 'utf8')
			let sender = `<script>window.addEventListener('load',function(){var go=function(){window.postMessage({transferData:{sectionID:102,title:'Learning modules'}},'*')};setTimeout(go,60)})</script>`
			return ctx.html(html.replace('</body>', sender + '</body>'))
		})

		// ---- cross-app endpoints the toolbox pre-fetches (abs stubs: the owning app's own route wins automatically)
		r.abs('GET', '/pronunciation-ilar/fetch-available-guides', ctx => D.pronunciationGuides())
		r.abs('GET', '/photospheres/admin/fetch-all-sessions', ctx => D.photospheres())
		r.abs('GET', '/3d-model-viewer/fetch-all-models', ctx => D.models())
		r.abs('GET', '/podcast-manager/api/podcasts/get-all', ctx => D.podcasts())
		r.abs('GET', '/group-discussion/fetch-all', ctx => D.discussions())
		r.abs('GET', '/notes/course-settings/enabled', ctx => ({enabled: true}))
		r.abs('POST', '/notes/course-settings', ctx => ({enabled: !!ctx.body.enabled}))
	},
}

// /images: the toolbox's public/images served with the colour-substituting icon route (index.js ~line 2139). Icons are authored with the
// circle as #ffb448 and the glyph as #1e1e1e; ?colour= picks the circle from the palette, ?circle= / ?glyph= override each separately.
const images = {
	name: 'toolbox-images',
	prefixes: ['/images'],
	static: [`${TB}/public/images`],
	pages: [],
	routes(r) {
		r.get(/^icons\/([^/]+\.svg)\/?$/, ctx => {
			let file = path.join(`${TB}/public/images/icons`, path.basename(ctx.match[1]))
			let svg
			try {
				svg = fs.readFileSync(file, 'utf8')
			}
			catch (e) {
				return ctx.status(404)
			}
			let colour = ctx.query.colour || 'gold'
			let circle = iconHex(ctx.query.circle) || ICON_COLOURS[colour] || ICON_COLOURS.gold
			let glyph = iconHex(ctx.query.glyph)
			svg = svg.split('#ffb448').join(circle)
			if (glyph) {
				svg = svg.split('#1e1e1e').join(glyph)
			}
			ctx.text(svg, 200, 'image/svg+xml')
		})
	},
}

// announcements is out of scope as an app: the toolbox only asks it for the forums list of the current course/user
const announcements = {
	name: 'announcements',
	prefixes: ['/announcements'],
	static: [],
	pages: [],
	routes(r) {
		r.get('fetch-forum-data', ctx => D.forums())
	},
}

// /fetch-settings and /save-settings live in si-manager (root app), whose stub returns a shape the toolbox doesn't use (it reads
// editorFavourites). A prefix-owned pseudo-app beats the root app, so the toolbox gets favourites that persist per server state;
// anything else (e.g. podcast player asking by username) gets the original root shape.
const settings = {
	name: 'toolbox-settings',
	prefixes: ['/fetch-settings', '/save-settings'],
	static: [],
	pages: [],
	init(s) {
		s.byUser = {[STAFF_ID]: {editorFavourites: D.favourites(), language: 'en'}}
	},
	routes(r) {
		r.all('', ctx => {
			if (ctx.req.url.startsWith('/save-settings')) {
				let user
				try {
					user = JSON.parse(decodeURIComponent(Buffer.from(ctx.body.user || '', 'base64').toString()))
				}
				catch (e) {
					return ctx.status(412)
				}
				if (user && user.userID) {
					ctx.state.byUser[user.userID] = Object.assign({}, user.settings || {})
				}
				return ctx.text('OK')
			}
			let id = ctx.query.userID
			if (!id) {
				return ctx.status(412)
			}
			return ctx.state.byUser[id] || (id === STAFF_ID ? {} : {favourites: ['buttons-and-tiles', 'cards'], language: 'en', lastTab: 'insert', hiddenIlars: []})
		})
	},
}

// /usage-report is served by leap-components in production (not checked out, out of scope); the toolbox's Reports tab frames it
const usageReport = {
	name: 'toolbox-usage-report',
	prefixes: ['/usage-report'],
	static: [],
	pages: [],
	routes(r) {
		r.get('', ctx => {
			let rows = D.insertsByItem().sort((a, b) => b.count - a.count)
			let total = rows.reduce((a, b) => a + b.count, 0)
			return ctx.html(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Toolbox usage report</title>` +
				`<style>body{font:14px 'Open Sans',Arial,sans-serif;margin:0;padding:16px;color:#222}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:6px 10px;border-bottom:1px solid #ddd}` +
				`.bar{display:inline-block;height:10px;background:#ffb448;vertical-align:middle}</style></head><body><h2>Toolbox usage report</h2><p>${total} inserts in this course in the last 12 months.</p>` +
				`<table><thead><tr><th>Item</th><th>Inserts</th><th></th></tr></thead><tbody>` +
				rows.map(x => `<tr><td>${x.title[0]}</td><td>${x.count}</td><td><span class="bar" style="width:${x.count * 4}px"></span></td></tr>`).join('') +
				`</tbody></table></body></html>`)
		})
	},
}

module.exports = [toolbox, images, announcements, settings, usageReport]
