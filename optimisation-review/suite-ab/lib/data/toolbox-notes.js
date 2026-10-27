'use strict'
// Seed data for toolbox-notes: documents (HTML mirror of the Yjs state), comment threads with replies and reactions, revisions.
const {NOW, DAY, oid, lorem} = require('../shared')

const COURSE = 'ABC3001_2026_S1'
const ME = {userID: '2222', username: 'u1234567', fullName: 'Test Staff'}
const OTHERS = {
	priya: {userID: '4101', username: 'u4101', fullName: 'Priya Raman'},
	liam: {userID: '4102', username: 'u4102', fullName: "Liam O'Connor"},
	mei: {userID: '4103', username: 'u4103', fullName: 'Mei Tanaka'},
	helen: {userID: '4110', username: 'u4110', fullName: 'Dr Helen Fraser'},
}
const iso = ms => new Date(ms).toISOString()

const mark = (id, text) => `<span class="notes-comment-mark" data-comment-id="${id}">${text}</span>`

// Realistic note bodies, with comment anchors where a thread exists (anchor ids are the same ones the comments reference)
const BODIES = {
	week1: `<h2>Week 1 reading notes</h2>
<p>The core argument in the first reading is that <strong>reflective practice</strong> is a habit, not a task. ${mark('c-week1-a', 'Schon distinguishes reflection-in-action from reflection-on-action')}, and the unit assumes we will do both.</p>
<ul><li>Reflection-in-action: adjusting while you are doing the thing</li><li>Reflection-on-action: reviewing afterwards, ideally in writing</li><li>Reflection-for-action: planning what to do differently next time</li></ul>
<p><em>Question for the tutorial:</em> how do we evidence reflection-in-action when nothing is written down at the time?</p>
<p>${mark('c-week1-b', 'Key quote: "we reflect on the surprise"')} (page 54). Come back to this for Assessment 1.</p>`,
	a2: `<h2>Assessment 2 planning</h2>
<p>Due <strong>Friday week 9</strong>, 2000 words, weighted 40%.</p>
<table><tbody><tr><th>Section</th><th>Words</th><th>Status</th></tr><tr><td>Introduction</td><td>200</td><td>Draft done</td></tr><tr><td>Case description</td><td>500</td><td>Outline</td></tr><tr><td>Analysis</td><td>900</td><td>Not started</td></tr><tr><td>Conclusion</td><td>400</td><td>Not started</td></tr></tbody></table>
<p>${mark('c-a2-a', 'Ask the examiner whether the case can come from placement')} before committing to a topic.</p>
<ol><li>Pick the case</li><li>Find three peer-reviewed sources</li><li>Write the analysis first, intro last</li></ol>`,
	meeting: `<h2>Course team meeting</h2>
<p>Attendees: Helen, Test Staff, two tutors.</p>
<h3>Actions</h3>
<ul><li>Update the week 3 study guide so the due dates match the forum</li><li>Schedule the referencing drop-in</li><li>${mark('c-meet-a', 'Review the placement support wording in the unit profile')}</li></ul>
<p>Next meeting: <a href="https://example.edu/calendar">see the shared calendar</a>.</p>`,
	ideas: `<h2>Ideas for next semester</h2><p>${lorem(11, 28)}</p><p>${lorem(12, 24)}</p><ul><li>${lorem(13, 6)}</li><li>${lorem(14, 7)}</li><li>${lorem(15, 5)}</li></ul>`,
	feedback: `<h2>Feedback template</h2><p><strong>What went well</strong></p><p>${lorem(21, 20)}</p><p><strong>What to work on</strong></p><p>${lorem(22, 22)}</p><p><strong>Next step</strong></p><p>${lorem(23, 12)}</p>`,
	reading: `<h2>Reading list</h2><ol><li>Schon, D. (1983). The reflective practitioner.</li><li>Gibbs, G. (1988). Learning by doing.</li><li>Boud, D., Keogh, R. &amp; Walker, D. (1985). Reflection: turning experience into learning.</li><li>Moon, J. (2004). A handbook of reflective and experiential learning.</li></ol>`,
	shared: `<h2>Group glossary</h2><p>Add a term and a plain-language definition. Keep entries alphabetical.</p>
<table><tbody><tr><th>Term</th><th>Meaning</th></tr><tr><td>${mark('c-shared-a', 'Scaffolding')}</td><td>Temporary support that is withdrawn as skill grows</td></tr><tr><td>Formative</td><td>Assessment for learning, usually not graded</td></tr><tr><td>Summative</td><td>Assessment of learning, graded</td></tr><tr><td>Reflexivity</td><td>Awareness of how your own position shapes what you notice</td></tr></tbody></table>
<p><em>Last reviewed by the course team.</em></p>`,
}

