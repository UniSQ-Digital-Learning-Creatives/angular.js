'use strict'
// Reaction bar data: a deterministic population of students reacting to a set of page elements, aggregated exactly like
// calculateCourseAverage() in toolbox-reaction-bar/index.js so /fetch-dashboard-data has the real response shape.
const {oid, uuid, lorem} = require('../shared')

function h(str) {
	let x = 2166136261
	for (let i = 0; i < str.length; i++) {
		x = Math.imul(x ^ str.charCodeAt(i), 16777619) >>> 0
	}
	return x
}

const FIRST = ['Ava', 'Noah', 'Mia', 'Liam', 'Isla', 'Ethan', 'Zoe', 'Lucas', 'Ruby', 'Jack', 'Chloe', 'Oscar', 'Grace', 'Leo', 'Ella', 'Henry', 'Lily', 'Mason', 'Sophie', 'Archie']
const LAST = ['Nguyen', 'Smith', 'Patel', 'Brown', 'Williams', 'Taylor', 'Lee', 'Wilson', 'Martin', 'Kelly', 'Singh', 'Jones']

const STUDENTS = []
for (let i = 0; i < 40; i++) {
	STUDENTS.push({username: `u${8100000 + i * 13}`, name: `${FIRST[i % FIRST.length]} ${LAST[(i * 5) % LAST.length]}`})
}

// type -> [{title, sub-type}]
const ELEMENTS = {
	ilar: [['Week 1 introductions', 'group-discussion'], ['Latest announcements', 'latest-announcements'], ['Podcast: Voices from the Darling Downs', 'podcast-player'], ['Pronunciation guide: heart terms', 'pronunciation-ilar'], ['Campus 360 tour', 'photospheres']],
	h5p: [['Accordion: key concepts', 'accordion'], ['Quiz: week 3 recall', 'multiple-choice'], ['Interactive video: lab safety', 'interactive-video'], ['Drag the words: terminology', 'drag-the-words'], ['Flashcards: vocabulary', 'flashcards']],
	page: [['Module 1 overview', 'module'], ['Assessment 1 brief', 'assessment'], ['Week 5 readings', 'week']],
	video: [['Welcome from your lecturer', 'welcome'], ['Lab walkthrough', 'lab']],
	photo: [['Reflection prompt gallery', 'gallery']],
}

const COMMENTS = [
	'Really clear explanation, thank you.', 'I would have liked an example here.', 'The video was too long for the content.', 'Loved the interactive quiz, very helpful for revision.',
	'The audio quality was poor in the second half.', 'This helped me understand the assessment criteria.', 'Could there be a transcript for this?', 'Great resource, I shared it with my study group.',
	'The instructions were confusing at first.', 'More practice questions please!', 'Perfect length and well paced.', 'I could not get the drag and drop to work on my phone.',
	'Helpful, but the font was a bit small on mobile.', 'This is the clearest summary of the topic so far.', 'The second question seemed to have two right answers.', 'Please add captions to the video.',
	'I watched this twice before the tutorial and it made all the difference.', 'Not sure how this links to the assessment.', 'Brilliant, more of these please.', 'The links on this page were broken for me.',
	'Good pacing, and the worked example at the end was the best part.', 'I found the terminology section hard to follow.', 'Would love a downloadable version of this.', 'The quiz feedback explained my mistakes well.',
	'Easy to use on my phone during my commute.', 'The images did not load for me on the first try.', 'Short and to the point, thanks.', 'I think the answer to question four is wrong.',
	'This made the readings make sense.', 'The discussion prompts were thoughtful.', 'Too much text on one page.', 'Excellent, I used this to prepare my first assessment.',
	'The audio was a little quiet.', 'It would help to have the slides as well.', 'Really enjoyed the case study.', 'The timeline activity was fun and useful.',
]

// Every (student, element) reaction: {username,name,type,sub-type,title,uuid,positive,negative,feedback}
function reactions() {
	let out = []
	let used = {}
	for (let type of Object.keys(ELEMENTS)) {
		ELEMENTS[type].forEach(([title, sub], ei) => {
			let elementUuid = uuid('rb-element', type + ei)
			STUDENTS.forEach((s, si) => {
				let r = h(`${type}|${ei}|${si}`)
				// ~65% of students react to any given element; ~75% of reactions positive; ~25% leave a comment
				if (r % 100 >= 65) {
					return
				}
				let positive = ((r >>> 8) % 100) < 75
				let feedback = ''
				if (((r >>> 16) % 100) < 25) {
					// unique per element: the dashboard repeats comments without `track by`, so duplicates would throw ngRepeat:dupes (a real app limitation)
					let k = (r >>> 4) % COMMENTS.length
					let key = type + ei
					used[key] = used[key] || {}
					while (used[key][k]) {
						k = (k + 1) % COMMENTS.length
					}
					used[key][k] = true
					feedback = COMMENTS[k]
				}
				out.push({username: s.username, name: s.name, type, 'sub-type': sub, title, uuid: elementUuid, positive, negative: !positive, feedback})
			})
		})
	}
	return out
}

