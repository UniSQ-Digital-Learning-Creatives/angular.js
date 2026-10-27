'use strict'
// Shared by course-development-checklist (content + per-course check states) and course-development-reports (hundreds of courses).
const {NOW, DAY, oid, lorem} = require('../shared')

// Section blueprint: [associatedSection, header, description, [ [text, [children...]?] ... ]]
const BLUEPRINT = [
	['marker-getstarted', 'Get Started', 'Everything students see first. Complete these before the course opens.\nTick each item once it is done in your course site.', [
		['Course introduction video is embedded and has captions', []],
		['Welcome message in the <a href="https://docs.example.edu/leap/welcome" target="_blank">News forum</a> is scheduled', []],
		['Learning outcomes are listed and match the approved course profile', []],
		['Student expectations and netiquette are published', ['Netiquette page linked from the welcome page', 'Expectations page reviewed by the course examiner']],
		['Technical requirements are listed with links to <a href="https://docs.example.edu/leap/tech" target="_blank">support</a>', []],
		['Orientation activity is released and tracked by completion', []],
	]],
	['marker-courseactivity', 'Course Activity', 'The week-by-week learning activity. Each module should follow the shared template.', [
		['Each module has a clear overview, outcomes and estimated study time', []],
		['Readings link to the library reading list (no direct PDF uploads)', ['Reading list created for this offering', 'Every link checked in the last 4 weeks', 'Copyright statements present']],
		['Videos are captioned and hosted in the media platform', []],
		['Interactive content has an accessible alternative', ['Alternative text for diagrams', 'Transcript for audio', 'Keyboard-only walkthrough tested']],
		['Formative quizzes give feedback for every answer', []],
		['Every module ends with a short reflection prompt', []],
		['Activity completion is switched on for every required item', []],
		['Links to external sites open in a new tab and carry a note', []],
		['Page headings follow the style guide (H3 for module titles)', []],
		['Images have alt text; decorative images are marked as such', []],
	]],
	['marker-studyschedule', 'Study Schedule', 'The schedule is the main navigation tool students use.', [
		['Schedule table lists every week with dates for this offering', []],
		['Assessment due dates match the course profile', []],
		['Weekly workload estimate is shown', []],
		['Mid-semester break is marked', []],
		['Schedule downloads as a calendar file', []],
	]],
	['marker-assessments', 'Assessments', 'Assessment information has to be consistent with the course profile and Assessment Policy.', [
		['Assessment overview page lists every item, weighting and due date', []],
		['Each assessment has a task sheet, marking guide and submission link', ['Assessment 1: task sheet and rubric', 'Assessment 2: task sheet and rubric', 'Assessment 3: exam information and practice paper']],
		['Extension and late penalty information is linked from each assessment', []],
		['Submission drop boxes have the correct dates and file types', []],
		['Similarity checking is enabled where required', []],
		['Feedback return dates are published', []],
		['Exam arrangements are linked (including alternative arrangements)', []],
	]],
	['marker-forums', 'Forums', 'Forums should be set up with clear purposes and a visible moderation plan.', [
		['Q&A forum is available and monitored', []],
		['Discussion forums have a prompt and a rubric where graded', ['Prompt written for every forum', 'Grading rubric attached for graded forums']],
		['Staff response times are stated', []],
		['Social/introductions forum is open', []],
		['Forum subscriptions: staff are subscribed to Q&A forum', []],
	]],
	['marker-teachingstaff', 'Teaching Team', 'Students should know who is teaching them and how to reach them.', [
		['Course examiner details and photo are up to date', []],
		['Tutors and markers are listed with contact method and times', ['Tutor profiles added', 'Contact preferences confirmed']],
		['Consultation times are published', []],
		['Teaching team have access to the course site in the correct role', []],
	]],
	['marker-learningsupport', 'Learning Support', 'Links to student support services.', [
		['Library support block is present', []],
		['Academic skills support is linked', []],
		['Student wellbeing and accessibility services are linked', []],
		['IT help links are current', []],
	]],
	['marker-finalchecks', 'Final Checks', 'Last steps before release to students.', [
		['Course tested on a mobile device', []],
		['All dates reviewed for this offering', ['Dates in the schedule', 'Dates in assessments', 'Dates in forums']],
		['Course copied correctly from previous offering (no stale references)', []],
		['Accessibility check run and issues resolved', []],
		['Sign-off recorded by the course examiner', []],
	]],
]

// The two content versions: the latest (v2) and the older one some courses are locked to (v1: no Learning Support section)
function buildContent(version) {
	let blueprint = version === 1 ? BLUEPRINT.filter(b => b[0] !== 'marker-learningsupport') : BLUEPRINT
	let n = 0
	let sections = blueprint.map(([assoc, header, description, boxes], si) => ({
		_id: oid('cl-section-v' + version, si),
		header,
		associatedSection: assoc,
		sectionDescription: description,
		checkboxes: boxes.map(([text, children], bi) => {
			let box = {_id: oid('cl-box-v' + version, `${si}.${bi}`), text}
			if (version === 1) {
				// v1 had no help links in text
				box.text = text.replace(/<a [^>]*>([^<]*)<\/a>/g, '$1')
			}
			if (children.length) {
				box.checkboxes = children.map((c, ci) => ({_id: oid('cl-box-v' + version, `${si}.${bi}.${ci}`), text: c}))
			}
			n++
			return box
		}),
	}))
	return {
		_id: oid('cl-content', version),
		timestamp: NOW - (version === 1 ? 200 : 40) * DAY,
		title: 'Course Development Checklist',
		description: 'Work through each section before the course opens to students.\nThe checklist is only visible to staff and saves automatically.',
		helpLink: 'https://docs.example.edu/leap/checklist-help',
		version,
		sections,
	}
}

