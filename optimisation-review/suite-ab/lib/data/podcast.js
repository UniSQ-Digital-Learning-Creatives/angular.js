'use strict'
// Seed data shared by the podcast-manager and toolbox-podcast-player fixtures (podcast-manager owns the episodes/podcasts collections)
const {NOW, DAY, oid, lorem} = require('../shared')

const PRESENTERS = ['Dr Helen Fraser', 'Test Staff', 'Prof. Mark Ellis', 'Dr Anika Rao', 'Jamie Collins', 'Dr Sofia Marin']

// [title, owner username, courseCode, school, episode count, description]
const PODCASTS = [
	['Leading Learning', 'u1234567', 'ABC3001', 'Schl of Education', 12, 'Conversations with teachers and leaders about what actually changes learning outcomes in classrooms.'],
	['Business in Practice', 'u1234567', 'ABC3001', 'Schl of Business', 8, 'Short interviews with graduates about their first years in business.'],
	['Engineering Futures', 'u2002001', 'ABC1014', 'Schl of Engineering', 6, 'Where engineering is heading, and what it means for students starting now.'],
	['Nursing Voices', 'u2002002', 'ABC1021', 'Schl of Nursing and Midwifery', 9, 'Nurses and midwives talk through the shifts, the studies and the surprises.'],
	['Science Shorts', 'u2002003', 'ABC1028', 'Schl of Sciences', 5, 'Five minute explainers on the science behind the headlines.'],
	['Law and Society', 'u1234567', 'ABC2007', 'Schl of Law and Justice', 7, 'Cases, commentary and the people who work with the law every day.'],
	['Study Skills Sessions', 'u2002004', 'ABC1001', 'Learning and Teaching Centre', 4, 'Practical sessions on reading, notes, referencing and exam preparation.'],
]

const EP_TITLES = [
	'Getting started', 'What I wish I had known', 'Feedback that works', 'The first week', 'Managing time', 'Working with others', 'Research in practice', 'Ethics and judgement',
	'Technology and change', 'Assessment without anxiety', 'Reflective practice', 'Looking back, looking ahead', 'Listening to students', 'Unexpected careers', 'Mistakes we learned from',
]

const iso = (ms) => new Date(ms).toISOString()

function podcasts() {
	return PODCASTS.map((p, i) => ({
		_id: oid('podcast', i + 1), title: p[0], description: p[5], owner: p[1], cover: `cover-${i + 1}.jpg`, courseCode: p[2], school: p[3],
	}))
}

function episodes() {
	let out = []
	let n = 0
	PODCASTS.forEach((p, pi) => {
		for (let k = 0; k < p[4]; k++) {
			n++
			let ts = NOW - (p[4] - k) * 6 * DAY - pi * 1.5 * DAY
			let hasTranscript = (n % 3) !== 1
			out.push({
				_id: oid('episode', n), title: `${EP_TITLES[(k + pi * 3) % EP_TITLES.length]}${k >= EP_TITLES.length ? ' (part 2)' : ''}`,
				description: `${lorem(n * 3, 18)} ${lorem(n * 3 + 1, 14)}`,
				podcastID: oid('podcast', pi + 1), cover: k % 4 === 1 ? `episode-cover-${n}.jpg` : null,
				transcript: hasTranscript ? [lorem(n * 5, 30), lorem(n * 5 + 1, 26), lorem(n * 5 + 2, 34), lorem(n * 5 + 3, 22)].map((t, j) => `${j % 2 ? 'Guest' : PRESENTERS[n % PRESENTERS.length]}: ${t}`).join('\n\n') : '',
				timestamp: ts, mp3: `episode-${n}.mp3`, presenter: PRESENTERS[(n + pi) % PRESENTERS.length], published: ts, duration: 600 + ((n * 137) % 1800), fileSize: 9000000 + n * 311111,
			})
		}
	})
	return out
}

const SCHOOLS_RAW = ['Schl of Business', 'Schl of Education', 'Schl of Engineering', 'Fac of Bus, Educ, Law & Arts', 'Fac of Health, Eng & Sciences', 'Schl of Nursing and Midwifery', 'Hlth & Med Sciences',
	'Schl of Psych and Counselling', 'Mech & Elect Eng', 'Civil Eng & Surveying', 'Built Env', 'Managmt & Enterprise', 'Maths, Physics & Comp', 'Hummanities & Comm', 'Ag & Env Sciences']

const COURSES = ['ABC1001', 'ABC1007', 'ABC1014', 'ABC1021', 'ABC1028', 'ABC1035', 'ABC2007', 'ABC2014', 'ABC2021', 'ABC3001', 'ABC3008', 'ABC3015', 'ABC4001']

const esc = (x) => String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const storage = (host, file) => `${host}/storage/development/podcast-manager/${file}`

// What podcast-manager's /api/podcasts/rss builds (podcast lib), newest episode first
function rssXml(pod, eps, host, ownerName) {
	let items = eps.slice().reverse().map(e => `<item><title>${esc(e.title)}</title><description>${esc(e.description)}</description><link>${esc(storage(host, e.mp3))}</link><guid isPermaLink="true">${esc(storage(host, e.mp3))}</guid>` +
		`<dc:creator>${esc(e.presenter)}</dc:creator><pubDate>${new Date(e.published).toUTCString()}</pubDate><enclosure url="${esc(storage(host, e.mp3))}" length="${e.fileSize}" type="audio/mpeg"/>` +
		`<itunes:duration>${Math.round(e.duration)}</itunes:duration><itunes:image href="${esc(storage(host, e.cover || pod.cover || 'default.png'))}"/></item>`).join('')
	return `<?xml version="1.0" encoding="UTF-8"?>\n<rss xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" version="2.0"><channel><title>${esc(pod.title)}</title><description>${esc(pod.description)}</description>` +
		`<link>${esc(host)}/podcast-manager?page=podcast&amp;podcastID=${pod._id}</link><language>en</language><ttl>60</ttl><itunes:author>${esc(ownerName)}</itunes:author><itunes:summary>${esc(pod.description)}</itunes:summary>` +
		`<itunes:explicit>no</itunes:explicit><itunes:image href="${esc(storage(host, pod.cover))}"/>${items}</channel></rss>`
}

// The shape rss-parser hands toolbox-podcast-player's /fetch (feed.items[] newest first, each with enclosure + itunes)
function parsedFeed(pod, eps, host, ownerName, rssUrl) {
	let items = eps.slice().reverse().map(e => ({
		title: e.title, creator: e.presenter, link: storage(host, e.mp3), pubDate: new Date(e.published).toUTCString(), content: e.description, contentSnippet: e.description,
		guid: storage(host, e.mp3), isoDate: iso(e.published), enclosure: {url: storage(host, e.mp3), length: String(e.fileSize), type: 'audio/mpeg'},
		itunes: {duration: String(Math.round(e.duration)), image: storage(host, e.cover || pod.cover || 'default.png'), author: e.presenter},
	}))
	return {
		title: pod.title, description: pod.description, feedUrl: rssUrl, link: `${host}/podcast-manager?page=podcast&podcastID=${pod._id}`, language: 'en', items,
		itunes: {image: storage(host, pod.cover), author: ownerName, summary: pod.description, explicit: 'no'},
	}
}

module.exports = {rssXml, parsedFeed, storage, PRESENTERS, podcasts, episodes, SCHOOLS_RAW, COURSES, iso}