// Mirrors the server's orderedByTypes + course averages. `subset` filters reactions (the course) vs all (the USQ-wide averages).
function aggregate(list, students) {
	let general = {studentsLoggedIn: students, studentsLeftFeedback: 0, courseFeedbackRating: 0, usqFeedbackRating: 0, totalComments: 0, positiveFeedback: 0, negativeFeedback: 0, comments: []}
	let byType = {}
	let who = new Set()
	for (let r of list) {
		who.add(r.username)
		general.positiveFeedback += r.positive ? 1 : 0
		general.negativeFeedback += r.negative ? 1 : 0
		if (r.feedback) {
			general.comments.push({uuid: r.uuid, name: r.name, username: r.username, feedback: r.feedback, type: r.type, 'sub-type': r['sub-type'], title: r.title})
		}
		let g = byType[r.type] = byType[r.type] || {
			title: r.title, _id: parseInt(oid('rb-type', r.type).slice(0, 8), 16), 'sub-type': r['sub-type'], studentsLeftFeedback: 0, feedback: [], courseFeedbackRating: 0, totalComments: 0,
			positiveFeedback: 0, negativeFeedback: 0, items: {}, allItems: [], titleAsLabel: !r['sub-type'],
		}
		g.title = r.title
		g['sub-type'] = r['sub-type']
		g.studentsLeftFeedback++
		if (r.feedback) {
			g.totalComments++
			g.feedback.push(r.feedback)
		}
		g.positiveFeedback += r.positive ? 1 : 0
		g.negativeFeedback += r.negative ? 1 : 0
		let total = g.positiveFeedback + g.negativeFeedback
		if (total > 0) {
			g.courseFeedbackRating = g.positiveFeedback / total * 100
		}
		let it = g.items[r.title] = g.items[r.title] || {
			title: r.title, _id: parseInt(oid('rb-item', r.title).slice(0, 8), 16), 'sub-type': r['sub-type'], titleAsLabel: !r['sub-type'], positiveFeedback: 0, negativeFeedback: 0,
			courseFeedbackRating: 0, usqFeedbackRating: 0, studentsLeftFeedback: 0, totalComments: 0, comments: [],
		}
		it.studentsLeftFeedback++
		if (r.feedback) {
			it.totalComments++
			it.comments.push(r.feedback)
		}
		it.positiveFeedback += r.positive ? 1 : 0
		it.negativeFeedback += r.negative ? 1 : 0
		let t2 = it.positiveFeedback + it.negativeFeedback
		if (t2 > 0) {
			it.courseFeedbackRating = it.positiveFeedback / t2 * 100
		}
		g.allItems.push({title: r.title, _id: it._id, uuid: r.uuid, type: r.type, 'sub-type': r['sub-type'], positive: r.positive, negative: r.negative, feedback: r.feedback})
	}
	let tot = general.positiveFeedback + general.negativeFeedback
	general.courseFeedbackRating = tot ? general.positiveFeedback / tot * 100 : 0
	general.totalComments = general.comments.length
	general.studentsLeftFeedback = who.size
	return {general, items: byType}
}

// GET /fetch-dashboard-data: the course is a slice of the population (the first 28 students), the USQ-wide block is a bigger, differently weighted one
function dashboardData() {
	let all = reactions()
	let course = aggregate(all.filter(r => STUDENTS.findIndex(s => s.username === r.username) < 28), 31)
	let usq = aggregate(all.concat(all.filter((r, i) => i % 3 === 0).map(r => Object.assign({}, r, {username: 'x' + r.username, positive: !r.positive, negative: r.positive}))), 2400)
	return {general: usq.general, generalByType: usq.items, course: course.general, groups: course.items}
}

// GET /get-reaction-data for a bar: some uuids (derived, so any page gets a stable state) already carry a reaction/comment
function reactionFor(uuidStr) {
	let r = h(String(uuidStr))
	let state = r % 5
	return {
		_id: oid('rb-reaction', uuidStr), feature: 'Reaction', timestamp: 0,
		positive: state === 1 || state === 2 ? true : false, negative: state === 3 ? true : false,
		feedback: state === 2 ? 'This was exactly what I needed before the quiz, thanks.' : '',
	}
}

module.exports = {STUDENTS, ELEMENTS, reactions, dashboardData, reactionFor}

// uuid of a bar, computed with the app's own vendored uuidv5 (main.js: uuidv5(JSON.stringify(item), uuidv5.URL))
let uuidFn = null
function uuidOfItem(item) {
	if (!uuidFn) {
		const vm = require('vm')
		const fs = require('fs')
		const {APPS} = require('../shared')
		const sandbox = {unescape, encodeURIComponent, Uint8Array, window: {}}
		vm.runInNewContext(fs.readFileSync(`${APPS}/toolbox-reaction-bar/public/sys/js/uuidv5.js`, 'utf8'), sandbox)
		uuidFn = sandbox.window.uuidv5
	}
	return uuidFn(JSON.stringify(item), uuidFn.URL)
}

module.exports.uuidOfItem = uuidOfItem