module.exports = {BLUEPRINT, buildContent}

// ---- reports: hundreds of course offerings ------------------------------------------------------------------------
const SCHOOL_CODES = [['SBUS', 'School of Business'], ['SEDU', 'School of Education'], ['SENG', 'School of Engineering'], ['SHCO', 'School of Humanities and Communication'], ['SNMW', 'School of Nursing and Midwifery'], ['SSCI', 'School of Science']]
const PREFIXES = ['ACC', 'BIO', 'CIV', 'COM', 'EDU', 'ENG', 'HLT', 'LAW', 'MAT', 'NUR', 'PSY', 'PHY', 'MKT', 'MGT', 'PAR', 'STA']
const PERIODS = ['S1', 'S2', 'S3', 'T1', 'T2']

function h32(str) {
	let h = 7
	for (let i = 0; i < str.length; i++) {
		h = (Math.imul(h, 31) + str.charCodeAt(i)) >>> 0
	}
	h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0
	return h
}

let cache = null

// Builds all six endpoint payloads once (pure function of nothing: no clock, no randomness)
function reportData(courseCount) {
	if (cache && cache.n === courseCount) {
		return cache
	}
	let content = buildContent(2)
	let sectionsOut = content.sections
	let labels = []
	for (let i = 0; i < courseCount; i++) {
		let year = 2023 + (i % 4)
		let code = PREFIXES[(i * 7) % PREFIXES.length] + (1000 + ((i * 37) % 4000))
		labels.push(`${code}_${year}_${PERIODS[(i * 3) % PERIODS.length]}`)
	}
	// a few non-standard labels the page has to cope with (year/teachingPeriod -> null)
	labels.splice(5, 0, 'SANDBOX-DEMO', 'ABC9999_TEST')
	labels = labels.filter((l, i) => labels.indexOf(l) === i)

	let progression = [], edit = [], teachers = [], clicks = [], readers = [], schools = []
	labels.forEach((label, ci) => {
		let h = h32(label)
		let bias = ((h >>> 3) % 100) / 100 // how far along this course is
		let versionNo = h % 7 === 0 ? 1 : 2
		let ver = versionNo === 1 ? buildContentCached(1) : content
		progression.push({
			_id: label, versionID: ver._id, versionObject: ver._id,
			sections: ver.sections.map((s, si) => ({
				associatedSection: s.associatedSection, header: s.header,
				checkboxes: s.checkboxes.flatMap(b => (b.checkboxes || [b])).map(b => ({checkbox: b._id, checkboxValue: (h32(b._id + label) % 100) / 100 < bias * (1.1 - si * 0.07)})),
			})),
		})
		let first = NOW - (30 + (h % 500)) * DAY
		let last = first + (1 + (h >>> 5) % 120) * DAY + (h % 86400) * 1000
		edit.push({_id: label, firstEditDate: first, lastEditDate: Math.min(last, NOW)})
		let tc = 1 + (h >>> 7) % 5
		teachers.push({_id: label, teachers: Array.from({length: tc}, (_, k) => `Staff.Member${(h >>> 9) % 40 + k}@unisq.edu.au`), teacherCount: tc})
		if (h % 11 !== 0) {
			let dc = (h >>> 11) % 60
			clicks.push({_id: label, documentationClickCount: dc})
			let rc = Math.min(tc, 1 + (h >>> 13) % 3)
			if (dc > 0) {
				readers.push({_id: label, teachersThatReadDoc: Array.from({length: rc}, (_, k) => `Staff.Member${(h >>> 9) % 40 + k}@unisq.edu.au`), teacherThatReadDocCount: rc})
			}
		}
		if (h % 13 !== 0 && /^[^_]+_\d{4}_/.test(label)) {
			let sc = SCHOOL_CODES[(h >>> 4) % SCHOOL_CODES.length]
			let year = +label.split('_')[1]
			let tp = label.split('_')[2]
			let startM = tp === 'S1' ? 1 : tp === 'S2' ? 6 : 10
			let start = Date.UTC(year, startM, 1 + (h % 10)) / 1000
			schools.push({_id: label, Course: label, School: sc[0], SchoolDescription: sc[1], StartDate: start, EndDate: start + 17 * 7 * 86400})
		}
	})
	cache = {n: courseCount, labels, progression, edit, teachers, clicks, readers, schools}
	return cache
}

let v1 = null
function buildContentCached(v) {
	return v === 1 ? (v1 = v1 || buildContent(1)) : buildContent(2)
}

module.exports.reportData = reportData
