'use strict'
// toolbox-3d-model-viewer (appName 3d-model-viewer): <model-viewer> web component (WebGL on swiftshader), annotations (label/icon/image/link),
// editing mode (select2 + dropzone + toastr from /node_modules, icons from /studydesk-toolbox). Models live behind /storage/<env>/3d-model-viewer/...
// in production (HAProxy -> storage), so an abs stub serves a generated GLB cube there; item/thumbnail images come from img().
const {APPS, NOW, oid, img} = require('../lib/shared')
const M = require('../lib/data/model-viewer')

const MODEL_ID = oid('model', 0)
// model-viewer's idle "interaction prompt" animates the camera (and so every annotation position, the SVG leader lines and the prompt hand) with
// wall-clock time, so those numbers differ run to run: blank the sub-pixel values, keep everything structural
const SCRUB = [
	['translate\\(-?[\\d.]+px, -?[\\d.]+px\\)', 'translate(<x>, <y>)'],
	['translateX\\(-?[\\d.]+px\\)', 'translateX(<n>)'],
	['\\b(x1|x2|y1|y2)="[^"]*"', '$1="<n>"'],
	['class="line line-show"', 'class="line"'],
	['style="height: \\d+px; width: \\d+px"', 'style="height: <h>px; width: <w>px"'],
	['data-engine="[^"]*"', 'data-engine="<v>"'],
	// annotations are depth-sorted into z-index by camera distance: two near-equal ones swap while the prompt animation runs
	['z-index: \\d+(?=[";])', 'z-index: <n>'],
	['"tippy-\\d+"', '"tippy-<n>"'],
	// select2 (editing mode) builds element ids from Math.random(); the draw order shifts with whatever else asked for a random number first
	['select2-data-(\\d+)-[a-z0-9]{4}', 'select2-data-$1-<r>'],
	['select2-[a-z0-9]{4}-(container|results|result)', 'select2-<r>-$1'],
]
const GLB = M.buildGlb()

