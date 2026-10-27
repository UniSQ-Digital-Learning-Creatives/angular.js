'use strict'
// Data builders for fixtures/toolbox.js: the toolbox's content/course/h5p templates and the lists it pre-fetches from sibling apps.
// Everything is a pure function of its arguments (no clock, no randomness).
const {APPS, NOW, DAY, oid, uuid, lorem, img} = require('../shared')

const LMS = 'localhost'
const COURSE_ID = 1111

// toolboxItems.js is a plain module (module.exports under node), so the real catalogue is the source of truth for ids/titles
function catalogue() {
	return require(`${APPS}/toolbox/public/sys/js/toolboxItems.js`)
}

// ---- layout (content) templates -------------------------------------------------------------------------------------------

const ICONS = ['SDC__Icon_Read', 'SDC__Icon_Write', 'SDC__Icon_Discuss', 'SDC__Icon_Watch', 'SDC__Icon_Listen', 'SDC__Icon_Think', 'SDC__Icon_Calendar', 'SDC__Icon_Assessment']

function icon(name, colour, extra = '') {
	return `<img class="ilar-icon-set toolbox-icon-set toolbox-icon-${colour}" alt=" " role="presentation" width="35" height="35" src="//localhost/images/icons/${name}.svg?colour=${colour}${extra}">`
}

function textStyle(kind, colour, html) {
	return `<div class="toolbox-text-styles toolbox-text-styles-${kind} toolbox-text-styles-colour-${colour}">${html}</div>`
}

function table(colour, head, rows) {
	return `<table class="toolbox-table toolbox-table-striped toolbox-table-colour-${colour}" style="width:100%"><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead>` +
		`<tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`
}

function h5p(library, n) {
	let file = `https://lms.example.edu/pluginfile.php/${COURSE_ID}/contentbank/public/${100 + n}/${library.toLowerCase().replace(/\W+/g, '-')}.h5p`
	return {
		file,
		html: `<div class="h5p-placeholder"><iframe src="https://lms.example.edu/h5p/embed.php?url=${encodeURIComponent(file)}&amp;embed=${n % 2}" width="100%" height="300"></iframe></div>`,
	}
}

// body builders keyed by chapter kind -> html using the toolbox's own css classes
const BODY = {
	welcome: (c, n) => `<h2>Welcome to your course</h2><p>${lorem(n, 22)}</p>` + textStyle('introduction', c, `<p><strong>Your teaching team</strong></p><p>${lorem(n + 1, 18)}</p>`) +
		'<hr>' + `<p>${icon('SDC__Icon_Calendar', c)} ${lorem(n + 2, 12)}</p><p>${icon('SDC__Icon_Read', c)} ${lorem(n + 3, 12)}</p>`,
	overview: (c, n) => `<h3>Course overview</h3><p>${lorem(n, 30)}</p>` + table(c, ['Week', 'Topic', 'Assessment'], [1, 2, 3, 4, 5, 6].map(w => [`Week ${w}`, lorem(n + w, 3), w % 3 === 0 ? 'Quiz' : '-'])) +
		textStyle('callout', c, `<p>${lorem(n + 9, 16)}</p>`),
	module: (c, n) => `<h3>Module overview</h3><p>${lorem(n, 26)}</p><ul>` + [0, 1, 2, 3].map(i => `<li>${icon(ICONS[(n + i) % ICONS.length], c)} ${lorem(n + i, 8)}</li>`).join('') + '</ul>' +
		textStyle('quote', c, `<p>${lorem(n + 5, 14)}</p>`) + '<hr>' + `<p>${lorem(n + 6, 24)}</p>`,
	week: (c, n) => `<h3>Week ${(n % 12) + 1}</h3><p>${lorem(n, 20)}</p>` + table(c, ['Activity', 'Time', 'Resources'], [0, 1, 2, 3].map(i => [lorem(n + i, 4), `${20 + i * 10} min`, icon(ICONS[(n + i) % ICONS.length], c)])),
	assignment: (c, n) => `<h3>Assessment details</h3>` + textStyle('warning', c, `<p><strong>Due:</strong> Friday of week 7, 11:59pm</p>`) + `<p>${lorem(n, 28)}</p>` +
		table(c, ['Criterion', 'Weighting', 'Description'], [0, 1, 2, 3].map(i => [lorem(n + i, 2), `${[20, 30, 30, 20][i]}%`, lorem(n + i + 7, 9)])),
	quiz: (c, n) => `<h3>Quiz instructions</h3><p>${lorem(n, 18)}</p>` + textStyle('box', c, `<ol><li>${lorem(n + 1, 8)}</li><li>${lorem(n + 2, 8)}</li><li>${lorem(n + 3, 8)}</li></ol>`) + '<hr>' +
		h5p('Multiple Choice', n).html,
	readings: (c, n) => `<h3>Reading list</h3>` + [0, 1, 2, 3, 4].map(i => `<p>${icon('SDC__Icon_Read', c)} <a href="https://lms.example.edu/mod/url/view.php?id=${300 + n + i}">${lorem(n + i, 5)}</a></p>`).join('') +
		h5p('Accordion', n).html,
	resource: (c, n) => `<h3>Resource</h3>` + table(c, ['Resource', 'Type', 'Link'], [0, 1, 2].map(i => [lorem(n + i, 3), ['Video', 'Article', 'Podcast'][i], `<a href="https://lms.example.edu/mod/url/view.php?id=${400 + n + i}">Open</a>`])) +
		textStyle('textbox', c, `<p>${lorem(n + 4, 16)}</p>`),
	clinical: (c, n) => `<h3>Clinical placement</h3><p>${lorem(n, 24)}</p>` + textStyle('sensitive', c, `<p>${lorem(n + 1, 14)}</p>`) + h5p('Interactive Video', n).html,
}

