'use strict'
// Helpers shared by the server and every fixture module: the fake LTI session, deterministic ids,
// dates and placeholder media. Everything here is deterministic so A and B builds see identical data.

const APPS = process.env.SUITE_APPS || '/mnt/109313D2109313D2/sync/www/work/apps'

// Fixed "now" used in every fixture (the browser clock is frozen to this too, see lib/inject.js)
const NOW = Date.UTC(2026, 2, 2, 1, 0, 0) // 2026-03-02T01:00:00Z
const DAY = 86400000

// Deterministic 24-hex ObjectId-like ids: oid('photo', 3) -> stable
function oid(kind, n) {
	let h = 0
	let s = String(kind) + ':' + n
	for (let i = 0; i < s.length; i++) {
		h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0
	}
	let hex = ''
	let x = h || 1
	while (hex.length < 24) {
		x = (Math.imul(x, 1103515245) + 12345) >>> 0
		hex += x.toString(16).padStart(8, '0')
	}
	return hex.slice(0, 24)
}

// Deterministic uuid-ish
function uuid(kind, n) {
	let h = oid(kind, n) + oid(kind + 'x', n)
	return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`
}

const WORDS = 'the course content learning students assessment module week topic reading activity discussion quiz feedback resource example summary introduction outcome skills practice research analysis design project report theory method result'.split(' ')

// Deterministic lorem: lorem(seed, nWords)
function lorem(seed, n = 12) {
	let out = []
	let x = (seed * 2654435761) >>> 0
	for (let i = 0; i < n; i++) {
		x = (Math.imul(x, 1664525) + 1013904223) >>> 0
		out.push(WORDS[x % WORDS.length])
	}
	let s = out.join(' ')
	return s.charAt(0).toUpperCase() + s.slice(1) + '.'
}

// A placeholder image URL served by the harness (svg, any size)
function img(w = 320, h = 200, label = '') {
	return `/__fixtures/img/${w}x${h}.svg${label ? '?t=' + encodeURIComponent(label) : ''}`
}

const AUDIO = '/__fixtures/silence.wav'
const VIDEO_POSTER = img(640, 360, 'video')

// The logged in user. `access` mirrors si-manager's group list.
const USERS = {
	staff: {
		firstName: 'Test', lastName: 'Staff', fullName: 'Test Staff', initials: 'TS',
		userID: '2222', username: 'u1234567', email: 'Test.Staff@unisq.edu.au', isStudent: false,
		profile: 'https://lms.example.edu/user/profile.php?id=2222', lmsURL: 'localhost',
	},
	student: {
		firstName: 'Sam', lastName: 'Student', fullName: 'Sam Student', initials: 'SS',
		userID: '3333', username: 'u7654321', email: 'Sam.Student@umail.example.edu', isStudent: true,
		profile: 'https://lms.example.edu/user/profile.php?id=3333', lmsURL: 'localhost',
	},
}

const ALL_ACCESS = ['published', 'admin', 'beta', 'presentation-mode', 'toolbox-suggestions', 'content-template-editor', 'podcast-manager-admin', 'podcast-manager-beta']

// Build the object that GET /get-session-formatted returns as {data}
function buildSession(opts = {}) {
	let role = opts.role || 'staff'
	let user = Object.assign({}, USERS[role], opts.user || {})
	let access = opts.access || (role === 'staff' ? ALL_ACCESS : ['published'])
	user.access = access.slice()
	let activity = Object.assign({
		lmsURL: 'localhost',
		lmsName: 'Localhost',
		instanceID: '3333',
		contextID: '1111',
		courseID: 'ABC3001',
		courseLabel: 'ABC3001_2026_S1',
		courseTitle: 'Test Environment',
		courseCode: 'ABC3001',
	}, opts.activity || {})
	let raw = {
		context_id: activity.contextID,
		context_label: activity.courseLabel,
		context_title: activity.courseTitle,
		roles: role === 'staff' ? 'Instructor' : 'Learner',
		user_id: user.userID,
		ext_user_username: user.username,
		lis_person_name_given: user.firstName,
		lis_person_name_family: user.lastName,
		lis_person_name_full: user.fullName,
		lis_person_contact_email_primary: user.email,
		tool_consumer_instance_guid: activity.lmsURL,
		ext_lms: 'moodle-2',
		launch_presentation_locale: 'en',
	}
	return {user, activity, raw, access: user.access, flags: opts.flags || []}
}

module.exports = {APPS, NOW, DAY, oid, uuid, lorem, img, AUDIO, VIDEO_POSTER, USERS, ALL_ACCESS, buildSession}
