'use strict'
// toolbox-suggest-feature: the feature suggestion board (/suggest-feature/?boardID=toolbox). In-memory port of the Express/Mongo routes in index.js
// (the old one-app harness in sf-harness/server.js): fetch-suggestions (412 [] without boardID, hidden ones filtered), save-suggestion (upsert on a valid
// 24-hex _id else insert, 412 without title/description/boardID, 302 to fetch-suggestions?boardID=...).
const {APPS, NOW, DAY, oid, uuid, lorem, img, AUDIO, buildSession} = require('../lib/shared')

const SF = `${APPS}/toolbox-suggest-feature`
const ME = 'u1234567'

// The board is iframed into the toolbox with the session already in its url (sessionData), so fetchActivity delivers synchronously during controller
// construction and the bootstrap digest renders the ng-if'd .wrapper before main.js's initialize() reaches `ResizeObserver.observe(.wrapper)`.
// With only a sessionID the session arrives over the network instead, the callback runs outside any digest, .wrapper is still null and initialize() throws
// ("parameter 1 is not of type 'Element'") leaving a blank page: a real race in the app, avoided here by supplying sessionData like production does.
const SESSION = {role: 'staff', access: ['published', 'toolbox-suggestions']}
const sessionData = encodeURIComponent(JSON.stringify(buildSession(SESSION)))

const OTHERS = ['u2000114', 'u2000231', 'u2000342', 'u2000458', 'u2000563', 'u2000671', 'u2000789', 'u2000896']

// [title, description, owner, upvoters (indexes into OTHERS, ME as -1), downvoters, hidden]
const SEED = [
	['Dark mode for the toolbox', 'The toolbox is very bright when I am building pages in the evening. Please add a dark theme that follows the browser setting.', 0, [0, 1, 2, 3, -1], [], false],
	['Remember my last used colour', 'Every time I open Buttons and Tiles I have to pick the course colour again. It would save a lot of clicks if the last colour was remembered per course.', ME, [1, 2, 4, -1], [5], false],
	['Bulk insert of resource templates', 'Allow inserting several resource template rows at once from a pasted spreadsheet.', 3, [0, 1, 2, 3, 4, 5], [6], false],
	['Keyboard shortcuts for the editor', 'Shortcuts for opening the toolbox, selecting the first search result and inserting.', 1, [2, 3], [], false],
	['Show a preview of tables before inserting', 'The table styles page shows a stylised example, but not my actual rows and columns.', 2, [0, 4, 5, 6], [1], false],
	['Duplicate a banner into another course', 'We run the same banner design across a whole program, copying it course by course is slow.', ME, [0, 3, 6], [], false],
	['Search inside the icon set', 'There are 30 icons and finding the right one by eye takes a while, add a filter box.', 4, [1], [0], false],
	['Group discussion export', 'Export a discussion thread to CSV for assessment moderation.', 5, [1, 2, 3, 4, 5, 6, 7], [], false],
	['Undo after inserting', 'I inserted the wrong template and had to remove each block by hand. An undo button on the toolbox would be great.', 6, [2, 4], [3], false],
	['Better contrast on the Admin buttons', 'The grey top-header buttons are hard to read on a projector.', 7, [0], [], false],
	['Podcast player: remember playback speed', 'Playback speed resets when the page is reloaded.', 0, [1, 2, 3], [], false],
	['More Acknowledgement of Country banner sizes', 'A narrow banner for sidebars.', 3, [4, 5], [], false],
	['Favourite whole layouts', 'Let me star a layout template, not just a toolbox item.', 1, [], [], false],
	['Internal test suggestion', 'This one is hidden from the board.', 2, [], [], true],
	['Show how many times an item was inserted', 'Popular is a sort, but the count itself would help me pick.', 5, [0, 2], [1, 7], false],
]

function seed() {
	return SEED.map(([title, description, owner, up, down, hidden], i) => {
		let name = x => x === -1 ? ME : OTHERS[x]
		let doc = {
			_id: oid('suggestion', i), boardID: 'toolbox', owner: owner === ME ? ME : OTHERS[owner], title, description,
			upvotes: up.map(name), downvotes: down.map(name),
		}
		if (hidden) {
			doc.hidden = true
		}
		return doc
	}).concat([
		{_id: oid('suggestion', 100), boardID: 'other-board', owner: OTHERS[0], title: 'Suggestion on another board', description: 'Not shown on the toolbox board.', upvotes: [OTHERS[1]], downvotes: []},
	])
}

module.exports = {
	name: 'toolbox-suggest-feature',
	prefixes: ['/suggest-feature'],
	ownNodeModules: `${SF}/node_modules`,
	static: [`${SF}/public`],
	pages: [
		{
			id: 'suggest-feature', path: '/suggest-feature/', query: {boardID: 'toolbox', sessionID: 'sess-sf-1', sessionData},
			// non-admin on the board: Edit only appears on the suggestions the user owns
			session: SESSION,
			notes: 'board with 14 visible suggestions (2 owned by the staff user, some already upvoted by them)',
			interact: {
				steps: [
					{kind: 'type', sel: '.filter-input', text: 'export', label: 'filter "export"'},
					{kind: 'type', sel: '.filter-input', text: ' ', label: 'clear filter'},
					{kind: 'click', sel: '.suggestion-list-wrapper .suggestion:nth-child(3) .upvote-button', label: 'upvote suggestion 3'},
					{kind: 'click', sel: '.suggestion-list-wrapper .suggestion:nth-child(4) .downvote-button', label: 'downvote suggestion 4'},
					{kind: 'click', sel: '.suggestion-list-wrapper .suggestion:nth-child(1) .downvote-button', label: 'downvote suggestion 1'},
					{kind: 'click', sel: '.add-new-suggestion-button', label: 'add new suggestion'},
					{kind: 'type', sel: '.modal-suggestion-title', text: 'Template search by keyword', label: 'new suggestion title'},
					{kind: 'type', sel: '.modal-suggestion-description', text: 'Let me search the layout templates by what is in them, not only by name.', label: 'new suggestion description'},
					{kind: 'click', sel: '.modal-suggestion .tb-btn-filled', label: 'save new suggestion'},
					{kind: 'click', sel: '.suggestion-edit', label: 'edit own suggestion'},
					{kind: 'type', sel: '.modal-suggestion-title', text: 'Remember my last used colour per course', label: 'retitle'},
					{kind: 'click', sel: '.modal-suggestion .tb-btn-outline', label: 'cancel edit'},
				],
			},
		},
	],
	init(s) {
		s.docs = seed()
		s.nextId = 200
	},
	routes(r) {
		r.all('fetch-suggestions', ctx => {
			if (!ctx.query.boardID) {
				return ctx.json([], 412)
			}
			return ctx.state.docs.filter(d => d.boardID === ctx.query.boardID && d.hidden !== true)
		})
		r.all('save-suggestion', ctx => {
			let doc = ctx.body
			if (!(doc && doc.title && doc.description && doc.boardID)) {
				return ctx.status(412)
			}
			let id = doc._id && /^[0-9a-f]{24}$/i.test(doc._id) ? doc._id : oid('suggestion', ctx.state.nextId++)
			let rest = Object.assign({}, doc)
			delete rest._id
			let existing = ctx.state.docs.find(d => d._id === id)
			if (existing) {
				Object.assign(existing, rest)
			}
			else {
				ctx.state.docs.push(Object.assign({_id: id}, rest))
			}
			return ctx.redirect(`fetch-suggestions?boardID=${doc.boardID}`)
		})
	},
}