// section/subsection/book/chapter tree (the template course's structure), see index.js for the real collections
const TREE = [
	{
		sectionID: 101, title: 'Course introduction', access: ['All'], order: 1,
		books: [{bookID: 201, title: 'Home page layouts', order: 1, chapters: [['Welcome and introductions', 'welcome', 'gold'], ['Course overview and schedule', 'overview', 'blue'], ['Teaching team', 'welcome', 'green']]}],
	},
	{
		sectionID: 102, title: 'Learning modules', access: ['All'], order: 2,
		subs: [
			{subSectionID: 301, title: 'Module layouts', order: 1, books: [{bookID: 202, title: 'Module pages', order: 1, chapters: [['Module overview', 'module', 'purple'], ['Module with readings', 'readings', 'blue'], ['Module with quiz', 'quiz', 'orange'], ['Module with discussion', 'module', 'green']]}]},
			{subSectionID: 302, title: 'Weekly overviews', order: 2, books: [{bookID: 203, title: 'Week pages', order: 1, chapters: [['Week 1', 'week', 'gold'], ['Week 2', 'week', 'gold'], ['Week 10', 'week', 'gold'], ['Week 9', 'week', 'gold']]}]},
		],
	},
	{
		sectionID: 103, title: 'Assessment', access: ['All'], order: 3,
		books: [{bookID: 204, title: 'Assessment pages', order: 1, chapters: [['Assignment brief', 'assignment', 'blue'], ['Marking rubric', 'assignment', 'charcoal'], ['Online quiz instructions', 'quiz', 'orange']]}],
	},
	{
		sectionID: 104, title: 'Resources and readings', access: ['All'], order: 4,
		books: [
			{bookID: 205, title: 'Reading lists', order: 1, chapters: [['Weekly reading list', 'readings', 'purple'], ['Further reading', 'readings', 'green']]},
			{bookID: 206, title: 'Resource tables', order: 2, chapters: [['Resource table', 'resource', 'gold'], ['Media resources', 'resource', 'blue']]},
		],
	},
	{
		sectionID: 105, title: 'Nursing and Midwifery', access: ['School of Nursing and Midwifery'], order: 5,
		books: [{bookID: 207, title: 'Placement pages', order: 1, chapters: [['Clinical placement overview', 'clinical', 'green'], ['Placement requirements', 'clinical', 'blue']]}],
	},
]

// flat list of every chapter doc as the content-templates collection holds it
function contentTemplateDocs() {
	let docs = []
	let chapterID = 1000
	for (let s of TREE) {
		let groups = s.subs ? s.subs : [{subSectionID: null, title: null, order: null, books: s.books}]
		for (let sub of groups) {
			for (let b of sub.books) {
				b.chapters.forEach(([title, kind, colour], i) => {
					chapterID++
					let code = BODY[kind](colour, chapterID)
					docs.push({
						_id: oid('content-template', chapterID),
						chapterID, chapterTitle: title, bookID: b.bookID, bookTitle: b.title, sectionID: s.sectionID, sectionTitle: s.title,
						subSectionID: sub.subSectionID, subSectionTitle: sub.title, lmsURL: LMS, courseID: COURSE_ID,
						link: `https://lms.example.edu/mod/book/view.php?id=${b.bookID}&chapterid=${chapterID}`, bookLink: `https://lms.example.edu/mod/book/view.php?id=${b.bookID}`,
						code, previewCode: `<div class="book_content">${code}</div>`, needsUpdate: false, previewAttempts: 0, deleted: false, hidden: false, published: true,
						sectionOrder: s.order, subSectionOrder: sub.order, bookOrder: b.order, access: s.access,
					})
				})
			}
		}
	}
	return docs
}

