'use strict'
// Deterministic media-catalogue data: ~640 photos, collections, activity, share log, staff directory.
// Shapes copied from media-catalogue/index.js + process-sync-photos.js (buildDoc) so the frontend sees what mongo would give it.
const {NOW, DAY, oid, lorem} = require('../shared')

const TOPICS = [
	['Engineering', ['engineering', 'laboratory', 'students', 'equipment', 'bridge']],
	['Nursing', ['nursing', 'simulation', 'health', 'students', 'ward']],
	['Paramedicine', ['paramedicine', 'ambulance', 'simulation', 'emergency', 'students']],
	['Campus', ['campus', 'architecture', 'building', 'landscape', 'walkway']],
	['Library', ['library', 'study', 'books', 'students', 'quiet']],
	['Graduation', ['graduation', 'ceremony', 'gown', 'celebration', 'family']],
	['Surveying', ['surveying', 'field', 'theodolite', 'outdoors', 'students']],
	['Biology', ['biology', 'specimens', 'microscope', 'laboratory', 'science']],
	['Education', ['education', 'classroom', 'teaching', 'children', 'whiteboard']],
	['Business', ['business', 'meeting', 'office', 'presentation', 'laptop']],
	['Music', ['music', 'performance', 'piano', 'stage', 'rehearsal']],
	['Psychology', ['psychology', 'counselling', 'research', 'interview', 'wellbeing']],
	['Agriculture', ['agriculture', 'crops', 'farm', 'soil', 'drone']],
	['Law', ['law', 'moot', 'court', 'debate', 'books']],
	['Aviation', ['aviation', 'simulator', 'cockpit', 'pilot', 'training']],
	['Anatomy', ['anatomy', 'models', 'skeleton', 'teaching', 'laboratory']],
]
const EXTRA_TAGS = ['group work', 'portrait', 'wide angle', 'close up', 'natural light', 'candid', 'diverse', 'technology', 'collaboration', 'sunrise', 'queensland', 'springfield', 'toowoomba', 'ipswich', 'online learning', 'mentoring', 'workshop', 'outdoor', 'indoor', 'night']
const PHOTOGRAPHERS = ['Alex Smith', 'Morgan Fraser', 'Jordan Liu', 'Casey Brennan', 'USQ']
const SCENES = ['Practical session', 'Group study', 'Lecture theatre', 'Field trip', 'Workshop demo', 'Graduate portrait', 'Lab bench', 'Exterior view', 'Orientation day', 'Open day', 'Team project', 'Guest speaker']

function pad(n, w) {
	return String(n).padStart(w, '0')
}

function buildPhotos(count) {
	let out = []
	for (let i = 0; i < count; i++) {
		// Graduation (trending #3, clicked by the interaction steps) is kept under one page (<40 hits): a search whose first page is
		// full lets the app's scroll-paging race (scrollTop vs short content) fire page 2 or not, which makes A/B runs flaky.
		let ti = i % TOPICS.length
		if (ti === 5 && Math.floor(i / TOPICS.length) % 3 !== 0) {
			ti = 6
		}
		let [topicName, topicTags] = TOPICS[ti]
		let scene = SCENES[(i * 7 + 3) % SCENES.length]
		let job = 10000 + ((i * 7919) % 90000)
		let month = 1 + ((i * 5) % 12)
		let year = 21 + (i % 6)
		let who = PHOTOGRAPHERS[i % PHOTOGRAPHERS.length]
		let initials = who === 'USQ' ? 'UQ' : who.split(' ').map(x => x[0]).join('')
		let basename = `${job}_${topicName.replace(/\s/g, '')}_${pad(month, 2)}${pad(year, 2)}_${initials}_${pad(1 + ((i * 13) % 250), 3)}`
		let filename = `${basename}.jpg`
		let tags = topicTags.slice(0, 3 + (i % 3))
		tags = tags.concat([EXTRA_TAGS[(i * 3) % EXTRA_TAGS.length], EXTRA_TAGS[(i * 11 + 5) % EXTRA_TAGS.length]])
		if (i % 4 === 0) {
			tags.push(topicName)
		}
		tags = tags.filter((t, k) => tags.indexOf(t) === k)
		let shot = Date.UTC(2000 + year, month - 1, 1 + (i % 27), 9 + (i % 8), (i * 7) % 60)
		out.push({
			_id: oid('photo', i),
			title: basename,
			description: i % 9 === 0 ? '-' : `${scene} with ${topicName.toLowerCase()} students. ${lorem(i + 1, 9)}`,
			filename,
			thumbnail: `${basename}_thumb.jpg`,
			type: 'usq-photo',
			meta: {creator: [who], date: new Date(shot).toISOString(), originalFilename: filename},
			tags,
			ingest: {version: 3, size: 150000 + ((i * 7717) % 400000), mtimeMs: 1769000000000 + i * 3600000, ingestedAt: new Date(NOW - 20 * DAY).toISOString()},
			// `added` is epoch ms (set once on insert): later index = newer
			added: NOW - (count - i) * 5 * 3600000,
		})
	}
	return out
}

