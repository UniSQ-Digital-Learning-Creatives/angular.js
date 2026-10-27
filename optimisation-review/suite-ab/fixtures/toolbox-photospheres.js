'use strict'
// toolbox-photospheres (appName photospheres): viewer (pannellum, fetch-single-data, socket.io stubbed by the harness) + admin
// (fetch-all-sessions/photospheres, collection + session CRUD with the real server's optimistic version checks, uploads, status polling).
// 8 collections (4-12 scenes each), 18 sessions, the first session has 6-9 hotspots per scene. Panos/previews/tiles/objects are generated placeholders.
const {APPS, NOW, DAY, oid, uuid, img} = require('../lib/shared')
const P = require('../lib/data/photospheres')

const SESSION_MAIN = uuid('session', 0)
const SESSION_GUIDED = uuid('session', 1)
const SESSION_ID_DOC = oid('session', 2) // the _id (not sessionID) the admin edit page opens by
const COLLECTION_ID = oid('photosphere', 0)

// pull `filename="..."` names out of a multipart body (the harness only gives raw bytes for files)
function uploadedNames(ctx, field) {
	let text = ctx.raw ? ctx.raw.toString('latin1') : ''
	let out = []
	let re = /Content-Disposition: form-data; name="([^"]*)"; filename="([^"]*)"/g
	let m
	while ((m = re.exec(text))) {
		out.push({field: m[1], name: m[2]})
	}
	return field ? out.filter(x => x.field === field) : out
}

module.exports = {
	name: 'toolbox-photospheres',
	prefixes: ['/photospheres'],
	ownNodeModules: `${APPS}/toolbox-photospheres/node_modules`,
	static: [`${APPS}/toolbox-photospheres/public`],
	pages: [
		{
			id: 'toolbox-photospheres', path: '/photospheres/', query: {sessionID: 'ab-session', serverID: SESSION_MAIN},
			notes: 'viewer: 12-scene... collection 0, session with 6-9 hotspots/scene (scene links, image/text/video/link hotspots); pannellum renders on swiftshader',
			settle: {quietMs: 900, maxMs: 25000},
			interact: {
				steps: [
					{kind: 'click', sel: '.pnlm-hotspot.hotspot-type-info', label: 'open an info hotspot'},
					{kind: 'click', sel: '.custom-hotspot-panel-close', label: 'close the hotspot panel'},
					{kind: 'click', sel: '.pnlm-hotspot.hotspot-type-scene', label: 'follow a scene hotspot'},
					{kind: 'click', sel: '.pnlm-hotspot.hotspot-type-info', label: 'open an info hotspot in the next scene'},
					{kind: 'click', sel: '.custom-hotspot-panel-close', label: 'close the panel again'},
					{kind: 'click', sel: '.pnlm-zoom-in', label: 'zoom in'},
					{kind: 'click', sel: '.pnlm-zoom-out', label: 'zoom out'},
					{kind: 'click', sel: '.pnlm-hotspot.hotspot-type-scene', label: 'follow another scene hotspot'},
				],
				generic: false,
			},
		},
		{
			id: 'toolbox-photospheres-guided', path: '/photospheres/', query: {sessionID: 'ab-session', serverID: SESSION_GUIDED},
			notes: 'guidable session (guided mode, no host => client-only)', settle: {quietMs: 900, maxMs: 25000},
		},
		{
			id: 'toolbox-photospheres-debug', path: '/photospheres/', query: {sessionID: 'ab-session', serverID: SESSION_MAIN, debug: 'true'},
			notes: 'debug=true editor (dropzone + toastr from /node_modules, edit panel, hotspot editing form)', settle: {quietMs: 900, maxMs: 25000},
		},
		{
			id: 'toolbox-photospheres-admin', path: '/photospheres/admin/', query: {},
			notes: 'admin gallery, sessions tab (18 sessions) with the filter box',
			interact: {
				steps: [
					{kind: 'type', sel: '.filter-input', text: 'Simulation', label: 'filter the gallery'},
					{kind: 'click', sel: '.clear-icon', label: 'clear filter'},
					{kind: 'type', sel: '.filter-input', text: 'zzz', label: 'filter to nothing'},
				],
				generic: false,
			},
		},
		{id: 'toolbox-photospheres-admin-collections', path: '/photospheres/admin/', query: {galleryTab: 'photospheres'}, notes: 'admin gallery, collections tab'},
		{
			id: 'toolbox-photospheres-admin-session', path: '/photospheres/admin/', query: {page: 'edit-session', galleryTab: 'sessions', sessionID: SESSION_ID_DOC},
			notes: 'edit-session form (collection/start scene selects, status, visible titles)',
			interact: {
				steps: [
					{kind: 'type', sel: 'input.darker-text', text: ' (edited)', label: 'retitle session'},
					{kind: 'select', sel: 'select.details-item-wrapper-dropdown', index: 1, label: 'change status'},
				],
				generic: false,
			},
		},
		{
			id: 'toolbox-photospheres-admin-collection', path: '/photospheres/admin/', query: {page: 'edit-photosphere-collection', galleryTab: 'photospheres', photosphereID: COLLECTION_ID},
			notes: 'edit-photosphere-collection: scene grid, dropzone',
		},
	],
	init(s) {
		s.collections = P.buildCollections()
		s.sessions = P.buildSessions(s.collections)
		s.byId = c => s.collections.find(x => String(x._id) === String(c))
	},
	routes(r) {
		// ---- generated media. Panoramas (full image, preview, any cube tile) are equirect placeholders; objects/* are photos
		r.get('multires/*', ctx => {
			let parts = ctx.rel.split('/').slice(1)
			let name = parts[parts.length - 1]
			let scene = parts.length >= 3 ? parts[2] : parts[1] || 'pano'
			let preview = /-preview\./.test(name)
			ctx.text(P.panoSvg(scene.slice(0, 8), preview ? 400 : 2048, preview ? 200 : 1024), 200, 'image/svg+xml')
		})
		r.get('objects/*', ctx => {
			let name = ctx.rel.split('/').pop()
			if (/\.svg$/.test(name)) {
				return ctx.text('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="28" fill="#e8a33d" stroke="#fff" stroke-width="4"/></svg>', 200, 'image/svg+xml')
			}
			ctx.redirect(img(1000, 700, name.slice(0, 12)))
		})

		// ---- viewer
		r.get('fetch-single-data', ctx => {
			let id = ctx.query.serverID
			if (!id) {
				return ctx.status(412)
			}
			let session = ctx.state.sessions.find(x => x.sessionID === id)
			let col = session && ctx.state.byId(session.panoramaID)
			if (!col) {
				return ctx.status(404)
			}
			return {
				state: {host: false, pitch: col.data[0].pitch, yaw: col.data[0].yaw, zoom: 100, polaroidZoomed: false, panorama: 0, mouse: {x: 0, y: 0}, hotspot: false, clients: []},
				clients: [], photosphere: col, panoramas: col.data, sessionData: session,
			}
		})

		// ---- admin: lists
		r.get('admin/fetch-all-sessions', ctx => {
			let lite = ctx.query.lite === 'true'
			return ctx.state.sessions.map(s => {
				if (!lite) {
					return s
				}
				let c = Object.assign({}, s)
				delete c.data
				delete c.guidable
				delete c.startPhotosphere
				return c
			})
		})
		r.get('admin/fetch-all-photospheres', ctx => {
			let lite = ctx.query.lite === 'true'
			let omit = ['data', 'template', 'objectFolder', 'preview', 'easterEggTriggerScene', 'easterEggTrigger']
			return ctx.state.collections.map(c => lite ? Object.fromEntries(Object.entries(c).filter(([k]) => omit.indexOf(k) < 0)) : c)
		})

		// ---- admin: collections
		r.get('admin/new-photosphere-collection', ctx => {
			if (!ctx.query.title) {
				return ctx.status(412)
			}
			let doc = {_id: ctx.query._id || oid('photosphere', ctx.state.collections.length + 100), title: ctx.query.title, data: [], template: ctx.query.template || 'tour',
				objectFolder: uuid('objects', ctx.state.collections.length + 100), version: 1, updatedAt: new Date(NOW).toISOString()}
			ctx.state.collections.push(doc)
			return doc
		})
		let conditional = (ctx, list, id, payload) => {
			let doc = list.find(x => String(x._id) === String(id))
			if (!doc) {
				return ctx.status(404)
			}
			let cv = typeof payload.version === 'number' ? payload.version : undefined
			if (cv !== undefined && cv !== doc.version) {
				return ctx.json(doc, 409)
			}
			let version = doc.version + 1
			Object.keys(payload).forEach(k => {
				if (['_id', 'newCollection', 'version', 'updatedAt'].indexOf(k) < 0) {
					doc[k] = payload[k]
				}
			})
			doc.version = version
			doc.updatedAt = new Date(NOW).toISOString()
			return {_id: doc._id, version}
		}
		r.post('admin/update-photosphere-collection', ctx => ctx.body && ctx.body.title && ctx.body._id ? conditional(ctx, ctx.state.collections, ctx.body._id, ctx.body) : ctx.status(412))
		r.post('admin/delete-photosphere-collection', ctx => {
			let id = ctx.body._id
			let before = ctx.state.collections.length
			ctx.state.collections = ctx.state.collections.filter(x => String(x._id) !== String(id))
			return {acknowledged: true, deletedCount: before - ctx.state.collections.length}
		})
		r.post('admin/delete-photosphere-image', ctx => {
			let b = ctx.body
			if (!b || !b.parentID || !b.id) {
				return ctx.status(412)
			}
			let c = ctx.state.byId(b.parentID)
			if (c) {
				c.data = c.data.filter(x => x.id !== b.id)
				c.version++
			}
			return ctx.status(200)
		})
		r.post('admin/update-photosphere-scene-field', ctx => {
			let {_id, sceneId, field, value, version} = ctx.body
			if (!_id || !sceneId || ['pitch', 'yaw', 'hfov', 'horizonPitch', 'horizonRoll', 'centerPitch', 'centerYaw', 'title'].indexOf(field) < 0) {
				return ctx.status(412)
			}
			let c = ctx.state.byId(_id)
			if (!c) {
				return ctx.status(404)
			}
			if (typeof version === 'number' && version !== c.version) {
				return ctx.json(c, 409)
			}
			let scene = c.data.find(x => x.id === sceneId)
			if (!scene) {
				return ctx.json(c, 409)
			}
			scene[field] = value
			c.version = (typeof version === 'number' ? version : c.version) + 1
			return {version: c.version}
		})

		// ---- admin: sessions
		r.post('admin/new-session', ctx => {
			let b = ctx.body
			if (!b || !b.title || !b.panoramaID) {
				return ctx.status(412)
			}
			let s = {title: b.title, sessionID: b.sessionID || uuid('session', ctx.state.sessions.length + 100), startPhotosphere: parseInt(b.startPhotosphere) || 0, data: b.data || [],
				panoramaID: b.panoramaID, guidable: !!b.guidable, preview: !!b.preview, version: 1, updatedAt: new Date(NOW).toISOString(), _id: oid('session', ctx.state.sessions.length + 100)}
			ctx.state.sessions.push(s)
			return s
		})
		r.post('admin/save-session', ctx => {
			let b = ctx.body
			if (!b || !b.title || !b.panoramaID || !b._id) {
				return ctx.status(412)
			}
			b = Object.assign({}, b, {startPhotosphere: parseInt(b.startPhotosphere || 0)})
			return conditional(ctx, ctx.state.sessions, b._id, b)
		})
		r.post('admin/session-hotspot', ctx => {
			let {_id, sceneIndex, hotspotId, hotspot, action, version} = ctx.body
			if (!_id || sceneIndex === undefined || sceneIndex === null || !hotspotId || (action !== 'delete' && !hotspot)) {
				return ctx.status(412)
			}
			let s = ctx.state.sessions.find(x => String(x._id) === String(_id))
			if (!s) {
				return ctx.status(404)
			}
			if (typeof version === 'number' && version !== s.version) {
				return ctx.json(s, 409)
			}
			s.data[sceneIndex] = s.data[sceneIndex] || {}
			if (action === 'delete') {
				delete s.data[sceneIndex][hotspotId]
			}
			else {
				s.data[sceneIndex][hotspotId] = hotspot
			}
			s.version = (typeof version === 'number' ? version : s.version) + 1
			return {version: s.version}
		})

		// ---- uploads (multipart; names pulled from the raw body)
		r.post('object-upload', ctx => {
			if (!ctx.query.objectFolder || ['..', '.', '/'].indexOf(ctx.query.objectFolder) >= 0) {
				return ctx.status(412)
			}
			return uploadedNames(ctx).map((f, i) => `${uuid('upload', i)}.${f.name.split('.').pop()}`)
		})
		r.post('hotspot-icon-upload', ctx => {
			if (!ctx.query.objectFolder || ['..', '.', '/'].indexOf(ctx.query.objectFolder) >= 0) {
				return ctx.status(412)
			}
			let files = uploadedNames(ctx).filter(f => ['jpg', 'jpeg', 'png', 'svg'].indexOf(f.name.split('.').pop().toLowerCase()) >= 0)
			return files.length ? files.map((f, i) => `${uuid('icon', i)}.${f.name.split('.').pop().toLowerCase()}`) : ctx.status(415)
		})
		r.post('admin/upload-photospheres', ctx => {
			let c = ctx.state.byId(ctx.body.photosphere)
			let names = uploadedNames(ctx, 'file').concat(uploadedNames(ctx).filter(x => x.field !== 'file'))
			let returnIDs = names.map((f, i) => {
				let id = uuid('up', (c ? c.data.length : 0) + i)
				return {id, parentID: ctx.body.photosphere, title: id, realTitle: f.name, filename: f.name, processing: true, uuid: id}
			})
			if (c) {
				// the server processes the queue in the background; the status poll below hands back the finished scene
				returnIDs.forEach(e => c.data.push(P.buildScene(99, c.data.length, c._id, e.realTitle.replace(/\.[a-z]+$/i, ''))))
				returnIDs.forEach((e, i) => {
					let scene = c.data[c.data.length - returnIDs.length + i]
					scene.id = scene.uuid = e.id
					scene.title = e.id
					scene.panorama = `multires/${c._id}/${e.id}/${e.id}.jpg`
					scene.multiRes = {fallbackPath: scene.panorama, preview: `multires/${c._id}/${e.id}/${e.id}-preview.jpg`}
				})
				c.version++
			}
			return {returnIDs, photosphere: c}
		})
		r.get('admin/check-photosphere-status', ctx => {
			if (!ctx.query.id || !ctx.query.entryID) {
				return ctx.status(412)
			}
			let c = ctx.state.byId(ctx.query.id)
			if (!c) {
				return ctx.status(404)
			}
			let ids = ctx.query.entryID.split(',')
			let found = c.data.filter(x => ids.indexOf(x.uuid) >= 0)
			return ids.length === 1 ? (found[0] || []) : found
		})
		r.post('update-photosphere', ctx => {
			let d = ctx.body
			if (!d || !d._id) {
				return ctx.status(412)
			}
			return conditional(ctx, ctx.state.collections, d._id, d)
		})
	},
}
