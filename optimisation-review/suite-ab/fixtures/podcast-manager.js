'use strict'
// podcast-manager: admin UI at /podcast-manager (?page=dashboard|podcast|episode|edit-episode|upload-episode|create-podcast|edit-podcast)
// plus the /api the toolbox shell and toolbox-podcast-player call (podcasts get/get-all/get-all-admin/rss, episodes get/get-all, data lists).
// Owns the podcasts/episodes state; toolbox-podcast-player reads it through ctx.appState('podcast-manager').
const {APPS, NOW, oid, AUDIO, img} = require('../lib/shared')
const P = require('../lib/data/podcast')

const SCRUB = [['127\\.0\\.0\\.1(?::|%3A)\\d+', '127.0.0.1:PORT'], ['(get-transcript\\?url=)[A-Za-z0-9+/=]+(&|&amp;)title=[A-Za-z0-9+/=]+', '$1<b64>$2title=<b64>']]
const POD = n => oid('podcast', n)
const EP = n => oid('episode', n)
const hostOf = ctx => `http://${ctx.req.headers.host}`
const isInstructor = ctx => String((ctx.session.raw || {}).roles || '').indexOf('Instructor') > -1

module.exports = {
	name: 'podcast-manager',
	prefixes: ['/podcast-manager'],
	ownNodeModules: `${APPS}/podcast-manager/node_modules`,
	static: [`${APPS}/podcast-manager/html`],
	pages: [
		{
			id: 'podcast-manager', path: '/podcast-manager/', query: {},
			notes: 'dashboard (gallery of podcasts). jQuery page, select2 + tippy',
			interact: {steps: [
				{kind: 'type', sel: '.filter-podcast-list', text: 'Lead', label: 'filter podcasts'},
				{kind: 'type', sel: '.filter-podcast-list', text: 'zzz', label: 'filter to nothing'},
				{kind: 'type', sel: '.filter-podcast-list', text: '', label: 'clear filter'},
			]},
		},
		{
			id: 'podcast-manager-podcast', scrub: SCRUB, path: '/podcast-manager/', query: {page: 'podcast', podcastID: POD(1)},
			notes: 'one podcast with its episode table; the gear opens the editor drawer (tippy, templates fetched with get())',
			interact: {steps: [
				{kind: 'click', sel: '.editor-drawer', label: 'editor drawer (gear)'},
				{kind: 'click', sel: '.podcast-info', label: 'close drawer'},
			]},
		},
		{
			id: 'podcast-manager-episode', scrub: SCRUB, settle: {quietMs: 2600, maxMs: 20000}, path: '/podcast-manager/', query: {page: 'episode', episodeID: EP(2)},
			notes: 'episode details; the iframe is the podcast player in preview mode (rss mode, same origin)',
			interact: {steps: [
				{kind: 'click', sel: '.editor-drawer', label: 'editor drawer (gear)'},
				{kind: 'click', sel: '.episode-info', label: 'close drawer'},
			]},
		},
		{
			id: 'podcast-manager-edit-episode', path: '/podcast-manager/', query: {page: 'edit-episode', episodeID: EP(3)},
			notes: 'select2 presenter picker; saving would POST multipart + redirect (not clicked, steps must not navigate)',
			interact: {steps: [
				{kind: 'type', sel: '#title', text: 'Getting started (revised)', label: 'edit title'},
				{kind: 'type', sel: '#description', text: 'A revised description for the episode, with a couple of extra sentences about the guest and what they cover.', label: 'edit description'},
				{kind: 'select', sel: '#presenter', index: 2, label: 'pick presenter'},
				{kind: 'type', sel: '#transcript', text: 'Presenter: Welcome to the show.\n\nGuest: Thanks for having me.', label: 'edit transcript'},
			]},
		},
		{
			id: 'podcast-manager-upload-episode', path: '/podcast-manager/', query: {page: 'upload-episode', podcastID: POD(1)},
			interact: {steps: [
				{kind: 'type', sel: '#title', text: 'A brand new episode', label: 'title'},
				{kind: 'select', sel: '#presenter', index: 1, label: 'pick presenter'},
				{kind: 'type', sel: '#description', text: 'What this episode is about.', label: 'description'},
			]},
		},
		{
			id: 'podcast-manager-create-podcast', path: '/podcast-manager/', query: {page: 'create-podcast'},
			interact: {steps: [
				{kind: 'type', sel: '#title', text: 'Graduate Stories', label: 'title'},
				{kind: 'select', sel: '#school', index: 3, label: 'pick school'},
				{kind: 'type', sel: '#description', text: 'Short stories from recent graduates.', label: 'description'},
			]},
		},
		{
			id: 'podcast-manager-edit-podcast', path: '/podcast-manager/', query: {page: 'edit-podcast', podcastID: POD(2)},
			interact: {steps: [
				{kind: 'type', sel: '#title', text: 'Business in Practice (2026)', label: 'title'},
				{kind: 'select', sel: '#school', index: 2, label: 'pick school'},
			]},
		},
	],
	init(s) {
		s.podcasts = P.podcasts()
		s.episodes = P.episodes()
		s.tick = 0
	},
	routes(r) {
		const pod = (ctx, id) => ctx.state.podcasts.find(p => p._id === id)
		const ownerName = (ctx, p) => (p.owner === 'u1234567' ? ctx.session.user.fullName : p.owner)

		// ---- podcasts
		// toolbox-podcast-player's episodeID mode asks for these; held back a little when it does, see the load-order race note on /fetch in that fixture
		const slowForPlayer = ctx => String(ctx.req.headers.referer || '').indexOf('/podcast-player/') > -1 ? new Promise(resolve => setTimeout(resolve, 450)) : null

		r.get('api/podcasts/get', async ctx => {
			await slowForPlayer(ctx)
			let id = ctx.query.podcastID || ''
			if (!/^[0-9a-f]{24}$/.test(id)) {
				return ctx.status(412)
			}
			return pod(ctx, id) || null
		})
		r.get('api/podcasts/get-all', ctx => {
			if (!ctx.query.sessionID && !ctx.global.session) {
				return ctx.status(412)
			}
			// the real handler filters {coursecode: ..., owner: req.query.username} (note the lowercase field) for non-admins
			let admin = isInstructor(ctx)
			let rows = ctx.state.podcasts.filter(p => admin || p.owner === ctx.query.username)
			return rows.slice().sort((a, b) => a.title > b.title ? 1 : -1)
		})
		r.get('api/podcasts/get-all-admin', ctx => {
			if (!isInstructor(ctx)) {
				return ctx.text('ERROR = "Not authorized to access this content"', 403)
			}
			return ctx.text(`m.podcasts = ${JSON.stringify(ctx.state.podcasts)}; m.$applyAsync()`)
		})
		r.get('api/podcasts/rss', ctx => {
			let p = pod(ctx, ctx.query.podcastID)
			if (!p) {
				return ctx.status(404)
			}
			let eps = ctx.state.episodes.filter(e => e.podcastID === p._id)
			ctx.text(P.rssXml(p, eps, hostOf(ctx), ownerName(ctx, p)), 200, 'application/rss+xml')
		})
		r.post('api/podcasts/new', ctx => {
			let b = ctx.body
			if (b.title && b.school && b.owner) {
				let p = {_id: oid('podcast-new', ++ctx.state.tick), title: b.title, description: b.description, owner: b.owner, cover: `cover-new-${ctx.state.tick}.jpg`, courseCode: b.courseCode}
				ctx.state.podcasts.push(p)
				return ctx.redirect(`../../?page=podcast&podcastID=${p._id}`)
			}
			return ctx.redirect(`../../?page=create-podcast&error=${encodeURIComponent('Missing a required field, or invalid cover image (only png/jpeg/jpg accepted)')}`)
		})
		r.post('api/podcasts/edit', ctx => {
			let id = String(ctx.body.podcastID || '').replace('string:', '')
			let p = pod(ctx, id)
			if (ctx.body.title && ctx.body.school && p && isInstructor(ctx)) {
				Object.assign(p, ctx.body, {_id: p._id})
				delete p.sessionID
				delete p.podcastID
				return ctx.redirect(`../../?page=podcast&podcastID=${id}`)
			}
			return ctx.redirect(`../../?page=podcast&podcastID=${id}&error=${encodeURIComponent('Missing required fields')}`)
		})
		r.get('api/podcasts/delete', ctx => {
			let id = ctx.query.podcastID || ''
			if (id && pod(ctx, id) && isInstructor(ctx)) {
				ctx.state.podcasts = ctx.state.podcasts.filter(p => p._id !== id)
				ctx.state.episodes = ctx.state.episodes.filter(e => e.podcastID !== id)
				return ctx.redirect('../../?page=dashboard')
			}
			return ctx.redirect(id ? `../../?page=podcast&podcastID=${id}&error=${encodeURIComponent('Required fields missing')}` : '../../?page=dashboard')
		})

		// ---- episodes
		r.get('api/episodes/get', async ctx => {
			await slowForPlayer(ctx)
			let id = String(ctx.query.episodeID || '').replace('string:', '')
			if (!/^[0-9a-f]{24}$/.test(id)) {
				return ctx.status(412)
			}
			return ctx.state.episodes.find(e => e._id === id) || null
		})
		r.get('api/episodes/get-all', ctx => {
			if (!ctx.query.sessionID || !/^[0-9a-f]{24}$/.test(ctx.query.podcastID || '')) {
				return ctx.status(412)
			}
			return ctx.state.episodes.filter(e => e.podcastID === ctx.query.podcastID)
		})
		r.post('api/episodes/new', ctx => {
			let b = ctx.body
			let podcastID = String(b.podcastID || '').replace('string:', '')
			if (b.title && pod(ctx, podcastID)) {
				let t = NOW + ++ctx.state.tick * 60000
				let e = {_id: oid('episode-new', ctx.state.tick), title: b.title, description: b.description, podcastID, cover: null, transcript: b.transcript, timestamp: t, mp3: `episode-new-${ctx.state.tick}.mp3`, presenter: b.presenter, published: t, duration: 420, fileSize: 6800000}
				ctx.state.episodes.push(e)
				return ctx.redirect(`../../?page=episode&episodeID=${e._id}`)
			}
			return ctx.redirect(`../../?page=upload-episode&podcastID=${podcastID}&error=${encodeURIComponent('Missing required fields')}`)
		})
		r.post('api/episodes/edit', ctx => {
			let b = ctx.body
			let id = String(b.episodeID || '').replace('string:', ''), podcastID = String(b.podcastID || '').replace('string:', '')
			let e = ctx.state.episodes.find(x => x._id === id)
			if (b.title && b.description && e && podcastID) {
				Object.assign(e, {title: b.title, description: b.description, podcastID, transcript: b.transcript, presenter: b.presenter, modified: NOW + ++ctx.state.tick * 60000})
				return ctx.redirect(`../../?page=episode&podcastID=${podcastID}&episodeID=${id}`)
			}
			return ctx.json({error: 'Missing a required field, or invalid audio file (only MP3s are supported)'}, 412)
		})
		r.get('api/episodes/delete', ctx => {
			let id = String(ctx.query.episodeID || '').replace('string:', ''), podcastID = String(ctx.query.podcastID || '').replace('string:', '')
			if (id && podcastID && isInstructor(ctx)) {
				ctx.state.episodes = ctx.state.episodes.filter(e => e._id !== id)
				return ctx.redirect(`../../?page=podcast&podcastID=${podcastID}`)
			}
			return ctx.redirect(`../../?page=episode&episodeID=${id}&error=${encodeURIComponent('Not authorized to edit this episode')}`)
		})

		// ---- data lists for the edit forms
		r.get('api/data/get-presenters', ctx => {
			let names = new Set(['Test Staff', 'Dr Helen Fraser', 'Prof. Mark Ellis', 'Dr Anika Rao', 'Dr Priya Nair', 'Dr Tom Hendry', 'Jamie Collins'])
			ctx.state.episodes.forEach(e => e.presenter && names.add(e.presenter))
			return [...names].sort()
		})
		r.get('api/data/get-courses', ctx => {
			let codes = new Set(P.COURSES)
			ctx.state.podcasts.forEach(p => p.courseCode && codes.add(p.courseCode))
			return [...codes].sort()
		})
		r.get('api/data/get-schools', ctx => P.SCHOOLS_RAW.slice().sort())

		// the episode page has <iframe src="{{episode.previewPlayerUrl}}"> (src, not ng-src), so the browser first requests the literal template text
		// Held open for a few seconds so it is always the request the browser abandons (angular swaps the real src in within ~100ms); answered
		// instantly it would race that swap and show up as an aborted request in some runs and not others.
		r.get(/^\{\{episode\.previewPlayerUrl\}\}$/, async ctx => {
			await new Promise(resolve => setTimeout(resolve, 3000))
			try {
				ctx.html('<!doctype html><title></title>')
			}
			catch (e) {
			}
		})

		// ---- /storage files (served by the shared storage proxy in production): covers are images, .mp3 is a silent clip
		r.abs('GET', /^storage\/(?:production|testing|development)\/podcast-manager\/[^/]+$/, ctx => {
			let name = ctx.rel.split('/').pop()
			if (/\.mp3$/i.test(name)) {
				return ctx.redirect(AUDIO)
			}
			return ctx.redirect(img(512, 512, name.replace(/\.\w+$/, '')))
		})
	},
}