const STAFF = [
	['Taylor', 'Nguyen'], ['Priya', 'Patel'], ['Liam', "O'Connor"], ['Mei', 'Chen'], ['Hannah', 'Kowalski'], ['Oscar', 'Reyes'], ['Fatima', 'Haddad'], ['Noah', 'Williams'],
	['Grace', 'Tan'], ['Ethan', 'Murphy'], ['Isla', 'Campbell'], ['Mateo', 'Silva'], ['Zara', 'Ahmed'], ['Jack', 'Thompson'], ['Ava', 'Robertson'], ['Lucas', 'Bauer'],
].map(([f, l], i) => ({
	username: `u${8000001 + i * 37}`, firstName: f, lastName: l, fullName: `${f} ${l}`, email: `${f}.${l.replace(/[^A-Za-z]/g, '')}@unisq.edu.au`,
}))

function stem(w) {
	return w.toLowerCase().replace(/(ing|es|s)$/, '')
}

function words(str) {
	return String(str || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
}

// mongo $text stand-in: any query word (stemmed) hits title/description/tags; tags weigh most
function textScore(photo, query) {
	let qs = words(query).map(stem)
	if (!qs.length) {
		return 1
	}
	let tagW = new Set(photo.tags.flatMap(words).map(stem))
	let titleW = new Set(words(photo.title + ' ' + photo.description).map(stem))
	let score = 0
	for (let q of qs) {
		if (tagW.has(q)) {
			score += 3
		}
		if (titleW.has(q)) {
			score += 1
		}
	}
	return score
}

function haystack(d) {
	return [d.title, d.description, d.filename, d.meta && d.meta.originalFilename].concat(d.tags || []).filter(Boolean).join(' ')
}

function fuzzySpan(text, query) {
	if (text.includes(query)) {
		return query.length - 1
	}
	let best = Infinity
	for (let start = text.indexOf(query[0]); start !== -1; start = text.indexOf(query[0], start + 1)) {
		let textIndex = start + 1
		for (let q = 1; q < query.length && textIndex !== 0; q++) {
			textIndex = text.indexOf(query[q], textIndex) + 1
		}
		if (textIndex === 0) {
			break
		}
		best = Math.min(best, textIndex - 1 - start)
	}
	return best
}

function fuzzyMatch(text, query) {
	text = (text || '').toLowerCase()
	query = (query || '').trim().toLowerCase()
	if (!query) {
		return true
	}
	if (query.length <= 2) {
		return text.includes(query)
	}
	return fuzzySpan(text, query) <= query.length * 3
}

function initState(s) {
	const photos = buildPhotos(650)
	s.photos = photos
	s.byFilename = Object.fromEntries(photos.map(p => [p.filename, p]))
	// per-photo stats (deterministic)
	s.stats = {}
	photos.forEach((p, i) => {
		s.stats[p.filename] = {viewed: (i * 37) % 211, downloaded: (i * 11) % 23, inserted: (i * 17) % 31}
	})
	s.staff = STAFF
	let me = 'u1234567'
	let item = (idx, daysAgo, by) => ({filename: photos[idx].filename, addedAt: new Date(NOW - daysAgo * DAY).toISOString(), addedBy: by || me, DLAV: false})
	let range = (from, n, step) => Array.from({length: n}, (_, k) => item((from + k * step) % photos.length, 40 - (k % 38)))
	s.collections = [
		{_id: `shared-with-me:${me}`, owner: me, name: 'Shared with me', createdAt: new Date(NOW - 90 * DAY).toISOString(), updatedAt: new Date(NOW - 3 * DAY).toISOString(), DLAV: false, sharedBy: null,
			items: [item(12, 3, STAFF[0].username), item(45, 6, STAFF[1].username), item(77, 9, STAFF[0].username), item(150, 12, STAFF[3].username), item(301, 20, STAFF[1].username)]},
		{_id: `favourites:${me}`, owner: me, name: 'Favourites', createdAt: new Date(NOW - 120 * DAY).toISOString(), updatedAt: new Date(NOW - 1 * DAY).toISOString(), DLAV: false, sharedBy: null,
			items: range(5, 24, 23)},
	]
	let named = [
		['Engineering lab shots', 40, 4, 16], ['Graduation 2025', 120, 9, 8], ['Nursing simulation', 18, 16, 3], ['Campus architecture', 60, 3, 7], ['Library and study', 33, 5, 2],
		['Hero banners', 15, 0, 41], ['Field work', 52, 21, 12], ['Science and biology', 9, 11, 19], ['Open day 2026', 200, 2, 1], ['Course introductions', 28, 14, 14], ['Orphaned test collection', 0, 0, 1],
	]
	named.forEach(([name, n, from, step], k) => {
		s.collections.push({
			_id: oid('collection', k), owner: me, name, createdAt: new Date(NOW - (100 - k * 7) * DAY).toISOString(), updatedAt: new Date(NOW - (k * 4 + 1) * DAY).toISOString(),
			DLAV: k % 5 === 0, sharedBy: k === 3 ? STAFF[2].username : null, items: range(from * 7, n, step),
		})
	})
	s.nextCollection = 100
	s.recentSearches = ['engineering lab', 'graduation gowns', 'nursing', 'campus aerial', 'library study', 'surveying field', 'paramedic simulation', 'anatomy models', 'music performance', 'agriculture drone']
		.map((t, i) => ({textSearch: t, resultCount: 8 + ((i * 29) % 120), searchedAt: new Date(NOW - (i + 1) * 9 * 3600000).toISOString()}))
	s.recentlyViewed = Array.from({length: 24}, (_, i) => ({filename: photos[(i * 53 + 7) % photos.length].filename, viewedAt: new Date(NOW - (i + 1) * 3 * 3600000).toISOString()}))
	s.trending = ['engineering', 'nursing', 'graduation', 'campus', 'library', 'students', 'laboratory', 'simulation', 'surveying', 'paramedicine', 'anatomy', 'music', 'aviation', 'agriculture', 'biology', 'business', 'law', 'psychology', 'education', 'drone']
		.map((t, i) => ({_id: t, userCount: 60 - i * 2}))
	s.shareLog = [
		{type: 'item', sender: me, receiverUsername: STAFF[0].username, itemUrl: photos[12].filename, DLAV: false, timestamp: new Date(NOW - 2 * DAY).toISOString()},
		{type: 'collection', sender: STAFF[1].username, receiverUsername: me, collectionId: oid('collection', 3), name: 'Campus architecture', itemCount: 60, DLAV: false, timestamp: new Date(NOW - 4 * DAY).toISOString()},
		{type: 'item', sender: STAFF[3].username, receiverUsername: me, itemUrl: photos[150].filename, DLAV: true, timestamp: new Date(NOW - 7 * DAY).toISOString()},
		{type: 'item', sender: me, receiverUsername: STAFF[5].username, itemUrl: photos[301].filename, DLAV: false, timestamp: new Date(NOW - 11 * DAY).toISOString()},
		{type: 'collection', sender: me, receiverUsername: STAFF[2].username, collectionId: oid('collection', 1), name: 'Graduation 2025', itemCount: 120, DLAV: false, timestamp: new Date(NOW - 15 * DAY).toISOString()},
		{type: 'item', sender: STAFF[0].username, receiverUsername: me, itemUrl: photos[77].filename, DLAV: false, timestamp: new Date(NOW - 21 * DAY).toISOString()},
	]
}

module.exports = {initState, buildPhotos, textScore, haystack, fuzzyMatch, fuzzySpan, words, stem, STAFF}