function docs(courseLabel = COURSE) {
	let d = (n, title, visibility, owner, body, createdDaysAgo, updatedMinsAgo, extra = {}) => Object.assign({
		_id: oid('note', n), visibility, editorID: visibility === 'shared' ? 'blk-glossary' : null, courseLabel, courseID: '1111',
		ownerID: owner.userID, ownerUsername: owner.username, ownerFullName: owner.fullName, title, content: BODIES[body] || body,
		createdAt: iso(NOW - createdDaysAgo * DAY), updatedAt: iso(NOW - updatedMinsAgo * 60000),
		lastEditedBy: owner.userID, lastEditedByUsername: owner.username, lastEditedByFullName: owner.fullName, deleted: false,
	}, extra)
	return [
		d(1, 'Week 1 reading notes', 'private', ME, 'week1', 21, 90),
		d(2, 'Assessment 2 planning', 'private-staff-visible', ME, 'a2', 14, 300),
		d(3, 'Course team meeting', 'private-staff-visible', OTHERS.helen, 'meeting', 10, 1500),
		d(4, 'Ideas for next semester', 'private', ME, 'ideas', 30, 4200),
		d(5, 'Feedback template', 'private', ME, 'feedback', 25, 9000),
		d(6, 'Reading list', 'private-staff-visible', ME, 'reading', 40, 14000),
		d(7, 'Tutorial prep: week 4', 'private', ME, `<h2>Tutorial prep: week 4</h2><p>${lorem(31, 30)}</p>`, 5, 20000),
		d(8, 'Student questions to follow up', 'private-staff-visible', OTHERS.priya, `<h2>Questions</h2><ul><li>${lorem(32, 9)}</li><li>${lorem(33, 8)}</li></ul>`, 3, 25000),
		d(9, 'Placement checklist', 'private', ME, `<h2>Placement checklist</h2><ul><li>Agreement signed</li><li>Supervisor details</li><li>Insurance confirmation</li></ul>`, 12, 30000),
		d(10, 'Untitled note', 'private', ME, '', 1, 32000),
		d(11, 'Group glossary', 'shared', ME, 'shared', 18, 600, {title: 'Group glossary'}),
	]
}

function comments() {
	let r = (user, emoji) => ({emoji, userID: user.userID, username: user.username, fullName: user.fullName})
	let c = (docN, n, anchor, author, body, minsAgo, reactions, replies, edited) => ({
		_id: oid('note-comment', n), documentID: oid('note', docN), anchorID: anchor, authorID: author.userID, authorUsername: author.username, authorFullName: author.fullName,
		body, createdAt: iso(NOW - minsAgo * 60000), editedAt: edited ? iso(NOW - (minsAgo - 5) * 60000) : null, reactions: reactions || [], replies: replies || [],
	})
	let rep = (n, author, body, minsAgo, reactions, edited) => ({
		_id: oid('note-reply', n), authorID: author.userID, authorUsername: author.username, authorFullName: author.fullName, body, createdAt: iso(NOW - minsAgo * 60000),
		editedAt: edited ? iso(NOW - (minsAgo - 3) * 60000) : null, reactions: reactions || [],
	})
	return [
		c(1, 1, 'c-week1-a', ME, 'Worth quoting Schon directly here with the page number.', 2200, [r(OTHERS.priya, '👍'), r(OTHERS.liam, '👍'), r(ME, '❤️')], [
			rep(1, OTHERS.helen, 'Agreed, and link it to the Gibbs cycle from week 2.', 2100, [r(ME, '👍')]),
			rep(2, ME, 'Good idea, will add that in the next revision.', 2050, [], true),
			rep(3, OTHERS.mei, 'Is there a free copy of the chapter anywhere?', 1900, [r(OTHERS.liam, '👀'), r(ME, '👀'), r(OTHERS.helen, '👀')]),
		]),
		c(1, 2, 'c-week1-b', OTHERS.helen, 'Nice spot. Does this connect to the surprise idea in the Boud reading?', 1500, [r(ME, '😮')], [], true),
		c(2, 3, 'c-a2-a', OTHERS.helen, 'Yes, placement cases are encouraged, just remove client details.', 4000, [r(ME, '🎉'), r(OTHERS.priya, '🎉')], [
			rep(4, ME, 'Thanks, that settles it.', 3900, []),
		]),
		c(3, 4, 'c-meet-a', ME, 'Can we get the support line number in here too?', 1000, [], [
			rep(5, OTHERS.helen, 'Added to the unit profile draft.', 950, [r(ME, '😄')]),
			rep(6, OTHERS.priya, 'Thank you, that helps.', 900, []),
		]),
		c(11, 5, 'c-shared-a', OTHERS.liam, 'Maybe add a worked example for scaffolding?', 600, [r(OTHERS.mei, '👍'), r(ME, '👍'), r(OTHERS.helen, '👍'), r(OTHERS.priya, '👍'), r(OTHERS.liam, '👀')], [
			rep(7, ME, 'Good idea, can someone add one?', 580, []),
			rep(8, OTHERS.mei, 'I can add the classroom example.', 560, [r(ME, '🎉')]),
		]),
	]
}

function revisions() {
	let out = []
	let rv = (docN, n, minsAgo, who, label) => out.push({
		_id: oid('note-rev', n), documentID: oid('note', docN), createdAt: iso(NOW - minsAgo * 60000), editedBy: who.userID, editedByUsername: who.username, editedByFullName: who.fullName, label: label || null,
		snapshotHTML: `<h2>${docN === 11 ? 'Group glossary' : docN === 2 ? 'Assessment 2 planning' : 'Week 1 reading notes'}</h2>` + [1, 2, 3, 4].slice(0, 1 + (n % 4)).map(k => `<p>${lorem(n * 10 + k, 18)}</p>`).join(''),
	})
	rv(1, 1, 5000, ME)
	rv(1, 2, 3000, ME)
	rv(1, 3, 1000, OTHERS.helen, 'Restored from earlier version')
	rv(1, 4, 400, ME)
	rv(1, 5, 90, ME)
	rv(2, 6, 800, ME)
	rv(2, 7, 300, ME)
	rv(11, 8, 700, OTHERS.liam)
	rv(11, 9, 600, ME)
	return out
}

module.exports = {COURSE, ME, OTHERS, docs, comments, revisions, BODIES}
