'use strict'
// toolbox-notes: private notes list (+ shared-note mode with ?editorID=), TinyMCE editor, comments/replies/reactions, revisions.
// The Yjs transport is socket.io. The harness stub delivers nothing, so GET /notes/ is served here with a small script that answers
// 'join' with 'joined' + 'presence'. The editor paints the document's saved HTML mirror (content), which is what the real page shows
// before the first Yjs sync lands anyway.
const fs = require('fs')
const {APPS, NOW, oid} = require('../lib/shared')
const D = require('../lib/data/toolbox-notes')

const INDEX = `${APPS}/toolbox-notes/public/index.html`
const REACTIONS = new Set(['👍', '👎', '😄', '😮', '😢', '❤️', '🎉', '👀'])
const iso = ms => new Date(ms).toISOString()
const J = id => '#' + id

function browserFake(cfg) {
	var realIO = window.io
	window.io = function () {
		var s = realIO.apply(this, arguments)
		s.io.engine = {transport: {query: {transport: 'websocket'}}}
		var realEmit = s.emit
		s.emit = function (ev, data) {
			realEmit.apply(s, arguments)
			if (ev === 'join') {
				setTimeout(function () {
					s.__fire('joined', {documentID: data.documentID})
					s.__fire('presence', cfg.presence)
				}, 20)
			}
		}
		return s
	}
	window.io.connect = window.io
}

function servePage(ctx) {
	let html = fs.readFileSync(INDEX, 'utf8')
	let tag = '<script src="socket.io/socket.io.js"></script>'
	let cfg = {presence: [{username: 'u1234567', fullName: 'Test Staff'}, {username: 'u4110', fullName: 'Dr Helen Fraser'}, {username: 'u4101', fullName: 'Priya Raman'}]}
	html = html.replace(tag, tag + `\n<script>(${browserFake.toString()})(${JSON.stringify(cfg)})</script>`)
	return ctx.html(html)
}

const isStaff = user => !!user && user.isStudent === false
function perms(doc, user, activity) {
	let canView
	if (doc.visibility === 'shared') {
		canView = !!activity && activity.courseLabel === doc.courseLabel
	}
	else if (doc.visibility === 'private') {
		canView = !!user && user.userID === doc.ownerID
	}
	else {
		canView = (!!user && user.userID === doc.ownerID) || (isStaff(user) && !!activity && activity.courseLabel === doc.courseLabel)
	}
	return {canView, canEdit: canView}
}
const listItem = d => ({
	_id: d._id, visibility: d.visibility, editorID: d.editorID, title: d.title, ownerID: d.ownerID, ownerUsername: d.ownerUsername, ownerFullName: d.ownerFullName,
	createdAt: d.createdAt, updatedAt: d.updatedAt, lastEditedByUsername: d.lastEditedByUsername, lastEditedByFullName: d.lastEditedByFullName,
})
const escapeHTML = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

