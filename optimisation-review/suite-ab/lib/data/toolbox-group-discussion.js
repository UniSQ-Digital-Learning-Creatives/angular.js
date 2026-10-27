'use strict'
// Data + in-browser fake socket server for toolbox-group-discussion.
// The real UI is driven only by socket.io events ('sync' carries every message), and the harness's socket stub never
// delivers any, so the fixture serves the discussion page with a small script injected right after the (stubbed)
// socket.io client: it wraps io() and answers register / new-message / toggle-reaction / edit / delete the way index.js does.
const {NOW, DAY, oid, img} = require('../shared')

const COURSE = 'ABC3001_2026_S1'
const ME = '2222'

const PEOPLE = [
	{userID: ME, name: 'Test Staff', username: 'u1234567', isStudent: false, email: 'Test.Staff@unisq.edu.au'},
	{userID: '4101', name: 'Priya Raman', username: 'u4101', isStudent: true},
	{userID: '4102', name: "Liam O'Connor", username: 'u4102', isStudent: true},
	{userID: '4103', name: 'Mei Tanaka', username: 'u4103', isStudent: true},
	{userID: '4104', name: 'Jack Thompson', username: 'u4104', isStudent: true},
	{userID: '4105', name: 'Aisha Khan', username: 'u4105', isStudent: true},
	{userID: '4106', name: 'Tom Nguyen', username: 'u4106', isStudent: true},
	{userID: '4107', name: 'Sophie Williams', username: 'u4107', isStudent: true},
	{userID: '4108', name: 'Daniel Okafor', username: 'u4108', isStudent: true},
	{userID: '4109', name: 'Chloe Martin', username: 'u4109', isStudent: true},
	{userID: '4110', name: 'Dr Helen Fraser', username: 'u4110', isStudent: false},
	{userID: '4111', name: 'Marcus Lee', username: 'u4111', isStudent: true},
].map(p => {
	let parts = p.name.split(' ')
	return Object.assign({
		firstName: parts[0], lastName: parts.slice(1).join(' '), initials: parts[0][0] + parts[parts.length - 1][0],
		email: `${parts[0]}.${parts[parts.length - 1]}@umail.example.edu`.replace(/'/g, ''),
		profile: `https://lms.example.edu/user/profile.php?id=${p.userID}`,
	}, p)
})
const byID = {}
PEOPLE.forEach(p => byID[p.userID] = p)

const roster = () => PEOPLE.filter(p => p.userID !== 'none').map(p => ({userID: p.userID, name: p.name, username: p.username, isStudent: p.isStudent}))

// The big discussion: [key, user, minutesAgo, text, opts]
// opts: reply (key), image, link {url,title,description,hostname,image}, anon, mentions [userIDs], everyone, react {emoji:[ids]}, edited, deleted, seen (bool, default true)
const L = {
	ethics: {url: 'https://www.example.edu/guides/ethics-in-practice', hostname: 'www.example.edu', title: 'Ethics in practice: a short guide for placement students', description: 'What to do when a client asks for something that does not feel right, and who to call before you act.', image: img(320, 180, 'ethics')},
	reflect: {url: 'https://reflective-writing.example.org/gibbs-cycle', hostname: 'reflective-writing.example.org', title: "Gibbs' reflective cycle explained", description: 'Six stages from description to action plan, with worked examples.', image: null},
	podcast: {url: 'https://podcasts.example.com/episodes/placement-stories-12', hostname: 'podcasts.example.com', title: 'Placement stories, episode 12: the first week', description: 'Three graduates talk about what they wish they had known on day one.', image: img(320, 180, 'podcast')},
	news: {url: 'https://news.example.com/education/workplace-learning-trends', hostname: 'news.example.com', title: 'Workplace learning trends for 2026', description: '', image: img(320, 180, 'news')},
}
const MAIN = [
	['m1', 'Dr Helen Fraser', 3 * 1440 + 380, 'Welcome to the Week 3 forum. This week we reflect on your placement so far. Share one moment that challenged your assumptions, and reply to at least two classmates. @everyone please post by Friday.', {everyone: true, react: {'👍': ['4101', '4102', '4103', '4105', '4107', ME], '👏': ['4104', '4106']}}],
	['m2', 'Priya Raman', 3 * 1440 + 301, 'My first week was mostly shadowing, and I was surprised by how much of the job is listening rather than advising.', {react: {'❤️': ['4110', '4103']}}],
	['m3', 'Liam O\'Connor', 3 * 1440 + 288, 'Same here. I expected to be handed tasks straight away but my supervisor wanted me to watch three full client meetings first.', {reply: 'm2', react: {'👍': ['4101']}}],
	['m4', 'Mei Tanaka', 3 * 1440 + 240, 'This guide helped me think about the ethics side before I started: https://www.example.edu/guides/ethics-in-practice', {link: L.ethics, react: {'👍': ['4101', '4102', '4108'], '😮': ['4104'], '❤️': ['4106', ME]}}],
	['m5', 'Jack Thompson', 3 * 1440 + 120, 'I found the paperwork overwhelming. Nobody tells you how many forms there are.', {react: {'😂': ['4105', '4106', '4107', '4109'], '😢': ['4101']}}],
	['m6', 'Aisha Khan', 3 * 1440 + 95, '@Jack Thompson you are not alone, I spent two days just learning the filing system.', {reply: 'm5', mentions: ['4104']}],
	['m7', 'Anonymous', 3 * 1440 + 60, 'I do not feel supported by my placement supervisor and I am not sure who to tell. Has anyone been in this situation?', {anon: '4108', react: {'❤️': ['4101', '4103', '4105', '4110', ME], '👍': ['4107']}}],
	['m8', 'Dr Helen Fraser', 3 * 1440 + 30, 'Thank you for raising that. Please contact me directly, or use the placement support line (details are in the unit profile). You are always entitled to support.', {reply: 'm7', react: {'👍': ['4108', '4101', '4103']}}],
	['m9', 'Test Staff', 2 * 1440 + 600, 'A reminder that reflections are assessed on depth, not length. Gibbs works well: https://reflective-writing.example.org/gibbs-cycle', {link: L.reflect, react: {'👍': ['4101', '4102']}}],
	['m10', 'Sophie Williams', 2 * 1440 + 540, 'Here is a photo of the whiteboard my team used to plan the week, it really helped me see how they prioritise.', {image: {url: img(480, 320, 'whiteboard'), width: 480, height: 320}, react: {'😮': ['4102', '4109'], '👏': ['4101']}}],
	['m11', 'Daniel Okafor', 2 * 1440 + 480, 'Love that. Does anyone know if we are allowed to share photos like this? Might need to check the confidentiality agreement.', {reply: 'm10'}],
	['m12', 'Test Staff', 2 * 1440 + 470, 'Good catch @Daniel Okafor. Blur anything with client details and check with your supervisor first.', {reply: 'm11', mentions: ['4108'], react: {'👍': ['4108', '4110']}}],
	['m13', 'Chloe Martin', 2 * 1440 + 300, 'I listened to this on the bus and it made the nerves a lot better: https://podcasts.example.com/episodes/placement-stories-12', {link: L.podcast, react: {'❤️': ['4101', '4104', '4105', '4106']}}],
	['m14', 'Marcus Lee', 2 * 1440 + 200, 'Question: is the reflection due Friday 5pm or Sunday midnight? The forum says one thing and the study guide says another.', {react: {'😮': ['4102']}}],
	['m15', 'Dr Helen Fraser', 2 * 1440 + 150, 'Good question @Marcus Lee: Friday 5pm for the forum post, Sunday midnight for the written reflection. I will fix the study guide.', {reply: 'm14', mentions: ['4111'], react: {'👍': ['4111', '4102', '4107'], '👏': ['4109']}}],
	['m16', 'Tom Nguyen', 1440 + 800, 'This is what my desk looks like. Standing desk, two monitors, and a very friendly cat.', {image: {url: img(360, 480, 'desk'), width: 360, height: 480}, react: {'😂': ['4101', '4103', '4104'], '❤️': ['4105', ME]}}],
	['m17', 'Priya Raman', 1440 + 700, 'Is that a real cat or a cushion?', {reply: 'm16', react: {'😂': ['4106']}}],
	['m18', 'Tom Nguyen', 1440 + 690, 'Real cat. Her name is Excel.', {reply: 'm17', react: {'😂': ['4101', '4102', '4107', '4109', '4111']}}],
	['m19', 'Aisha Khan', 1440 + 400, 'Reading about workplace learning trends this week, the shift to short-form mentoring matches what I saw: https://news.example.com/education/workplace-learning-trends', {link: L.news}],
	['m20', 'Jack Thompson', 1440 + 380, 'Short-form mentoring sounds nice in theory, mine was a ten minute catch-up on Fridays. Better than nothing though.', {reply: 'm19', react: {'👍': ['4105']}}],
	['m21', 'Anonymous', 1440 + 200, 'Honestly I am thinking about changing my specialisation after this placement. Is it too late?', {anon: '4106', react: {'❤️': ['4101', '4102', '4103'], '👍': ['4107', '4109']}}],
	['m22', 'Test Staff', 1440 + 150, 'It is not too late. Book a time with the course adviser and bring your reflections, they are good evidence of what you do and do not enjoy.', {reply: 'm21', react: {'👏': ['4101', '4106']}}],
	['m23', 'Liam O\'Connor', 700, 'Posting my draft reflection outline for feedback. Context, what surprised me, what I would do differently, next steps. Thoughts?', {}],
	['m24', 'Mei Tanaka', 640, 'Looks solid. Maybe add a line on how your values shaped what you noticed?', {reply: 'm23', react: {'👍': ['4102']}, seen: true}],
	['m25', 'Sophie Williams', 300, 'Sharing the template my group made, feel free to reuse it.', {image: {url: img(520, 300, 'template'), width: 520, height: 300}, react: {'👏': ['4101', '4103', ME]}, seen: false}],
	['m26', 'Chloe Martin', 180, '@Test Staff would you be able to run a quick session on referencing placement documents before the deadline?', {mentions: [ME], seen: false}],
	['m27', 'Dr Helen Fraser', 120, 'Great idea @Chloe Martin. We will add a 20 minute drop-in on Thursday at 12:30, link in the announcements.', {reply: 'm26', mentions: ['4109'], seen: false, react: {'👍': ['4109']}}],
	['m28', 'Anonymous', 90, 'Thank you all, I contacted Helen and things are already much better.', {anon: '4108', reply: 'm7', seen: false, react: {'❤️': ['4101', '4103', '4105', '4110', ME, '4102'], '👏': ['4107', '4109']}}],
	['m29', 'Marcus Lee', 45, 'Quick one: does anyone have the link to the placement agreement template? Cannot find it.', {seen: false}],
	['m30', 'Test Staff', 20, 'It is in the Week 3 block, under "Placement documents". I will pin a link in the announcements too.', {reply: 'm29', seen: false}],
	['m31', 'Priya Raman', 8, 'Thanks everyone, this thread has been really useful! 😊', {seen: false, react: {'❤️': ['4102', '4103']}}],
	['m32', 'Jack Thompson', 5, 'This message was removed.', {deleted: 'Jack Thompson'}],
	['m33', 'Aisha Khan', 2, 'Last post from me for tonight, good luck with the drafts everyone.', {edited: true, seen: false, react: {'👍': ['4101', '4102', '4103', '4104', '4105', '4106'], '❤️': ['4107', '4108', '4109', '4110', '4111', ME]}}],
]

function build(discussionID, courseLabel, title, specs) {
	const roomID = `${courseLabel} - ${discussionID}`
	const keyToId = {}
	specs.forEach(s => keyToId[s[0]] = oid('gd:' + discussionID, s[0]))
	return specs.map(([key, name, minutesAgo, text, o]) => {
		o = o || {}
		let author = o.anon ? byID[o.anon] : PEOPLE.find(p => p.name === name)
		let ts = NOW - minutesAgo * 60000
		let own = author.userID === ME
		let row = {
			_id: keyToId[key],
			replyTo: o.reply ? keyToId[o.reply] : null,
			activityID: roomID,
			userID: author.userID, username: author.username, firstName: author.firstName, lastName: author.lastName, initials: author.initials,
			name: author.name, email: author.email, profile: author.profile,
			courseLabel, discussionID, page: 'https://lms.example.edu/mod/page/view.php?id=77',
			message: text, title, mentions: (o.mentions || []).map(id => ({userID: id, name: byID[id].name})), mentionsEveryone: !!o.everyone,
			image: o.image || null, anonymous: !!o.anon, rawMessage: true,
			date: new Date(ts).toISOString(), timestamp: ts,
			viewed: own || o.seen === false ? [] : [ME],
			reactions: o.react || {},
		}
		if (o.link) {
			row.linkPreview = o.link
		}
		else if (o.link === undefined) {
			row.linkPreview = null
		}
		if (o.edited) {
			row.edited = {date: new Date(ts + 120000).toISOString(), userID: author.userID, email: author.email}
		}
		if (o.deleted) {
			row.deleted = {date: new Date(ts + 60000).toISOString(), userID: author.userID, email: author.email}
		}
		if (o.anon) {
			// what the author's own socket sees; everyone else gets the redacted version from the (fake) server
			row.__realUserID = author.userID
		}
		return row
	})
}

// Smaller generated discussions for the catch-up list
const TOPICS = [
	['intro-forum', 'Introduce yourself', ['Hello everyone, I am studying part time and working in a school office.', 'Welcome! I am in the same boat, evenings are best for me.', 'Looking forward to the semester.', 'Hi all, first time on this platform so please be patient with me.']],
	['assessment-1-qa', 'Assessment 1 questions', ['Does the word count include the reference list?', 'No, the reference list is excluded. See the marking guide.', 'Can we use first person in the reflection?', 'Yes, first person is expected.', 'Are tables counted in the word limit?']],
	['week-5-case', 'Week 5: case study discussion', ['I think the key issue in the case is the lack of consent.', 'Agreed, but the organisation also had no escalation path.', 'What would you have done differently as the practitioner?', 'I would have documented the conversation earlier.']],
	['study-group', 'Find a study group', ['Anyone in Brisbane keen to meet on campus on Wednesdays?', 'I am online only but happy to do a video call.', 'Count me in for the online group.']],
	['resources-share', 'Share useful resources', ['I found a great free tool for annotating PDFs.', 'Thanks! Is it available on Mac too?', 'Yes, and in the browser.', 'Library has a guide for citing podcasts, in case it helps anyone.', 'That is very handy thank you.']],
	['exam-prep', 'Exam preparation', ['Is anyone making a revision timetable?', 'I will share mine at the weekend.', 'What topics do you think will be heavily weighted?']],
	['feedback-corner', 'Feedback corner', ['The new tutorial format is great, thanks for listening to feedback.', 'Agree, recordings are posted much faster now.']],
]

function smallDiscussion(i, discussionID, title, texts, courseLabel) {
	let others = PEOPLE.filter(p => p.userID !== ME)
	let specs = texts.map((t, k) => {
		let author = others[(i * 3 + k * 2) % others.length]
		let key = 'k' + k
		let o = {seen: k < texts.length - 1 - (i % 3) ? true : false}
		if (k > 0 && k % 2 === 1) {
			o.reply = 'k' + (k - 1)
		}
		if ((i + k) % 4 === 0) {
			o.react = {'👍': [others[(k + 1) % others.length].userID, others[(k + 2) % others.length].userID]}
		}
		return [key, author.name, (i + 1) * 360 + (texts.length - k) * 25, t, o]
	})
	return build(discussionID, courseLabel, title, specs)
}

const MAIN_ID = 'week-3-forum'
const MAIN_TITLE = 'Week 3: Reflecting on your placement'

function discussions(courseLabel = COURSE) {
	let out = [{discussionID: MAIN_ID, title: MAIN_TITLE, rows: build(MAIN_ID, courseLabel, MAIN_TITLE, MAIN)}]
	TOPICS.forEach((t, i) => out.push({discussionID: t[0], title: t[1], rows: smallDiscussion(i, t[0], t[1], t[2], courseLabel)}))
	return out
}

function rowsFor(discussionID, courseLabel, title) {
	let found = discussions(courseLabel).find(d => d.discussionID === discussionID)
	return found ? found.rows : build(discussionID, courseLabel, title || discussionID, MAIN.slice(0, 12).map(s => s))
}

// The catch-up list, in the shape catchUpDiscussions() returns
function catchUp(courseLabel = COURSE) {
	let titles = {ABC3001_2026_S1: 'Test Environment'}
	let list = discussions(courseLabel).map((d, i) => {
		let live = d.rows.filter(r => !r.deleted)
		let unseen = live.filter(r => r.userID !== ME && !(r.viewed || []).includes(ME))
		let mineIds = new Set(live.filter(r => r.userID === ME).map(r => r._id))
		let direct = unseen.filter(r => (r.mentions || []).some(mn => mn.userID === ME) || (r.replyTo && mineIds.has(r.replyTo)))
		let last = live[live.length - 1]
		return {
			roomID: `${courseLabel} - ${d.discussionID}`, discussionID: d.discussionID, courseLabel, title: d.title, courseTitle: titles[courseLabel] || courseLabel,
			page: 'https://lms.example.edu/mod/page/view.php?id=' + (70 + i), cdtID: 'cdt-' + (i + 1),
			count: live.length, unread: unseen.length, direct: direct.length, firstUnread: unseen.length ? unseen[0]._id : null,
			last: {postID: last._id, author: last.userID === ME ? 'You' : (last.anonymous ? 'Anonymous' : last.name), excerpt: last.message.length > 140 ? last.message.slice(0, 140) + '…' : last.message, timestamp: last.timestamp},
		}
	})
	return list.sort((a, b) => b.last.timestamp - a.last.timestamp)
}

// ---- in-browser fake server -------------------------------------------------------------------------------------------
function fakeServer(cfg) {
	var rows = cfg.rows
	var counter = 0
	var PEOPLE = cfg.people
	var NOWMS = cfg.now
	function byId(id) {
		for (var i = 0; i < rows.length; i++) {
			if (rows[i]._id === id) {
				return rows[i]
			}
		}
	}
	function me() {
		return (window.m && window.m.user) || {userID: cfg.me, username: 'u1234567', firstName: 'Test', lastName: 'Staff', initials: 'TS', fullName: 'Test Staff', email: 'Test.Staff@unisq.edu.au', profile: ''}
	}
	// what index.js's redactForBroadcast does for the viewer's socket (the viewer is always ME here)
	function out(row) {
		var r = JSON.parse(JSON.stringify(row))
		if (r.anonymous && r.userID !== me().userID) {
			r.userID = 'anonymous'
			r.name = 'Anonymous'
			r.firstName = 'Anonymous'
			r.lastName = ''
			r.initials = '?'
			delete r.email
			delete r.profile
		}
		delete r.__realUserID
		return r
	}
	function pad(n) {
		return ('000000000000' + n).slice(-8)
	}
	function install(sock) {
		// the app's analytics calls read m.socket.io.engine.transport.query.transport, which the harness stub lacks
		sock.io.engine = {transport: {query: {transport: 'websocket'}}}
		var realEmit = sock.emit
		function fire(ev, data, delay) {
			setTimeout(function () {
				sock.__fire(ev, data)
			}, delay || 15)
		}
		sock.emit = function (ev, data) {
			realEmit.apply(sock, arguments)
			if (ev === 'register') {
				fire('register', {room: cfg.room})
				fire('sync currently connected', cfg.connected, 20)
				fire('sync', rows.map(out), 30)
			}
			else if (ev === 'sync') {
				fire('sync', rows.map(out))
			}
			else if (ev === 'toggle-reaction') {
				var row = byId(data.rowID)
				if (row && cfg.palette.indexOf(data.emoji) > -1) {
					var list = row.reactions[data.emoji] || []
					var at = list.indexOf(me().userID)
					if (at > -1) {
						list.splice(at, 1)
					}
					else {
						list.push(me().userID)
					}
					if (list.length) {
						row.reactions[data.emoji] = list
					}
					else {
						delete row.reactions[data.emoji]
					}
					// the real server sends just {_id, reactions}; main.js then runs setDayTime() on the patch, and with no date Date.create(undefined) is
					// 'now', so the post's shown time jumps to the current time (an app bug). `date` is added here so the output does not depend on the clock
					fire('sync', [{_id: row._id, date: row.date, reactions: JSON.parse(JSON.stringify(row.reactions))}])
				}
			}
			else if (ev === 'new-message') {
				counter++
				var u = me()
				var ts = NOWMS + counter * 60000
				var msg = {
					_id: 'ab0000000000000000' + pad(counter), replyTo: data.replyTo || null, activityID: cfg.room, userID: u.userID, username: u.username,
					firstName: u.firstName, lastName: u.lastName, initials: u.initials, name: u.fullName, email: u.email, profile: u.profile,
					courseLabel: data.courseLabel, discussionID: data.discussionID, page: data.page, message: data.message, title: data.title,
					mentions: data.mentions || [], mentionsEveryone: !!data.mentionsEveryone, image: data.image || null, anonymous: !!data.anonymous,
					rawMessage: true, date: new Date(ts).toISOString(), timestamp: ts, viewed: [], reactions: {},
				}
				rows.push(msg)
				fire('sync', [out(msg)])
				var m = /https?:\/\/[^\s<]+/.exec(data.message || '')
				if (m) {
					var lp = {url: m[0], title: 'Example page for ' + m[0].replace(/^https?:\/\//, '').split('/')[0], description: 'A preview generated for the posted link.', image: null, hostname: m[0].replace(/^https?:\/\//, '').split('/')[0]}
					msg.linkPreview = lp
					fire('sync', [{_id: msg._id, date: msg.date, linkPreview: lp}], 60)
				}
			}
			else if (ev === 'edit message') {
				var er = byId(data._id)
				if (er) {
					er.message = data.message
					er.mentions = data.mentions || []
					er.mentionsEveryone = !!data.mentionsEveryone
					er.image = data.image || null
					er.linkPreview = null
					er.edited = {date: new Date(NOWMS + 3600000).toISOString(), userID: me().userID, email: me().email}
					fire('sync', [out(er)])
				}
			}
			else if (ev === 'delete message') {
				var dr = byId(data.message._id)
				if (dr) {
					dr.deleted = {date: new Date(NOWMS + 3600000).toISOString(), userID: me().userID, email: me().email}
					fire('sync', [out(dr)])
				}
			}
		}
	}
	var realIO = window.io
	window.io = function () {
		var s = realIO.apply(this, arguments)
		install(s)
		return s
	}
	window.io.connect = window.io
}

function serverScript(discussionID, courseLabel, title) {
	let rows = rowsFor(discussionID, courseLabel, title)
	// the viewer sees anonymous posts by others redacted; his own anonymous ones (userID === ME) stay as they are
	let cfg = {
		rows, people: PEOPLE.map(p => ({userID: p.userID, name: p.name})), now: NOW, me: ME, room: `${courseLabel} - ${discussionID}`,
		connected: [ME, '4101', '4103', '4110'], palette: ['👍', '❤️', '😂', '😮', '😢', '👏'],
	}
	return `<script>(${fakeServer.toString()})(${JSON.stringify(cfg).replace(/</g, '\\u003c')})</script>`
}

const rowID = (key, discussionID = MAIN_ID) => oid('gd:' + discussionID, key)

module.exports = {rowID, COURSE, ME, PEOPLE, MAIN_ID, MAIN_TITLE, roster, rowsFor, catchUp, discussions, serverScript}