// Mirrors GET /fetch-content-templates: unhidden, published, in an allowed section, grouped on bookID (bookID/bookTitle stripped from each template)
function fetchContentTemplates(query, allSections) {
	let allowed = ['All']
	let docs = contentTemplateDocs().filter(d => allSections || d.access.some(a => allowed.includes(a)))
	let groups = {}
	for (let d of docs) {
		let t = Object.assign({}, d, {bookHidden: false, sectionRestricted: allSections ? !d.access.some(a => allowed.includes(a)) : false})
		delete t.access
		delete t.bookID
		delete t.bookTitle
		let g = groups[d.bookID] = groups[d.bookID] || {_id: d.bookID, bookTitle: d.bookTitle, sectionTitle: d.sectionTitle, templates: []}
		g.templates.push(t)
	}
	return Object.values(groups).sort((a, b) => a._id - b._id)
}

function sectionDocs() {
	return TREE.map(s => ({_id: oid('ct-section', s.sectionID), sectionID: s.sectionID, title: s.title, access: s.access, lmsURL: LMS, courseID: COURSE_ID, sortOrder: s.order, deleted: false}))
}

// ---- course templates (course backups) and h5p templates ----------------------------------------------------------------------

function courseTemplates() {
	let names = ['Blank course shell', 'Standard 14 week course', 'Intensive 6 week course', 'Postgraduate seminar course', 'Practicum and placement course']
	return names.map((t, i) => ({
		_id: oid('course-template', i), courseID: 44289 + i, courseContextId: 416313 + i * 76, courseTitle: t, lmsURL: LMS, filename: `${416313 + i * 76}-${44289 + i}.mbz`,
		thumbnail: img(320, 180, t), uploaded: NOW - (i + 3) * 9 * DAY,
	}))
}

function h5pTemplates() {
	let types = ['Accordion', 'Course Presentation', 'Dialog Cards', 'Drag and Drop', 'Fill in the Blanks', 'Flashcards', 'Interactive Video', 'Memory Game', 'Multiple Choice', 'Timeline']
	return types.map((t, i) => ({
		_id: oid('h5p-template', i), title: `${t} template`, active: true, lmsURL: LMS, type: t,
		link: `https://lms.example.edu/pluginfile.php/${COURSE_ID}/contentbank/public/${100 + i}/${t.toLowerCase().replace(/\W+/g, '-')}.h5p`, description: lorem(i + 40, 10),
	}))
}

