'use strict'
// Data builders for fixtures/toolbox-generators.js. Everything is a pure function of its arguments (no clocks, no randomness).
// Shapes mirror what the real editors serialise (see toCompressedData in buttons-and-tiles/cards main.js) and what the real
// server stores in the `buttons-and-tiles` / `cards` collections.
const zlib = require('zlib')
const {NOW, DAY, oid, uuid, lorem} = require('../shared')

// ---- encoding helpers -------------------------------------------------------------------------------------------------
// m.rfc3986EncodeURIComponent: encodeURIComponent(str).replace(/[!'()*]/g, escape)
const rfc = (s) => encodeURIComponent(s == null ? '' : s).replace(/[!'()*]/g, c => escape(c))

// What the toolbox puts in the iframe's name="" attribute: JSON with every " turned into \\' (two backslashes + quote).
// The embed (and the editor) undo it with .replace(/\\/g,'').replace(/'/g,'"') - so no string value may contain a raw ' or "
// (the editors already swap those for %27 / %22 before this point).
const nameOf = (obj) => JSON.stringify(obj).replace(/"/g, "\\\\'")

// Photography-gallery photo ids as saved in a tile/card ("image" is only the last path segment).
const photo = (n) => oid('gphoto', n)

// ---- shared people / course info ----------------------------------------------------------------------------------------
const STAFF = [
	{username: 'u1234567', fullName: 'Test Staff'},
	{username: 'u2345678', fullName: 'Priya Raman'},
	{username: 'u3456789', fullName: 'Tom O\'Brien'},
]
const LINK = (kind, id) => `https://lms.example.edu/mod/${kind}/view.php?id=${id}`

// ---- buttons and tiles ----------------------------------------------------------------------------------------------------
const BT_THEMES = ['standard-text-buttons', 'large-text-buttons', 'tiles-with-image-above-text', 'tiles-with-image-behind-text']
const BT_COLOURS = ['toolbox-gradient-charcoal', 'toolbox-gradient-gold', 'toolbox-gradient-orange', 'toolbox-gradient-green', 'toolbox-gradient-blue', 'toolbox-gradient-purple']

function btObj(i, text, o = {}) {
	let obj = {text: rfc(text), link: o.link === undefined ? LINK('page', 40100 + i * 3) : o.link, image: o.image || '', icon: o.icon || 'toolbox-icon-read', index: i}
	if (o.openInNewTab) {
		obj.openInNewTab = true
	}
	if (o.focusX !== undefined) {
		obj.focusX = o.focusX
		obj.focusY = o.focusY
	}
	return obj
}

// The saved designs the embeds render. Keyed by id (the id the iframe src carries: embed.html?id=<id>).
const BT_DESIGNS = {
	[uuid('bt', 1)]: {
		slug: 'tiles-above', theme: 'tiles-with-image-above-text', icon: 'icon-set', colour: 'toolbox-gradient-blue', layout: 3, alignment: 'left',
		name: 'Topic 1 launch tiles',
		objects: [
			btObj(0, 'Week 1: Getting started', {image: photo(1), icon: 'toolbox-icon-read'}),
			btObj(1, 'Study guide & timetable', {image: photo(2), icon: 'toolbox-icon-calendar', link: LINK('resource', 40115)}),
			btObj(2, 'Assessment 1: Case study', {image: photo(3), icon: 'toolbox-icon-assessment', link: LINK('assign', 40130), openInNewTab: true}),
			btObj(3, 'Discussion forum', {image: photo(4), icon: 'toolbox-icon-discuss', link: LINK('forum', 40141)}),
			btObj(4, 'Library: reading list (Semester 1)', {image: photo(5), icon: 'toolbox-icon-link', link: 'https://library.example.edu/readings/ABC3001', focusX: 30, focusY: 65}),
			btObj(5, 'Ask your tutor - it\'s OK!', {image: photo(6), icon: 'toolbox-icon-question', link: ''}),
		],
	},
	[uuid('bt', 2)]: {
		slug: 'buttons-standard', theme: 'standard-text-buttons', icon: 'chevron', colour: 'toolbox-gradient-charcoal', layout: 2, alignment: 'left',
		name: 'Course links',
		objects: [
			btObj(0, 'Download the course profile', {link: LINK('resource', 40201)}),
			btObj(1, 'Meet your teaching team', {link: LINK('page', 40202)}),
			btObj(2, 'Online study tips', {link: 'https://www.example.edu/study/tips'}),
			btObj(3, 'Technical support & IT help', {link: 'https://support.example.edu/it', openInNewTab: true}),
			btObj(4, 'Accessibility and inclusion services', {link: 'mailto:access@example.edu'}),
		],
	},
	[uuid('bt', 3)]: {
		slug: 'buttons-large', theme: 'large-text-buttons', icon: 'icon-set', colour: 'toolbox-gradient-green', layout: 3, alignment: 'center',
		name: 'Large call to action',
		objects: [
			btObj(0, 'Start the module', {icon: 'toolbox-icon-learning-activity'}),
			btObj(1, 'Listen to the podcast', {icon: 'toolbox-icon-listen', link: LINK('url', 40302)}),
			btObj(2, '   ', {icon: 'toolbox-icon-watch', link: LINK('url', 40303)}),
			btObj(3, 'Quiz time', {icon: 'toolbox-icon-time', link: ''}),
		],
	},
	[uuid('bt', 4)]: {
		slug: 'banners-behind', theme: 'tiles-with-image-behind-text', icon: 'chevron', colour: 'toolbox-gradient-gold', layout: 1, alignment: 'center', addMotion: true, banners: true,
		name: 'Welcome banner',
		objects: [
			btObj(0, 'Welcome to ABC3001', {image: photo(7), link: LINK('page', 40400)}),
			btObj(1, 'Your first week', {image: photo(8), link: LINK('page', 40401)}),
			btObj(2, 'Assessment overview', {image: photo(9), link: LINK('page', 40402)}),
		],
	},
}
const BT_IDS = Object.keys(BT_DESIGNS)

function btDoc(id, ctx = {}) {
	let d = BT_DESIGNS[id]
	let doc = {
		_id: id, courseCode: ctx.courseCode || 'ABC3001', courseLabel: ctx.courseLabel || 'ABC3001_2026_S1', username: ctx.username || 'u1234567', fullName: ctx.fullName || 'Test Staff',
		layout: d.layout, alignment: d.alignment, theme: d.theme, icon: d.icon, colour: d.colour,
		objects: JSON.parse(JSON.stringify(d.objects)),
	}
	if (d.addMotion) {
		doc.addMotion = true
	}
	return doc
}

// Gallery templates (saved + "used in this course" ones). 14 saved templates => 2 pages of 12.
const TEMPLATE_NAMES = ['Weekly topic tiles', 'Module resources', 'Assessment hub', 'Welcome banner', 'Study support buttons', 'Readings & links', 'Orientation tiles', 'Case study launcher',
	'Quick links', 'Tutorial week buttons', 'Lecture recordings', 'Library essentials', 'Exam preparation', 'Final reflection']
const TEXTS = ['Overview', 'Readings', 'Lecture notes', 'Tutorial task', 'Quiz', 'Feedback', 'Reflection', 'Resources', 'Contact us']

function btTemplate(n, ctx = {}) {
	let theme = BT_THEMES[n % 4], icon = [false, 'chevron', 'icon-set'][n % 3], count = 3 + (n % 5)
	let staff = STAFF[n % 3]
	let objects = []
	for (let i = 0; i < count; i++) {
		objects.push(btObj(i, `${TEXTS[(n + i) % TEXTS.length]}${i > 2 ? ' ' + (i + 1) : ''}`, {
			image: theme.indexOf('tiles') === 0 ? photo(10 + ((n * 3 + i) % 12)) : '', icon: ['toolbox-icon-read', 'toolbox-icon-write', 'toolbox-icon-listen', 'toolbox-icon-watch', 'toolbox-icon-link'][(n + i) % 5],
			link: i === 2 ? '' : LINK('page', 41000 + n * 10 + i),
		}))
	}
	return {
		_id: uuid('bt-tpl', n), name: TEMPLATE_NAMES[n % TEMPLATE_NAMES.length], type: 'template',
		courseCode: n % 3 === 0 ? (ctx.courseCode || 'ABC3001') : 'XYZ2002', courseLabel: n % 3 === 0 ? (ctx.courseLabel || 'ABC3001_2026_S1') : 'XYZ2002_2025_S2',
		username: n % 2 === 0 ? (ctx.username || 'u1234567') : staff.username, fullName: n % 2 === 0 ? (ctx.fullName || 'Test Staff') : staff.fullName,
		timestamp: NOW - (n + 1) * 3 * DAY - n * 37 * 60000,
		layout: 1 + (n % 3), alignment: n % 2 ? 'center' : 'left', theme, icon, colour: BT_COLOURS[n % 6], objects,
	}
}

// ---- cards ---------------------------------------------------------------------------------------------------------------
const CARD_THEMES = ['cards-flip', 'cards-link', 'cards-plain']
const CARD_COLOURS = ['charcoal', 'gold', 'orange', 'green', 'blue', 'purple'].map(c => `toolbox-card-colour-${c}`)

function cardObj(i, title, text, o = {}) {
	let obj = {title: rfc(title), text: rfc(text), image: o.image || '', link: o.link === undefined ? LINK('page', 50100 + i * 2) : o.link, linkLabel: rfc(o.linkLabel === undefined ? 'Read more' : o.linkLabel), icon: o.icon || 'toolbox-icon-info', index: i}
	if (o.focusX !== undefined) {
		obj.focusX = o.focusX
		obj.focusY = o.focusY
	}
	return obj
}

const CARD_DESIGNS = {
	[uuid('card', 1)]: {
		slug: 'flip', theme: 'cards-flip', icon: 'icon-set', colour: 'toolbox-card-colour-blue', layout: 3, alignment: 'left', reveal: 'hover', name: 'Study skills flip cards',
		objects: [
			cardObj(0, 'Reading actively', 'Preview headings first, then read with a question in mind.\nPause after each section and summarise it in one sentence.', {image: photo(21), icon: 'toolbox-icon-read', linkLabel: 'Active reading guide'}),
			cardObj(1, 'Peer review', 'Swap drafts with a classmate and give one strength and one suggestion.', {image: photo(22), icon: 'toolbox-icon-discuss', linkLabel: 'Peer review checklist'}),
			cardObj(2, 'Referencing (APA 7)', 'Every idea that is not your own needs a citation: in-text and in the reference list.\nUse the library\'s referencing tool to check your formatting.', {image: photo(23), icon: 'toolbox-icon-link', link: 'https://library.example.edu/referencing', linkLabel: 'Library referencing guide', focusX: 70, focusY: 20}),
			cardObj(3, 'Time management', 'Block out study time in your calendar and protect it.', {image: photo(24), icon: 'toolbox-icon-time', link: ''}),
			cardObj(4, 'Look after yourself', 'Sleep, movement and breaks make study stick. Reach out early if you are struggling.', {image: photo(25), icon: 'toolbox-icon-love', linkLabel: 'Student wellbeing'}),
			cardObj(5, 'Getting help', 'Your tutor, the Learning Centre and the library are all one message away.', {image: photo(26), icon: 'toolbox-icon-question', linkLabel: ''}),
		],
	},
	[uuid('card', 2)]: {
		slug: 'link', theme: 'cards-link', icon: 'chevron', colour: 'toolbox-card-colour-green', layout: 2, alignment: 'left', reveal: 'hover', name: 'Resource link cards',
		objects: [
			cardObj(0, 'Course profile', 'Learning outcomes, assessment schedule and policies.', {image: photo(31), linkLabel: 'Open the course profile'}),
			cardObj(1, 'Weekly schedule', 'What is due and when, week by week.', {image: photo(32), linkLabel: 'See the schedule'}),
			cardObj(2, 'Assessment 2: Report', 'Instructions, marking guide and examples of past work.', {image: photo(33), linkLabel: 'Assessment details', link: LINK('assign', 50133)}),
			cardObj(3, 'Teaching team', 'Meet your lecturer and tutors.', {image: photo(34), linkLabel: 'Contact us'}),
		],
	},
	[uuid('card', 3)]: {
		slug: 'plain', theme: 'cards-plain', icon: false, colour: 'toolbox-card-colour-purple', layout: 3, alignment: 'center', reveal: 'hover', name: 'Gallery cards',
		objects: [
			cardObj(0, 'Field work, day 1', 'Site setup.', {image: photo(41), link: LINK('page', 50141)}),
			cardObj(1, 'Field work, day 2', 'Sampling.', {image: photo(42), link: LINK('page', 50142)}),
			cardObj(2, 'Lab session', 'Preparing the slides.', {image: photo(43), link: ''}),
			cardObj(3, 'Results', 'First pass at the data.', {image: photo(44), link: LINK('page', 50144)}),
			cardObj(4, 'Presentation day', 'Practice run.', {image: photo(45), link: LINK('page', 50145)}),
		],
	},
}
const CARD_IDS = Object.keys(CARD_DESIGNS)

function cardDoc(id, ctx = {}) {
	let d = CARD_DESIGNS[id]
	return {
		_id: id, courseCode: ctx.courseCode || 'ABC3001', courseLabel: ctx.courseLabel || 'ABC3001_2026_S1', username: ctx.username || 'u1234567', fullName: ctx.fullName || 'Test Staff',
		layout: d.layout, alignment: d.alignment, theme: d.theme, icon: d.icon, reveal: d.reveal, colour: d.colour, objects: JSON.parse(JSON.stringify(d.objects)),
	}
}

const CARD_TEMPLATE_NAMES = ['Key concepts', 'Meet the team', 'Study tips', 'Case studies', 'Glossary terms', 'Week-by-week', 'Tools we use', 'Frequently asked questions', 'Career pathways', 'Guest speakers', 'Lab safety', 'Exam tips', 'Past projects', 'Further reading']

function cardTemplate(n, ctx = {}) {
	let theme = CARD_THEMES[n % 3], count = 3 + (n % 4), staff = STAFF[n % 3]
	let objects = []
	for (let i = 0; i < count; i++) {
		objects.push(cardObj(i, `${TEXTS[(n + i) % TEXTS.length]} ${i + 1}`, lorem(n * 7 + i, 14), {image: photo(50 + ((n * 2 + i) % 14)), icon: ['toolbox-icon-info', 'toolbox-icon-read', 'toolbox-icon-write', 'toolbox-icon-think'][(n + i) % 4], link: i === 1 ? '' : LINK('page', 52000 + n * 10 + i)}))
	}
	return {
		_id: uuid('card-tpl', n), name: CARD_TEMPLATE_NAMES[n % CARD_TEMPLATE_NAMES.length], type: 'template',
		courseCode: n % 3 === 0 ? (ctx.courseCode || 'ABC3001') : 'XYZ2002', courseLabel: n % 3 === 0 ? (ctx.courseLabel || 'ABC3001_2026_S1') : 'XYZ2002_2025_S2',
		username: n % 2 === 0 ? (ctx.username || 'u1234567') : staff.username, fullName: n % 2 === 0 ? (ctx.fullName || 'Test Staff') : staff.fullName,
		timestamp: NOW - (n + 1) * 2 * DAY - n * 41 * 60000,
		layout: 1 + (n % 3), alignment: n % 2 ? 'center' : 'left', theme, icon: [false, 'chevron', 'icon-set'][n % 3], reveal: n % 4 === 0 ? 'click' : 'hover', colour: CARD_COLOURS[n % 6], objects,
	}
}

// ---- counter button (activity summary graphic) ----------------------------------------------------------------------------
const COUNTERS = {
	full: {readings: 12, podcasts: 4, activities: 9, videos: 3, 'duration-1': 2, 'duration-2': 30, colour: 'blue', iconColour: 'transparent', cdtID: 1772000000000},
	partial: {readings: 1, podcasts: 0, activities: 5, videos: 0, 'duration-1': 0, 'duration-2': 45, colour: 'green', iconColour: 'transparent', cdtID: 1772000100000},
	long: {readings: 24, podcasts: 11, activities: 17, videos: 8, 'duration-1': 6, 'duration-2': 5, colour: 'gold', iconColour: 'transparent', cdtID: 1772000200000},
}

// ---- generator config that rides in data-toolbox-config (tables, intro text, resource templates) ------------------------
const toolboxConfig = (obj) => encodeURIComponent(JSON.stringify(obj))

// ---- images -----------------------------------------------------------------------------------------------------------------
// A deterministic gradient PNG (real image bytes, so Image/canvas/decode paths work), for the profile-image "stored source".
let crcTable
function crc32(buf) {
	if (!crcTable) {
		crcTable = new Int32Array(256)
		for (let n = 0; n < 256; n++) {
			let c = n
			for (let k = 0; k < 8; k++) {
				c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
			}
			crcTable[n] = c
		}
	}
	let c = -1
	for (let i = 0; i < buf.length; i++) {
		c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8)
	}
	return (c ^ -1) >>> 0
}

function pngGradient(w, h, seed = 1) {
	const chunk = (type, data) => {
		let len = Buffer.alloc(4)
		len.writeUInt32BE(data.length)
		let td = Buffer.concat([Buffer.from(type), data])
		let crc = Buffer.alloc(4)
		crc.writeUInt32BE(crc32(td))
		return Buffer.concat([len, td, crc])
	}
	let ihdr = Buffer.alloc(13)
	ihdr.writeUInt32BE(w, 0)
	ihdr.writeUInt32BE(h, 4)
	ihdr[8] = 8
	ihdr[9] = 2
	let raw = Buffer.alloc((w * 3 + 1) * h)
	for (let y = 0; y < h; y++) {
		let o = y * (w * 3 + 1)
		raw[o] = 0
		for (let x = 0; x < w; x++) {
			let cx = x - w / 2, cy = y - h / 2, d = Math.sqrt(cx * cx + cy * cy) / (w / 2)
			raw[o + 1 + x * 3] = (40 + seed * 37 + x * 180 / w) & 255
			raw[o + 2 + x * 3] = (90 + y * 140 / h) & 255
			raw[o + 3 + x * 3] = d < 0.4 ? 240 : (150 + seed * 20 + (x + y) % 60) & 255
		}
	}
	return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

// ---- the editors' own (non-compressed) form -------------------------------------------------------------------------------
// The "used in this course" / "added by you" gallery rows come from analytics `ingest` docs whose meta.item.params.data is the editor's live
// $root.data: theme / icon as option objects, each object carrying its icon object, a decoded text, an absolute photo url and an id.
const fs = require('fs')
const {APPS} = require('../shared')
let ICONS
function icons() {
	if (!ICONS) {
		let src = fs.readFileSync(`${APPS}/toolbox/public/sys/js/icons.js`, 'utf8').replace(/^\s*_ICONS\s*=/, 'return ')
		ICONS = new Function(src)()
	}
	return ICONS
}
const BT_THEME_OBJS = {
	'standard-text-buttons': {title: 'Standard text buttons', type: 'button', theme: 'standard-button', class: 'standard-text-buttons', images: false},
	'large-text-buttons': {title: 'Large text buttons', type: 'button', theme: 'large-button', class: 'large-text-buttons', images: false},
	'tiles-with-image-above-text': {title: 'Tiles with image above text', type: 'tile', theme: 'tile', class: 'tiles-with-image-above-text', images: true},
	'tiles-with-image-behind-text': {title: 'Tiles with image behind text', type: 'tile', theme: 'tile', class: 'tiles-with-image-behind-text', images: true},
}
const CARD_THEME_OBJS = {
	'cards-flip': {title: 'Flip card (image front, text behind)', theme: 'flip-card', class: 'cards-flip', images: true},
	'cards-link': {title: 'Image card with link bar', theme: 'link-card', class: 'cards-link', images: true},
	'cards-plain': {title: 'Plain image card', theme: 'plain-card', class: 'cards-plain', images: true},
}
const ICON_OPTS = {false: {title: 'None', type: false}, chevron: {title: 'Chevron', type: 'chevron'}, 'icon-set': {title: 'StudyDesk Toolbox Icon Set', type: 'icon-set'}}
const iconObj = (cls) => icons().find(i => i.class === cls) || null
const photoUrl = (host, id) => id ? `http://${host}/photography-gallery/photos/${id}` : ''

function editorForm(doc, host, themes, textKeys) {
	let out = JSON.parse(JSON.stringify(doc))
	out.theme = themes[doc.theme]
	out.icon = ICON_OPTS[doc.icon]
	out.timestamp = NOW - 5 * DAY
	out.objects = out.objects.map((o, i) => {
		let e = Object.assign({}, o, {id: uuid('editor-obj', doc._id + ':' + i), hoveredIcon: null, popupID: null, image: photoUrl(host, o.image), icon: iconObj(o.icon)})
		textKeys.forEach(k => {
			e[k] = decodeURIComponent(o[k] || '')
		})
		return e
	})
	return out
}
const btEditorForm = (doc, host) => editorForm(doc, host, BT_THEME_OBJS, ['text'])
const cardEditorForm = (doc, host) => editorForm(doc, host, CARD_THEME_OBJS, ['title', 'text', 'linkLabel'])

module.exports = {
	btEditorForm, cardEditorForm,
	rfc, nameOf, photo, toolboxConfig, STAFF, LINK,
	BT_DESIGNS, BT_IDS, btDoc, btTemplate, BT_TEMPLATE_COUNT: 14,
	CARD_DESIGNS, CARD_IDS, cardDoc, cardTemplate, CARD_TEMPLATE_COUNT: 14,
	COUNTERS, pngGradient,
}