module.exports = {
	name: 'toolbox-notes',
	prefixes: ['/notes'],
	ownNodeModules: `${APPS}/toolbox-notes/node_modules`,
	static: [`${APPS}/toolbox-notes/public`],
	pages: [
		{
			id: 'toolbox-notes', path: '/notes/', query: {},
			settle: {quietMs: 900, maxMs: 15000},
			notes: 'private notes mode (sidebar list). jQuery page. TinyMCE comes from toolbox-notes/node_modules (si-manager lacks it).',
			interact: {
				steps: [
					{kind: 'click', sel: '.notes-list-item:nth-child(1)', label: 'open first note'},
					{kind: 'click', sel: 'button[ng-click="toggleComments()"]', label: 'open comments'},
					{kind: 'click', sel: '.notes-comment-thread[data-anchor-id="c-week1-a"] .notes-comment-anchor', label: 'focus comment anchor'},
					{kind: 'click', sel: '.notes-comment-thread[data-anchor-id="c-week1-a"] .notes-reaction-pill', label: 'toggle reaction pill'},
					{kind: 'click', sel: '.notes-comment-thread[data-anchor-id="c-week1-b"] .notes-reaction-add', label: 'open reaction picker'},
					{kind: 'click', sel: '.notes-comment-thread[data-anchor-id="c-week1-b"] .notes-reaction-picker span:nth-child(6)', label: 'react with heart'},
					{kind: 'type', sel: '.notes-comment-thread[data-anchor-id="c-week1-a"] .notes-comment-reply-input', text: 'Will do, thanks both', label: 'type reply text'},
					{kind: 'click', sel: '.notes-comment-thread[data-anchor-id="c-week1-a"] .notes-comment-actions button', label: 'edit own comment'},
					{kind: 'type', sel: '.notes-comment-edit-box textarea', text: 'Worth quoting Schon directly here, with the page number and year.', label: 'type comment edit'},
					{kind: 'click', sel: '.notes-comment-edit-box button:nth-of-type(1)', label: 'save comment edit'},
					{kind: 'click', sel: 'button[ng-click="toggleHistory()"]', label: 'open history'},
					{kind: 'click', sel: '.notes-history-item:nth-child(2)', label: 'preview revision'},
					{kind: 'click', sel: '.notes-history-preview button', label: 'restore revision'},
					{kind: 'type', sel: '.notes-title-input', text: 'Week 1 reading notes (revised)', label: 'retitle note'},
					{kind: 'click', sel: 'button[ng-click="toggleVisibility()"]', label: 'make visible to staff'},
					{kind: 'click', sel: '.notes-list-item:nth-child(3)', label: 'open staff-visible note'},
					{kind: 'click', sel: 'button[ng-click="toggleComments()"]', label: 'comments on third note'},
					{kind: 'click', sel: '.notes-comment-thread .notes-comment-reply .notes-reaction-add', label: 'reply reaction picker'},
					{kind: 'click', sel: '.notes-comment-thread .notes-comment-reply .notes-reaction-picker span:nth-child(1)', label: 'react to reply'},
					{kind: 'click', sel: '.notes-sidebar-header button:nth-child(1)', label: 'new note'},
					{kind: 'click', sel: 'button[ng-click^="deleteDocument"]', label: 'delete new note'},
				],
			},
		},
		{
			id: 'toolbox-notes-shared', path: '/notes/', query: {editorID: 'blk-glossary'},
			settle: {quietMs: 900, maxMs: 15000},
			notes: 'extra page (not in the original list): shared-note mode, one document per block instance',
			interact: {
				steps: [
					{kind: 'click', sel: 'button[ng-click="toggleComments()"]', label: 'open comments'},
					{kind: 'click', sel: '.notes-comment-thread .notes-reaction-pill:nth-child(1)', label: 'toggle reaction'},
					{kind: 'click', sel: 'button[ng-click="toggleHistory()"]', label: 'open history'},
					{kind: 'click', sel: '.notes-history-item:nth-child(1)', label: 'preview revision'},
				],
			},
		},
	],
	init(s) {
		s.tick = 0
		s.docs = D.docs()
		s.comments = D.comments()
		s.revisions = D.revisions()
		s.courseSettings = {}
	},
	routes(r) {
		const nextId = (ctx, kind) => oid(kind, ++ctx.state.tick)
		const now = ctx => iso(NOW + ++ctx.state.tick * 1000)
		const session = ctx => ({user: ctx.global.session.user, activity: ctx.global.session.activity})
		const findDoc = (ctx, id) => ctx.state.docs.find(d => d._id === id && !d.deleted)
		// 404 / 403 guard like the real handlers; returns the doc or sends the error
		const need = (ctx, mode) => {
			let doc = findDoc(ctx, ctx.params.id)
			if (!doc) {
				ctx.status(404)
				return null
			}
			let {user, activity} = session(ctx)
			if (!perms(doc, user, activity).canView) {
				ctx.status(403)
				return null
			}
			return doc
		}

		r.get('', servePage)
		r.get('index.html', servePage)

		r.get('documents', ctx => {
			let {user, activity} = session(ctx)
			return ctx.state.docs
				.filter(d => !d.deleted && d.courseLabel === activity.courseLabel &&
					((d.ownerID === user.userID && ['private', 'private-staff-visible'].includes(d.visibility)) || (isStaff(user) && d.visibility === 'private-staff-visible')))
				.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
				.map(listItem)
		})
		r.get('documents/shared', ctx => {
			if (!ctx.query.editorID) {
				return ctx.status(412)
			}
			let {user, activity} = session(ctx)
			let doc = ctx.state.docs.find(d => d.visibility === 'shared' && d.editorID === ctx.query.editorID && d.courseLabel === activity.courseLabel && !d.deleted)
			if (!doc) {
				let t = now(ctx)
				doc = {
					_id: nextId(ctx, 'note'), visibility: 'shared', editorID: ctx.query.editorID, courseLabel: activity.courseLabel, courseID: activity.courseID, ownerID: user.userID,
					ownerUsername: user.username, ownerFullName: user.fullName, title: 'Shared note', content: '', createdAt: t, updatedAt: t, lastEditedBy: user.userID,
					lastEditedByUsername: user.username, lastEditedByFullName: user.fullName, deleted: false,
				}
				ctx.state.docs.push(doc)
			}
			return Object.assign({}, doc, perms(doc, user, activity))
		})
		r.post('documents', ctx => {
			let {user, activity} = session(ctx)
			let t = now(ctx)
			let doc = {
				_id: nextId(ctx, 'note'), visibility: ctx.body.visibility === 'private-staff-visible' ? 'private-staff-visible' : 'private', editorID: null, courseLabel: activity.courseLabel,
				courseID: activity.courseID, ownerID: user.userID, ownerUsername: user.username, ownerFullName: user.fullName, title: ctx.body.title || 'Untitled note', content: '',
				createdAt: t, updatedAt: t, lastEditedBy: user.userID, lastEditedByUsername: user.username, lastEditedByFullName: user.fullName, deleted: false,
			}
			ctx.state.docs.push(doc)
			return Object.assign({}, doc, {canView: true, canEdit: true})
		})
		r.get('documents/:id', ctx => {
			let doc = need(ctx)
			if (doc) {
				let {user, activity} = session(ctx)
				return Object.assign({}, doc, perms(doc, user, activity))
			}
		})
		r.post('documents/:id/save', ctx => {
			let doc = need(ctx)
			if (!doc) {
				return
			}
			let {user} = session(ctx)
			doc.updatedAt = now(ctx)
			doc.lastEditedBy = user.userID
			doc.lastEditedByUsername = user.username
			doc.lastEditedByFullName = user.fullName
			if (typeof ctx.body.content === 'string') {
				doc.content = ctx.body.content
			}
			if (typeof ctx.body.title === 'string' && ctx.body.title.trim()) {
				doc.title = ctx.body.title.trim()
			}
			return ctx.status(200)
		})
		r.post('documents/:id/visibility', ctx => {
			let doc = need(ctx)
			if (!doc) {
				return
			}
			let {user} = session(ctx)
			if (doc.visibility === 'shared' || doc.ownerID !== user.userID) {
				return ctx.status(403)
			}
			if (!['private', 'private-staff-visible'].includes(ctx.body.visibility)) {
				return ctx.status(412)
			}
			doc.visibility = ctx.body.visibility
			doc.updatedAt = now(ctx)
			return ctx.status(200)
		})
		r.post('documents/:id/revisions', ctx => {
			let doc = need(ctx)
			if (!doc) {
				return
			}
			if (typeof ctx.body.content !== 'string') {
				return ctx.status(412)
			}
			let {user} = session(ctx)
			let mine = ctx.state.revisions.filter(x => x.documentID === doc._id)
			if (mine.length && mine[mine.length - 1].snapshotHTML === ctx.body.content) {
				return ctx.status(200)
			}
			ctx.state.revisions.push({
				_id: nextId(ctx, 'note-rev'), documentID: doc._id, snapshotHTML: ctx.body.content, createdAt: now(ctx), editedBy: user.userID, editedByUsername: user.username,
				editedByFullName: user.fullName, label: ctx.body.label || null,
			})
			return ctx.status(200)
		})
		r.get('documents/:id/revisions', ctx => {
			let doc = need(ctx)
			if (doc) {
				return ctx.state.revisions.filter(x => x.documentID === doc._id).map(x => {
					let o = Object.assign({}, x)
					delete o.snapshotHTML
					return o
				}).reverse()
			}
		})
		r.get('documents/:id/revisions/:revisionId', ctx => {
			let doc = need(ctx)
			if (!doc) {
				return
			}
			let rev = ctx.state.revisions.find(x => x._id === ctx.params.revisionId && x.documentID === doc._id)
			if (!rev) {
				return ctx.status(404)
			}
			return {content: rev.snapshotHTML, createdAt: rev.createdAt, editedByUsername: rev.editedByUsername, editedByFullName: rev.editedByFullName, label: rev.label}
		})

		// comments
		r.post('documents/:id/comments', ctx => {
			let doc = need(ctx)
			if (!doc) {
				return
			}
			if (!ctx.body.anchorID || typeof ctx.body.body !== 'string' || !ctx.body.body.trim()) {
				return ctx.status(412)
			}
			let {user} = session(ctx)
			ctx.state.comments.push({
				_id: nextId(ctx, 'note-comment'), documentID: doc._id, anchorID: ctx.body.anchorID, authorID: user.userID, authorUsername: user.username, authorFullName: user.fullName,
				body: ctx.body.body.trim(), createdAt: now(ctx), editedAt: null, reactions: [], replies: [],
			})
			return ctx.status(200)
		})
		r.get('documents/:id/comments', ctx => {
			let doc = need(ctx)
			if (doc) {
				return ctx.state.comments.filter(c => c.documentID === doc._id).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
			}
		})
		const comment = (ctx, doc) => ctx.state.comments.find(c => c._id === ctx.params.commentId && c.documentID === doc._id)
		r.post('documents/:id/comments/:commentId/reply', ctx => {
			let doc = need(ctx)
			if (!doc) {
				return
			}
			if (typeof ctx.body.body !== 'string' || !ctx.body.body.trim()) {
				return ctx.status(412)
			}
			let c = comment(ctx, doc)
			if (!c) {
				return ctx.status(404)
			}
			let {user} = session(ctx)
			c.replies.push({
				_id: nextId(ctx, 'note-reply'), authorID: user.userID, authorUsername: user.username, authorFullName: user.fullName, body: ctx.body.body.trim(), createdAt: now(ctx),
				editedAt: null, reactions: [],
			})
			return ctx.status(200)
		})
		r.post('documents/:id/comments/:commentId/edit', ctx => {
			let doc = need(ctx)
			if (!doc) {
				return
			}
			if (typeof ctx.body.body !== 'string' || !ctx.body.body.trim()) {
				return ctx.status(412)
			}
			let {user} = session(ctx)
			let c = comment(ctx, doc)
			if (!c || c.authorID !== user.userID) {
				return ctx.status(404)
			}
			c.body = ctx.body.body.trim()
			c.editedAt = now(ctx)
			return ctx.status(200)
		})
		r.post('documents/:id/comments/:commentId/replies/:replyId/edit', ctx => {
			let doc = need(ctx)
			if (!doc) {
				return
			}
			if (typeof ctx.body.body !== 'string' || !ctx.body.body.trim()) {
				return ctx.status(412)
			}
			let {user} = session(ctx)
			let c = comment(ctx, doc)
			let rp = c && c.replies.find(x => x._id === ctx.params.replyId && x.authorID === user.userID)
			if (!rp) {
				return ctx.status(404)
			}
			rp.body = ctx.body.body.trim()
			rp.editedAt = now(ctx)
			return ctx.status(200)
		})
		const toggle = (list, user, emoji) => {
			let at = list.findIndex(x => x.userID === user.userID && x.emoji === emoji)
			if (at > -1) {
				list.splice(at, 1)
			}
			else {
				list.push({emoji, userID: user.userID, username: user.username, fullName: user.fullName})
			}
		}
		r.post('documents/:id/comments/:commentId/react', ctx => {
			let doc = need(ctx)
			if (!doc) {
				return
			}
			if (!REACTIONS.has(ctx.body.emoji)) {
				return ctx.status(412)
			}
			let c = comment(ctx, doc)
			if (!c) {
				return ctx.status(404)
			}
			toggle(c.reactions, session(ctx).user, ctx.body.emoji)
			return ctx.status(200)
		})
		r.post('documents/:id/comments/:commentId/replies/:replyId/react', ctx => {
			let doc = need(ctx)
			if (!doc) {
				return
			}
			if (!REACTIONS.has(ctx.body.emoji)) {
				return ctx.status(412)
			}
			let c = comment(ctx, doc)
			let rp = c && c.replies.find(x => x._id === ctx.params.replyId)
			if (!rp) {
				return ctx.status(404)
			}
			toggle(rp.reactions, session(ctx).user, ctx.body.emoji)
			return ctx.status(200)
		})

		// export / print / delete
		r.get('documents/:id/export/docx', ctx => {
			let doc = need(ctx)
			if (doc) {
				return ctx.text('PK\u0003\u0004 stub docx for ' + doc.title, 200, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
			}
		})
		r.get('documents/:id/print', ctx => {
			let doc = need(ctx)
			if (doc) {
				return ctx.html(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHTML(doc.title)}</title></head><body><h1>${escapeHTML(doc.title)}</h1>${doc.content || ''}</body></html>`)
			}
		})
		r.post('documents/:id/delete', ctx => {
			let doc = need(ctx)
			if (!doc) {
				return
			}
			let {user} = session(ctx)
			if (!(doc.visibility === 'shared' ? isStaff(user) : doc.ownerID === user.userID)) {
				return ctx.status(403)
			}
			doc.deleted = true
			return ctx.status(200)
		})

		// per-course enablement (read by ilar-manager.js, written by the toolbox config screen)
		r.get('course-settings/enabled', ctx => {
			if (!ctx.query.courseLabel || !ctx.query.courseCode) {
				return ctx.status(412)
			}
			let cs = ctx.state.courseSettings
			let o = cs['label:' + ctx.query.courseLabel]
			return {enabled: o !== undefined ? o : (cs['code:' + ctx.query.courseCode] !== undefined ? cs['code:' + ctx.query.courseCode] : true)}
		})
		r.post('course-settings', ctx => {
			let {activity} = session(ctx)
			let cs = ctx.state.courseSettings
			if (ctx.body.enabled) {
				cs['code:' + activity.courseCode] = true
				delete cs['label:' + activity.courseLabel]
			}
			else {
				cs['label:' + activity.courseLabel] = false
			}
			return ctx.status(200)
		})
	},
}
