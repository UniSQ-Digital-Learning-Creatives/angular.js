'use strict'
// 3D model viewer data: a tiny valid GLB (coloured unit cube, 24 verts, 36 indices, one material), plus models/annotations/items docs.
const {NOW, DAY, oid, lorem} = require('../shared')

function buildGlb() {
	// cube side 1 centred on the origin; each face has its own 4 verts so normals are flat
	const faces = [
		{n: [0, 0, 1], v: [[-.5, -.5, .5], [.5, -.5, .5], [.5, .5, .5], [-.5, .5, .5]]},
		{n: [0, 0, -1], v: [[.5, -.5, -.5], [-.5, -.5, -.5], [-.5, .5, -.5], [.5, .5, -.5]]},
		{n: [1, 0, 0], v: [[.5, -.5, .5], [.5, -.5, -.5], [.5, .5, -.5], [.5, .5, .5]]},
		{n: [-1, 0, 0], v: [[-.5, -.5, -.5], [-.5, -.5, .5], [-.5, .5, .5], [-.5, .5, -.5]]},
		{n: [0, 1, 0], v: [[-.5, .5, .5], [.5, .5, .5], [.5, .5, -.5], [-.5, .5, -.5]]},
		{n: [0, -1, 0], v: [[-.5, -.5, -.5], [.5, -.5, -.5], [.5, -.5, .5], [-.5, -.5, .5]]},
	]
	const positions = []
	const normals = []
	const indices = []
	faces.forEach((f, fi) => {
		f.v.forEach(p => {
			positions.push(...p)
			normals.push(...f.n)
		})
		let b = fi * 4
		indices.push(b, b + 1, b + 2, b, b + 2, b + 3)
	})
	const posBuf = Buffer.alloc(positions.length * 4)
	positions.forEach((x, i) => posBuf.writeFloatLE(x, i * 4))
	const nrmBuf = Buffer.alloc(normals.length * 4)
	normals.forEach((x, i) => nrmBuf.writeFloatLE(x, i * 4))
	const idxBuf = Buffer.alloc(indices.length * 2)
	indices.forEach((x, i) => idxBuf.writeUInt16LE(x, i * 2))
	const pad4 = b => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4)])
	const bin = Buffer.concat([pad4(posBuf), pad4(nrmBuf), pad4(idxBuf)])
	const json = {
		asset: {version: '2.0', generator: 'suite-ab fixture'},
		scene: 0,
		scenes: [{nodes: [0]}],
		nodes: [{mesh: 0, name: 'Cube'}],
		meshes: [{primitives: [{attributes: {POSITION: 0, NORMAL: 1}, indices: 2, material: 0}]}],
		materials: [{name: 'Body', pbrMetallicRoughness: {baseColorFactor: [0.8, 0.8, 0.85, 1], metallicFactor: 0.1, roughnessFactor: 0.6}}],
		buffers: [{byteLength: bin.length}],
		bufferViews: [
			{buffer: 0, byteOffset: 0, byteLength: posBuf.length, target: 34962},
			{buffer: 0, byteOffset: pad4(posBuf).length, byteLength: nrmBuf.length, target: 34962},
			{buffer: 0, byteOffset: pad4(posBuf).length + pad4(nrmBuf).length, byteLength: idxBuf.length, target: 34963},
		],
		accessors: [
			{bufferView: 0, componentType: 5126, count: 24, type: 'VEC3', min: [-.5, -.5, -.5], max: [.5, .5, .5]},
			{bufferView: 1, componentType: 5126, count: 24, type: 'VEC3'},
			{bufferView: 2, componentType: 5123, count: 36, type: 'SCALAR'},
		],
	}
	let jsonBuf = Buffer.from(JSON.stringify(json))
	jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc((4 - (jsonBuf.length % 4)) % 4, 0x20)])
	const total = 12 + 8 + jsonBuf.length + 8 + bin.length
	const out = Buffer.alloc(total)
	out.writeUInt32LE(0x46546c67, 0) // 'glTF'
	out.writeUInt32LE(2, 4)
	out.writeUInt32LE(total, 8)
	out.writeUInt32LE(jsonBuf.length, 12)
	out.writeUInt32LE(0x4e4f534a, 16) // JSON
	jsonBuf.copy(out, 20)
	let o = 20 + jsonBuf.length
	out.writeUInt32LE(bin.length, o)
	out.writeUInt32LE(0x004e4942, o + 4) // BIN
	bin.copy(out, o + 8)
	return out
}

const NAMES = ['Human skull', 'Heart (anatomical)', 'Engine block', 'Bridge truss', 'Soil profile', 'Ancient pottery', 'Microscope', 'Satellite model', 'Spinal column', 'Wind turbine', 'Rock core sample', 'Dental model']
const ICONS = ['SDC__Icon_Info.svg', 'SDC__Icon_Info.svg', 'SDC__Icon_Link.svg']

function buildAll() {
	const models = NAMES.map((title, i) => ({
		_id: oid('model', i), title, status: i % 4 === 3 ? 'unlisted' : 'public', background: ['light-grey', 'white', 'middle-grey', 'dark-grey'][i % 4],
		timestamp: NOW - (i + 1) * 11 * DAY, file: `${oid('model', i)}.glb`, description: lorem(i + 3, 16), colour: ['#ffffff', '#e9d8c4', '#c9d6df', '#f0e5cf'][i % 4],
		shadowIntensity: 1.5, poster: '', toneMapping: 'agx', environmentImage: 'legacy', thumbnail: `${oid('thumb', i)}.jpg`,
	}))
	const annotations = []
	const items = []
	// the first model gets a busy set of annotations; every model at least 2
	models.forEach((model, mi) => {
		const n = mi === 0 ? 10 : 2 + (mi % 3)
		for (let k = 0; k < n; k++) {
			const type = ['label', 'icon', 'image', 'link'][(k + mi) % 4]
			const aid = oid('annotation', mi * 100 + k)
			const a = {
				_id: aid, modelID: model._id, title: `${NAMES[mi].split(' ')[0]} feature ${k + 1}`, description: lorem(mi * 10 + k, 18),
				alignment: ['auto', 'left', 'right', 'top'][k % 4], autoAlignment: ['left', 'right', 'top', 'bottom'][k % 4], type, visibility: 'visible',
				position: `${((k * 37) % 100 - 50) / 100}m ${((k * 53) % 100 - 50) / 100}m 0.5m`, normal: '0 0 1', uv: `${(k * 13 % 100) / 100} ${(k * 29 % 100) / 100}`,
			}
			if (type === 'icon') {
				a.icon = ICONS[k % 3]
			}
			if (type === 'link') {
				a.link = `https://example.edu/anatomy/${k}`
			}
			annotations.push(a)
			const ni = type === 'image' ? 2 : k % 2
			for (let j = 0; j < ni; j++) {
				const iid = oid('item', mi * 1000 + k * 10 + j)
				items.push({_id: iid, modelID: model._id, annotationID: aid, type: 'image', title: `${a.title} photo ${j + 1}.jpg`, timestamp: NOW - k * DAY, file: `${iid}.jpg`, description: '', copyright: '', artist: ''})
				if (j === 0 && type === 'image') {
					a.image = iid
				}
			}
		}
	})
	return {models, annotations, items}
}

module.exports = {buildGlb, buildAll}