// h5p-preview/map: package url -> {hash, library}; the first accordion/multiple choice packages are "held", the rest are pending
function h5pPreviewMap() {
	let map = {}
	;[['Multiple Choice', 1002], ['Accordion', 1008]].forEach(([lib, n], i) => {
		let docs = contentTemplateDocs()
		let d = docs.find(x => x.code.includes(lib.toLowerCase().replace(/\W+/g, '-') + '.h5p'))
		if (d) {
			let m = /url=([^&"]+)/.exec(d.code)
			map[decodeURIComponent(m[1])] = {hash: oid('h5p-hash', lib).slice(0, 16), library: lib}
		}
	})
	return map
}

function h5pPlayerPage(hash) {
	return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>H5P preview</title><style>body{font:14px 'Open Sans',Arial,sans-serif;margin:0;padding:12px;color:#222}.q{border:1px solid #cfd8dc;border-radius:6px;padding:12px;margin:8px 0}.q b{display:block;margin-bottom:6px}</style></head><body>` +
		`<div class="q"><b>Question 1 of 3</b>${lorem(11, 12)}<br><label><input type="radio" name="a"> ${lorem(12, 3)}</label><br><label><input type="radio" name="a"> ${lorem(13, 3)}</label><br><label><input type="radio" name="a"> ${lorem(14, 3)}</label></div>` +
		`<div class="q"><b>Question 2 of 3</b>${lorem(15, 10)}</div><!-- ${hash} --></body></html>`
}

// ---- the lists the toolbox pre-fetches from sibling apps -----------------------------------------------------------------------

function pronunciationGuides() {
	let names = ['Place names of the Darling Downs', 'Anatomical terms: the heart', 'Te reo Maori greetings', 'Medical terminology A-F', 'Japanese hiragana basics', 'Latin species names', 'Draft guide (unpublished)']
	return names.map((n, i) => ({_id: oid('pron-guide', i), name: n, 'home-title': n, published: i !== 6, lmsURL: LMS, timestamp: NOW - i * 11 * DAY}))
}

function photospheres() {
	let names = ['Toowoomba campus library', 'Springfield engineering workshop', 'Ipswich nursing simulation lab', 'Mount Kynoch lookout', 'Gatton farm tour', 'Springfield broadcast studio', 'Draft: new science wing']
	return names.map((n, i) => ({sessionID: uuid('photosphere', i), title: n, status: i === 6 ? 'draft' : 'public', thumbnail: img(240, 120, n), timestamp: NOW - i * 7 * DAY, scenes: 2 + (i % 4)}))
}

function models() {
	let names = ['Human heart (anatomical)', 'Roman amphora', 'Wind turbine nacelle', 'Skull with annotations', 'Native bee hive', 'Drone frame']
	return names.map((n, i) => ({_id: oid('model3d', i), title: n, published: true, thumbnail: img(240, 160, n), size: 1200000 + i * 83000}))
}

function podcasts() {
	let names = ['Voices from the Darling Downs', 'Nursing practice weekly', 'Engineering in context', 'Teaching with technology', 'Law and the everyday']
	return names.map((n, i) => ({_id: oid('podcast', i), title: n, description: lorem(i + 70, 16), courseCodes: ['ABC3001'], image: img(300, 300, n), episodeCount: 8 + i * 3, published: true}))
}

function discussions() {
	let titles = [['Week 1 introductions'], ['Ask the teaching team'], ['Assignment 1 questions', 'Assignment one Q and A'], ['Study group finder'], ['Weekly reflections']]
	return titles.map((t, i) => ({_id: oid('discussion', i), title: t, courseLabel: 'ABC3001_2026_S1', timestamp: NOW - i * 5 * DAY, messageCount: 4 + i * 7}))
}

function audioPlayerItems() {
	let titles = [['Welcome to the course', 'Dr Jordan Lee'], ['Week 3 lecture summary', 'Dr Jordan Lee'], ['Guest interview: industry panel', 'Prof Alex Kim']]
	return titles.map(([t, a], i) => ({
		_id: oid('audio-item', i), title: t, author: a, courseCode: 'ABC3001', username: 'u1234567', mp3Filename: `welcome-${i}.mp3`, thumbnailFilename: `welcome-${i}.png`,
		panoptoSessionId: uuid('panopto', i), status: 'ready', uploaded: NOW - (i + 1) * 12 * DAY,
	}))
}

function forums() {
	let names = [['Announcements', 'news'], ['General discussion', ''], ['Assessment queries', ''], ['Study tips', '']]
	return {
		contextID: 1111, userID: 2222,
		forums: names.map(([name, news], i) => ({
			id: 500 + i, name, news_forum: news, link: `https://lms.example.edu/mod/forum/view.php?id=${500 + i}`, rssLink: `https://lms.example.edu/mod/forum/rsslib.php?id=${500 + i}`,
			posts: [0, 1, 2].map(p => ({id: i * 10 + p, subject: lorem(i * 10 + p + 90, 5), author: p % 2 ? 'Test Staff' : 'Jordan Lee', time: Math.floor((NOW - (p + 1) * DAY) / 1000), message: lorem(i + p + 120, 20)})),
		})),
	}
}

// popularity: item _id -> count (deterministic, a few items unused)
function insertsByItem() {
	let items = catalogue()
	return items.filter((it, i) => i % 5 !== 4).map((it, i) => ({_id: it._id, title: [it.title.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()], count: 3 + ((i * 37) % 61)}))
}

// editor favourites for the staff user
function favourites() {
	let items = catalogue()
	let ids = ['buttons-and-tiles', 'toolbox-text-styles', 'toolbox-table', 'podcast-player']
	let fav = {}
	for (let it of items) {
		if (ids.includes(it.editorID)) {
			fav[it._id] = true
		}
	}
	return fav
}

const CHANGELOG = '<h2>Public changelog</h2>' + [
	['3.14.0', 'Layout templates now sort in the same order as the template course.'], ['3.13.2', 'Audio player thumbnails are normalised on upload.'],
	['3.13.0', 'New: Text Styles can be nested inside each other.'], ['3.12.4', 'Fixed the resource template losing hidden rows on update.'],
].map(([v, t]) => `<h4>${v}</h4><ul><li>${t}</li><li>${lorem(v.length * 7, 10)}</li></ul>`).join('')

module.exports = {
	catalogue, contentTemplateDocs, fetchContentTemplates, sectionDocs, courseTemplates, h5pTemplates, h5pPreviewMap, h5pPlayerPage, pronunciationGuides, photospheres, models, podcasts,
	discussions, audioPlayerItems, forums, insertsByItem, favourites, CHANGELOG, TREE, LMS,
}