module.exports = {
	name: 'toolbox-3d-model-viewer',
	prefixes: ['/3d-model-viewer'],
	ownNodeModules: `${APPS}/toolbox-3d-model-viewer/node_modules`,
	static: [`${APPS}/toolbox-3d-model-viewer/public`],
	pages: [
		{
			id: 'toolbox-3d-model-viewer', path: '/3d-model-viewer/', query: {modelID: MODEL_ID}, scrub: SCRUB, dropAttrs: ['x1', 'x2', 'y1', 'y2'],
			notes: 'viewer for model 0 (10 annotations of every type, items); model-viewer loads the generated cube GLB; WebGL via swiftshader',
			settle: {quietMs: 3000, maxMs: 30000},
			interact: {
				steps: [
					{kind: 'click', sel: '.annotation.button-type-icon', label: 'click an icon annotation (spotlight gallery for its items)'},
					{kind: 'click', sel: '.spl-close', label: 'close the spotlight'},
					{kind: 'click', sel: '.annotation.button-type-image', label: 'click an image annotation'},
					{kind: 'click', sel: '.spl-close', label: 'close the spotlight again'},
					{kind: 'click', sel: '.annotation.button-type-label', label: 'click a label annotation (no items)'},
					{kind: 'click', sel: '.model-edit-settings-button', label: 'model settings popover'},
				],
				generic: false,
			},
		},
		{
			id: 'toolbox-3d-model-viewer-editing', path: '/3d-model-viewer/', query: {modelID: MODEL_ID, editing: 'true'}, scrub: SCRUB, dropAttrs: ['x1', 'x2', 'y1', 'y2'],
			notes: 'editing mode: annotation edit modal, select2 icon picker, dropzone for item images',
			settle: {quietMs: 3000, maxMs: 30000},
			interact: {
				steps: [
					{kind: 'click', sel: '.annotation.button-type-icon', label: 'edit an annotation (modal)'},
				],
				generic: false,
			},
		},
		{
			id: 'toolbox-3d-model-viewer-all', path: '/3d-model-viewer/', query: {modelID: 'all', editing: 'true'},
			notes: 'all-models grid (12 models) with the filter box',
			interact: {
				steps: [
					{kind: 'type', sel: '.all-models-wrapper-header input', text: 'heart', label: 'filter models'},
					{kind: 'type', sel: '.all-models-wrapper-header input', text: '', label: 'clear filter'},
					{kind: 'click', sel: '.all-models-model:nth-child(2)', label: 'open the model popover'},
				],
				generic: false,
			},
		},
		{id: 'toolbox-3d-model-viewer-new', path: '/3d-model-viewer/', query: {modelID: 'new', editing: 'true'}, notes: 'upload page (dropzone)'},
	],
	init(s) {
		let d = M.buildAll()
		s.models = d.models
		s.annotations = d.annotations
		s.items = d.items
	},
	routes(r) {
		let live = (list, q) => list.filter(x => !x.deleted)
		r.get('fetch-model-data', ctx => {
			let id = ctx.query.modelID
			if (!id || !/^[0-9a-f]{24}$/i.test(id)) {
				return ctx.status(412)
			}
			let s = ctx.state
			let model = live(s.models).find(x => x._id === id)
			if (!model) {
				return ctx.status(404)
			}
			return {model, annotations: live(s.annotations).filter(a => a.modelID === id), items: live(s.items).filter(a => a.modelID === id)}
		})
		r.get('fetch-all-models', ctx => live(ctx.state.models).filter(m => ctx.query.lite !== 'true' || m.status === 'public'))
		r.post('save-annotation', ctx => {
			let d = Object.assign({}, ctx.body)
			if (!d.modelID || !/^[0-9a-f]{24}$/i.test(d.modelID)) {
				return ctx.status(412)
			}
			let isNew = d._new === 'true' || d._new === true
			delete d._new
			delete d._alignment
			delete d._noteImage
			d.title = d.title || ''
			d.description = d.description || ''
			let s = ctx.state
			if (isNew) {
				d._id = d._id || oid('annotation', s.annotations.length + 5000)
				s.annotations.push(d)
			}
			else {
				let a = s.annotations.find(x => x._id === d._id)
				if (a) {
					Object.assign(a, d)
				}
			}
			return d
		})
		r.get('delete-annotation', ctx => {
			let a = ctx.state.annotations.find(x => x._id === ctx.query.annotationID)
			if (!ctx.query.annotationID || !/^[0-9a-f]{24}$/i.test(ctx.query.annotationID)) {
				return ctx.status(412)
			}
			if (a) {
				a.deleted = true
			}
			return ctx.status(200)
		})
		r.post('upload-model', ctx => {
			let name = /filename="([^"]*)"/.exec(ctx.raw ? ctx.raw.toString('latin1') : '')
			if (!name || !/\.glb$/.test(name[1])) {
				return ctx.status(412)
			}
			let s = ctx.state
			let id = oid('model', s.models.length + 500)
			s.models.push({_id: id, title: name[1], status: 'unlisted', background: 'light-grey', timestamp: NOW, file: `${id}.glb`, description: '', colour: '#ffffff', shadowIntensity: 1.5, poster: '', toneMapping: 'agx', environmentImage: 'legacy'})
			return id
		})
		r.post('upload-images', ctx => {
			let q = ctx.query
			if (!q.modelID || !q.annotationID) {
				return ctx.status(412)
			}
			let names = []
			let re = /filename="([^"]*)"/g
			let m
			let text = ctx.raw ? ctx.raw.toString('latin1') : ''
			while ((m = re.exec(text))) {
				names.push(m[1])
			}
			let s = ctx.state
			let images = names.map((n, i) => {
				let id = oid('item', s.items.length + 9000 + i)
				let it = {_id: id, modelID: q.modelID, annotationID: q.annotationID, type: 'image', title: n, timestamp: NOW, file: `${id}.jpg`, description: '', copyright: '', artist: ''}
				s.items.push(it)
				return it
			})
			return {images, failed: []}
		})
		r.post('save-item', ctx => {
			let d = ctx.body
			if (!d.modelID || !d.annotationID || !d._id) {
				return ctx.status(412)
			}
			let it = ctx.state.items.find(x => x._id === d._id)
			if (it) {
				Object.assign(it, d)
			}
			return ctx.status(200)
		})
		r.post('save-model', ctx => {
			let d = Object.assign({}, ctx.body)
			if (!d._id) {
				return ctx.status(412)
			}
			let m = ctx.state.models.find(x => x._id === d._id)
			if (m) {
				Object.assign(m, d)
			}
			return d
		})
		r.post('save-model-thumbnail', ctx => {
			if (!ctx.query.modelID) {
				return ctx.status(412)
			}
			let m = ctx.state.models.find(x => x._id === ctx.query.modelID)
			let t = oid('thumb', ctx.state.models.length + 700)
			if (m) {
				m.thumbnail = `${t}.jpg`
			}
			return {thumbnail: t}
		})
		r.get('delete-item', ctx => {
			let q = ctx.query
			if (!q.modelID || !q.annotationID || !q.itemID) {
				return ctx.status(412)
			}
			let it = ctx.state.items.find(x => x._id === q.itemID)
			if (it) {
				it.deleted = true
			}
			return ctx.status(200)
		})
		r.get('delete-model', ctx => {
			if (!ctx.query.modelID) {
				return ctx.status(412)
			}
			let m = ctx.state.models.find(x => x._id === ctx.query.modelID)
			if (m) {
				m.deleted = true
			}
			return ctx.status(200)
		})

		// /storage/<env>/3d-model-viewer/{models|items}/<file> is served by HAProxy -> the storage service in production
		r.abs('GET', '/storage/*/3d-model-viewer/models/*', ctx => {
			ctx.res.writeHead(200, {'content-type': 'model/gltf-binary', 'content-length': GLB.length, 'cache-control': 'no-store'})
			ctx.res.end(GLB)
		})
		r.abs('GET', '/storage/*/3d-model-viewer/items/*', ctx => {
			let name = ctx.rel.split('/').pop().replace(/\.[a-z]+$/, '')
			ctx.redirect(img(/default|thumb/.test(name) ? 320 : 1200, /default|thumb/.test(name) ? 240 : 800, name.slice(0, 10)))
		})
	},
}
