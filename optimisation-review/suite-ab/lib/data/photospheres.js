'use strict'
// Deterministic photosphere collections + sessions in the exact shape the toolbox-photospheres mongo docs have (see index.js: photospheres /
// sessions collections, scene objects as written by processPhotospheresQueue, hotspots as written by the viewer's metaHotspot()).
const {NOW, DAY, oid, uuid, lorem} = require('../shared')

const PLACES = [
	['Anatomy Lab', ['Skeleton', 'Cadaver table', 'Microscope bench', 'Prep room door', 'Specimen shelf', 'Whiteboard']],
	['Simulation Ward', ['Patient bed', 'Monitor', 'Crash cart', 'Hand wash', 'Nurses station', 'Supply cupboard']],
	['Engineering Workshop', ['Lathe', 'Welding bay', 'Tool wall', 'Safety signage', '3D printers', 'Assembly table']],
	['Library Level 2', ['Study pods', 'Reading list shelf', 'Help desk', 'Quiet zone sign', 'Computers', 'Window seats']],
	['Field Site: Creek Bank', ['Soil pit', 'Water gauge', 'Quadrat plot', 'Weather station', 'Sample bags', 'Track marker']],
	['Paramedic Ambulance', ['Stretcher', 'Drug cabinet', 'Defibrillator', 'Oxygen supply', 'Driver cabin', 'Rear doors']],
	['Campus Walkthrough', ['Main entry', 'Courtyard', 'Cafe', 'Lecture theatre A', 'Student hub', 'Bike racks']],
	['Music Rehearsal Room', ['Piano', 'Drum kit', 'Mixing desk', 'Acoustic panels', 'Music stands', 'Practice booth']],
]

const SUBTYPES = ['info', 'text', 'video', 'link']

// scene = one pano. folder = collection id, id = the scene's uuid
function buildScene(ci, si, folder, title) {
	let id = uuid(`scene-${ci}`, si)
	return {
		id,
		title: id,
		realTitle: title,
		filename: `${title.replace(/\s+/g, '_')}.jpg`,
		uuid: id,
		author: '',
		type: 'equirectangular',
		panorama: `multires/${folder}/${id}/${id}.jpg`,
		pitch: (si * 3) % 20 - 10,
		yaw: (si * 47) % 180 - 90,
		hfov: 100,
		horizonPitch: 0,
		horizonRoll: 0,
		multiRes: {fallbackPath: `multires/${folder}/${id}/${id}.jpg`, preview: `multires/${folder}/${id}/${id}-preview.jpg`},
		hotSpots: [],
		customHotSpots: [],
		hotSpotDebug: true,
		processing: false,
		parentID: folder,
	}
}

function buildCollections() {
	return PLACES.map(([name, spots], ci) => {
		let _id = oid('photosphere', ci)
		let sceneCount = 4 + ((ci * 5) % 9)
		return {
			_id,
			title: `${name} 360`,
			data: Array.from({length: sceneCount}, (_, si) => buildScene(ci, si, _id, `${spots[si % spots.length]}${si >= spots.length ? ' ' + (1 + (si / spots.length | 0)) : ''}`)),
			template: ci % 3 === 0 ? 'hotspot-panels' : 'tour',
			objectFolder: uuid('objects', ci),
			version: 3 + ci,
			updatedAt: new Date(NOW - (ci + 1) * 9 * DAY).toISOString(),
		}
	})
}

// A hotspot as the viewer stores it
function hotspot(id, p) {
	return Object.assign({id, pitch: 0, yaw: 0, title: '', text: '', image: '', images: [], imageTitles: [], icon: '', subtype: '', link: '', type: 'info', added: false, hidden: false}, p)
}

function buildSessions(collections) {
	return collections.flatMap((col, ci) => {
		let count = ci === 0 ? 4 : 2
		return Array.from({length: count}, (_, k) => {
			let n = ci * 10 + k
			let sessionID = uuid('session', n)
			// session.data[sceneIndex] = {hotspotId: hotspot}; 6-9 hotspots per scene for the first session (the busy one), 2-5 elsewhere
			let busy = ci === 0 && k === 0
			let data = col.data.map((scene, si) => {
				let map = {}
				let nh = busy ? 6 + ((si * 3) % 4) : 2 + ((si + k) % 4)
				for (let h = 0; h < nh; h++) {
					let id = 1700000000000 + n * 100000 + si * 100 + h
					let pitch = ((h * 37 + si * 11) % 60) - 30
					let yaw = ((h * 83 + si * 29) % 340) - 170
					if (h === 0 && col.data.length > 1) {
						let target = col.data[(si + 1) % col.data.length]
						map[id] = hotspot(id, {pitch, yaw, type: 'scene', title: target.id, realTitle: target.realTitle, subtype: ''})
						continue
					}
					let sub = SUBTYPES[(h + si) % SUBTYPES.length]
					let title = `${scene.realTitle}: point ${h}`
					let img = `objects/${col.objectFolder}/${uuid('obj', n * 1000 + si * 10 + h)}.jpg`
					let base = {pitch, yaw, title, subtype: sub, type: 'info', text: `# ${title}\n\n${lorem(n + si + h, 14)}\n\n- ${lorem(h + 1, 5)}\n- ${lorem(h + 2, 5)}`}
					if (sub === 'info') {
						Object.assign(base, {image: img, images: [img, img.replace('.jpg', '-b.jpg')], imageTitles: ['Overview', 'Detail']})
					}
					else if (sub === 'video') {
						base.link = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
					}
					else if (sub === 'link') {
						base.link = 'https://example.edu/resources/' + (h + 1)
					}
					if (h % 5 === 4) {
						base.icon = `objects/${col.objectFolder}/icon-${h}.svg`
					}
					map[id] = hotspot(id, base)
				}
				return map
			})
			return {
				_id: oid('session', n),
				title: `${col.title} - ${['Tutorial', 'Revision', 'Assessment tour', 'Staff preview'][k % 4]}`,
				sessionID,
				startPhotosphere: 0,
				data,
				panoramaID: col._id,
				guidable: k === 1 && ci === 0,
				preview: false,
				status: k % 3 === 0 ? 'public' : 'unlisted',
				visibleTitles: k % 2 === 0 ? 'Yes' : 'No',
				version: 2,
				updatedAt: new Date(NOW - (n + 2) * 3 * DAY).toISOString(),
			}
		})
	})
}

// Equirectangular placeholder (2:1) with a labelled grid + horizon so pannellum shows something with structure
function panoSvg(label, w = 2048, h = 1024) {
	let hue = [...label].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 11)
	let lines = ''
	for (let x = 0; x <= w; x += w / 16) {
		lines += `<line x1="${x}" y1="0" x2="${x}" y2="${h}" stroke="#fff" stroke-opacity=".35" stroke-width="2"/>`
	}
	for (let y = 0; y <= h; y += h / 8) {
		lines += `<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="#fff" stroke-opacity=".35" stroke-width="2"/>`
	}
	let marks = ''
	for (let i = 0; i < 8; i++) {
		marks += `<text x="${(i + 0.5) * w / 8}" y="${h / 2 - 20}" font-family="sans-serif" font-size="64" fill="#fff" text-anchor="middle">${label.replace(/[<&]/g, '').slice(0, 14)} ${i * 45}</text>`
	}
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue},60%,75%)"/><stop offset=".5" stop-color="hsl(${(hue + 40) % 360},50%,60%)"/><stop offset="1" stop-color="hsl(${(hue + 80) % 360},40%,30%)"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/>${lines}${marks}</svg>`
}

module.exports = {buildCollections, buildSessions, panoSvg, buildScene}
