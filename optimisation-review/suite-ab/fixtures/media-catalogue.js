'use strict'
// media-catalogue: static pages at /media-catalogue-test + API stubs (api/*). 650 photos, 13 collections, history, share log.
// Mirrors media-catalogue/index.js handlers (list/list-count/single/trending/related-tags/record-*/collections/*) against in-memory state.
const {APPS, NOW, DAY, oid, img} = require('../lib/shared')
const D = require('../lib/data/media-catalogue')

const SYNTH = id => typeof id === 'string' && (id.startsWith('favourites:') || id.startsWith('shared-with-me:'))
const SYNTH_NAME = id => id.startsWith('favourites:') ? 'Favourites' : id.startsWith('shared-with-me:') ? 'Shared with me' : null

function withStats(s, d) {
	let st = s.stats[d.filename] || {}
	return Object.assign({}, d, {viewed: st.viewed || 0, downloaded: st.downloaded || 0, inserted: st.inserted || 0})
}

function bump(s, filename, key) {
	let st = s.stats[filename] = s.stats[filename] || {viewed: 0, downloaded: 0, inserted: 0}
	st[key] = (st[key] || 0) + 1
}

function toCollectionId(c, owner) {
	return c === 'favourites' ? `favourites:${owner}` : c
}

function findCollection(s, id, owner) {
	return s.collections.find(c => c._id === id && c.owner === owner)
}

function fail(ctx, status, message) {
	ctx.json({error: message}, status)
}

function listing(s, q, username) {
	let pageNum = parseInt(q.pageNum === undefined ? '-1' : q.pageNum)
	let per = parseInt(q.itemsPerPage) || 40
	let sortO = {relevant: q.sortOptionsRelevant === 'true', random: q.sortOptionsRandom === 'true', new: q.sortOptionsNew === 'true', popular: q.sortOptionsPopular === 'true'}
	let seed = parseInt(q.randomSeed) || 0
	let text = (q.textSearch || '').trim()
	let docs
	let fuzzy = false
	if (q.collection) {
		let col = findCollection(s, toCollectionId(q.collection, username), username)
		let items = col ? col.items : []
		docs = items.map(i => s.byFilename[i.filename] && Object.assign({}, s.byFilename[i.filename], {added: Date.parse(i.addedAt), sender: i.addedBy, DLAV: i.DLAV})).filter(Boolean)
		fuzzy = !!text
		if (fuzzy) {
			docs = docs.filter(d => D.fuzzyMatch(D.haystack(d), text))
		}
	}
	else {
		docs = s.photos.slice()
		if (text) {
			docs = docs.map(d => Object.assign({}, d, {relevancy: D.textScore(d, text)})).filter(d => d.relevancy > 0)
		}
		if (q.type) {
			docs = docs.filter(d => d.type === q.type)
		}
	}
	if (q.ignoreItemUrl) {
		docs = docs.filter(d => d.filename !== q.ignoreItemUrl)
	}
	if (!Object.values(sortO).some(Boolean)) {
		if (q.collection) {
			sortO.new = true
		}
		else {
			sortO.random = true
		}
	}
	let cmpName = (a, b) => a.filename < b.filename ? -1 : a.filename > b.filename ? 1 : 0
	if (text && sortO.relevant) {
		if (fuzzy) {
			docs.sort((a, b) => D.fuzzySpan(D.haystack(a).toLowerCase(), text.toLowerCase()) - D.fuzzySpan(D.haystack(b).toLowerCase(), text.toLowerCase()))
		}
		else {
			docs.sort((a, b) => b.relevancy - a.relevancy || cmpName(a, b))
		}
	}
	else if (sortO.popular) {
		let score = d => (s.stats[d.filename] ? s.stats[d.filename].viewed + 2 * s.stats[d.filename].inserted : 0)
		docs.sort((a, b) => score(b) - score(a) || cmpName(a, b))
	}
	else if (sortO.new) {
		docs.sort((a, b) => (b.added || 0) - (a.added || 0) || cmpName(a, b))
	}
	else if (sortO.random && seed !== 0) {
		let key = d => ((((d.added || 0) + d.filename.length + (d.description || '').length) % 100000) * seed) % 100000
		docs.sort((a, b) => key(a) - key(b) || cmpName(a, b))
	}
	if (pageNum >= 0) {
		docs = docs.slice(pageNum * per, pageNum * per + per)
	}
	return docs.map(d => {
		let o = withStats(s, d)
		delete o.relevancy
		return o
	})
}

module.exports = {
	name: 'media-catalogue',
	prefixes: ['/media-catalogue-test'],
	ownNodeModules: `${APPS}/media-catalogue/node_modules`,
	static: [`${APPS}/media-catalogue/public`],
	pages: [
		{
			// blob: object urls from photo-cache (cached-bg sets them in style attributes, which snapshot.js does not scrub)
			scrub: [['blob:https?://[^/\\\\"\']+/[0-9a-f-]+', 'blob:<id>']],
			id: 'media-catalogue', path: '/media-catalogue-test/', query: {sessionID: 'ab-session', mode: 'catalogue'},
			notes: 'catalogue mode (signed in staff), 650 photos, 40 per page',
			interact: {
				steps: [
					{kind: 'click', sel: '.quick-links .quick-link-item:nth-child(3)', label: 'trending search'},
					{kind: 'type', sel: '#mainSearchInput', text: 'nursing sim', label: 'search box (related tags)'},
					{kind: 'click', sel: '.sort-wrapper .sort-title', label: 'sort dropdown open'},
					{kind: 'click', sel: '.sort-options li:nth-child(3)', label: 'sort recently added'},
					{kind: 'click', sel: '.gallery-item:nth-child(2) .favourite-icon-std', label: 'favourite a photo'},
					{kind: 'click', sel: '.gallery-item:nth-child(3) .add-icon-std', label: 'add-to-collection modal'},
					{kind: 'click', sel: '.add-item-modal .collectionSingleCheckbox:nth-of-type(3)', label: 'tick a collection'},
					{kind: 'type', sel: '.add-item-modal input[name=createCollectionName]', text: 'Engineering lab shots', label: 'name clash check'},
					{kind: 'click', sel: '.add-item-modal .cancel-button', label: 'cancel modal'},
					{kind: 'click', sel: '.gallery-item:nth-child(4) .share-icon-std', label: 'share modal'},
					{kind: 'type', sel: 'input[name=sendCopyCollectionEmail]', text: 'taylor', label: 'recipient autocomplete'},
					{kind: 'click', sel: '.autocomplete-menu-options li:nth-child(1)', label: 'pick recipient'},
					{kind: 'click', sel: '.mc-modal .cancel-button', label: 'cancel share'},
					{kind: 'click', sel: '[ng-click="openPage(\'recently-viewed\')"]', label: 'history'},
					{kind: 'click', sel: '.mc-history-notification-listing-wrapper:nth-child(2)', label: 'open a viewed photo'},
					{kind: 'click', sel: '[ng-click="openPage(\'my-collections\')"]', label: 'collections'},
					{kind: 'type', sel: '.page-search-field input', text: 'grad', label: 'collections search (fuzzy)'},
					{kind: 'click', sel: '.collection-thumbnail-item:nth-child(2) .collection-thumbnail-image', label: 'open a collection'},
					{kind: 'click', sel: '.mc-load-more', label: 'load more'},
					{kind: 'type', sel: '.collection-page-search-field input', text: 'engineering', label: 'search in collection'},
					{kind: 'click', sel: '[ng-click="openFavourites()"]', label: 'favourites'},
					{kind: 'click', sel: '[ng-click="openPage(\'recently-viewed\')"]', label: 'history again'},
					{kind: 'click', sel: '[ng-click="openPage(\'recent-searches\')"]', label: 'recent searches'},
					{kind: 'click', sel: '[ng-click="openPage(\'shared-log\')"]', label: 'share log'},
					// last on purpose: scrolling the library to the bottom triggers paging, which races with any later gallery reload
					{kind: 'click', sel: '.mc-menu-option[ng-click="goHome()"]', label: 'home'},
					{kind: 'click', sel: '.gallery-item:nth-child(40) .favourite-icon-std', label: 'scroll to page end (infinite scroll page 2) + favourite'},
					{kind: 'click', sel: '.gallery-item:nth-child(80) .favourite-icon-std', label: 'scroll to page 2 end (page 3)'},
				],
				generic: false,
			},
		},
		{scrub: [['blob:https?://[^/\\\\"\']+/[0-9a-f-]+', 'blob:<id>']], id: 'media-catalogue-standalone', path: '/media-catalogue-test/', query: {mode: 'standalone'}, notes: 'standalone mode: no session, library only'},
	],
	init(s) {
		D.initState(s)
	},
	routes(r) {
		// the stub backend, relative to the prefix. api/* needs a sessionID for personal routes (401 otherwise, like apiRoute)
		let needUser = (ctx) => {
			if (!ctx.query.sessionID && !ctx.body.sessionID) {
				fail(ctx, 401, 'No session')
				return null
			}
			return ctx.session.user.username
		}
		let anyUser = ctx => (ctx.query.sessionID || ctx.body.sessionID) ? ctx.session.user.username : null

		// photos: any size/name resolves to a deterministic placeholder (fetch() follows the redirect, blob is svg)
		let photo = ctx => {
			let name = decodeURIComponent(ctx.params.file)
			let thumb = /_thumb\.[a-z]+$/i.test(name)
			let base = name.replace(/_thumb(?=\.[a-z]+$)/i, '').replace(/\.[a-z]+$/i, '')
			ctx.redirect(thumb ? img(320, 214, base.slice(0, 26)) : img(1200, 800, base.slice(0, 40)))
		}
		r.get('photos/download/:file', photo)
		r.get('photos/:file', photo)

		r.get('api/list', ctx => {
			if (ctx.query.collection && !needUser(ctx)) {
				return
			}
			let u = anyUser(ctx)
			let docs = listing(ctx.state, ctx.query, u)
			if (!ctx.query.collection) {
				return docs
			}
			let names = Object.fromEntries(ctx.state.staff.map(x => [x.username, {username: x.username, fullName: x.fullName}]))
			return docs.map(d => d.sender && d.sender !== u ? Object.assign({}, d, {sharedBy: names[d.sender] || {username: d.sender, fullName: d.sender}}) : d)
		})
		r.get('api/list-count', ctx => {
			let q = ctx.query
			if (q.collection && !needUser(ctx)) {
				return
			}
			let all = listing(ctx.state, Object.assign({}, q, {pageNum: undefined, itemsPerPage: undefined, sortOptionsRandom: undefined}), anyUser(ctx))
			return {total: all.length}
		})
		r.get('api/single', ctx => {
			let s = ctx.state
			let d = ctx.query.filename ? s.byFilename[ctx.query.filename] : s.photos.find(p => p._id === ctx.query.id)
			return d ? withStats(s, d) : null
		})
		r.get('api/trending-searches', ctx => {
			let s = ctx.state
			let limit = Math.min(parseInt(ctx.query.limit || '20'), 40)
			return s.trending.slice(0, limit).map((t, i) => {
				let hits = s.photos.filter(p => D.textScore(p, t._id) > 0)
				return {_id: t._id, userCount: t.userCount, thumbnail: hits.length ? hits[(i * 7) % hits.length].thumbnail : null, photoCount: hits.length}
			})
		})
		r.get('api/related-tags', ctx => {
			let text = (ctx.query.textSearch || '').trim()
			let ws = D.words(text)
			if (!ws.length) {
				return []
			}
			let counts = {}
			for (let p of ctx.state.photos) {
				if (D.textScore(p, text) > 0) {
					for (let t of p.tags) {
						if (!ws.some(w => t.toLowerCase().includes(w))) {
							counts[t] = (counts[t] || 0) + 1
						}
					}
				}
			}
			return Object.entries(counts).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 10).map(([_id, size]) => ({_id, size}))
		})
		r.post('api/record-search', ctx => {
			let u = anyUser(ctx)
			let t = (ctx.body.textSearch || '').trim()
			if (!u || !t || !/^[a-z]/i.test(t)) {
				return {ok: false}
			}
			let s = ctx.state
			s.recentSearches = [{textSearch: t, resultCount: parseInt(ctx.body.resultCount) || 0, searchedAt: new Date(NOW).toISOString()}].concat(s.recentSearches.filter(x => x.textSearch !== t)).slice(0, 50)
			return {ok: true}
		})
		r.post('api/record-view', ctx => {
			let f = ctx.body.filename
			if (!f) {
				return fail(ctx, 400, 'filename required')
			}
			let u = anyUser(ctx)
			let s = ctx.state
			if (u) {
				s.recentlyViewed = [{filename: f, viewedAt: new Date(NOW).toISOString()}].concat(s.recentlyViewed.filter(x => x.filename !== f)).slice(0, 100)
			}
			bump(s, f, 'viewed')
			return {ok: true}
		})
		r.post('api/record-download', ctx => ctx.body.filename ? (bump(ctx.state, ctx.body.filename, 'downloaded'), {ok: true}) : fail(ctx, 400, 'filename required'))
		r.post('api/record-insert', ctx => ctx.body.filename ? (bump(ctx.state, ctx.body.filename, 'inserted'), {ok: true}) : fail(ctx, 400, 'filename required'))

		r.get('api/recent-searches', ctx => needUser(ctx) && ctx.state.recentSearches.slice(0, Math.min(parseInt(ctx.query.limit) || 10, 50)))
		r.get('api/recently-viewed', ctx => {
			if (!needUser(ctx)) {
				return
			}
			let s = ctx.state
			return s.recentlyViewed.slice(0, Math.min(parseInt(ctx.query.limit) || 10, 100)).map(e => s.byFilename[e.filename] && {timestamp: e.viewedAt, filename: e.filename, item: withStats(s, s.byFilename[e.filename])}).filter(Boolean)
		})
		r.get('api/shared-log', ctx => {
			let u = needUser(ctx)
			if (!u) {
				return
			}
			let s = ctx.state
			let by = Object.fromEntries(s.staff.map(x => [x.username, x]))
			by[u] = Object.assign({username: u}, ctx.session.user)
			return s.shareLog.filter(e => e.sender === u || e.receiverUsername === u).slice().sort((a, b) => a.timestamp < b.timestamp ? 1 : -1).slice(0, Math.min(parseInt(ctx.query.limit) || 10, 100))
				.map(e => Object.assign({}, e, {receiver: by[e.receiverUsername] || null, senderMeta: by[e.sender] || null, itemMeta: e.itemUrl ? s.byFilename[e.itemUrl] || null : null}))
		})
		r.get('api/auto-complete-email', ctx => {
			if (!needUser(ctx)) {
				return
			}
			let t = (ctx.query.emailAddressInput || '').trim().toLowerCase()
			if (!t) {
				return []
			}
			return ctx.state.staff.map(x => Object.assign({fullString: `${x.fullName} (${x.email})`}, x))
				.filter(x => x.fullString.toLowerCase().includes(t) || x.username.includes(t)).sort((a, b) => a.email < b.email ? -1 : 1).slice(0, 3)
				.map(x => ({username: x.username, email: x.email, firstName: x.firstName, lastName: x.lastName, fullName: x.fullName, fullString: x.fullString}))
		})
		r.get('api/find-user', ctx => {
			if (!needUser(ctx)) {
				return
			}
			let x = ctx.state.staff.find(y => y.username === (ctx.query.username || '').trim())
			return x ? [x] : []
		})
		r.get('api/my-collections', ctx => {
			let u = needUser(ctx)
			if (!u) {
				return
			}
			let s = ctx.state
			let only = (ctx.query.collection || '').trim()
			let docs = s.collections.filter(c => c.owner === u && (!only || c._id === toCollectionId(only, u)))
			let shared = `shared-with-me:${u}`
			docs = docs.slice().sort((a, b) => a._id === shared ? -1 : b._id === shared ? 1 : 0)
			let thumbs = {}
			let hay = {}
			for (let c of docs) {
				for (let i of c.items) {
					let p = s.byFilename[i.filename]
					if (p) {
						thumbs[i.filename] = p.thumbnail
						hay[i.filename] = D.haystack(p)
					}
				}
			}
			let names = Object.fromEntries(s.staff.map(x => [x.username, x]))
			return docs.map(d => ({
				collection: d._id, name: d.name, createdAt: d.createdAt, updatedAt: d.updatedAt, creationDate: d.createdAt, lastEditDate: d.updatedAt, DLAV: d.DLAV || false,
				sender: d.sharedBy ? names[d.sharedBy] || null : null, items: d.items,
				cover: d.items.map(i => thumbs[i.filename]).find(Boolean) || null,
				photoCount: d.items.filter(i => thumbs[i.filename]).length,
				itemsSearchText: d.items.map(i => hay[i.filename]).filter(Boolean).join(' '),
			}))
		})
		r.get('api/item-in-my-collections', ctx => {
			let u = needUser(ctx)
			if (!u) {
				return
			}
			let id = (ctx.query.itemID || '').trim()
			if (!id) {
				return []
			}
			return ctx.state.collections.filter(c => c.owner === u && c._id !== `shared-with-me:${u}`)
				.map(c => ({collection: c._id, name: c.name, creationDate: c.createdAt, lastEditDate: c.updatedAt, items: c.items.find(i => i.filename === id) || null}))
		})
		let nameTaken = (s, owner, name, except) => s.collections.some(c => c.owner === owner && c._id !== except && typeof c.name === 'string' && c.name.trim().toLowerCase() === name.trim().toLowerCase())
		r.post('api/collections/create', ctx => {
			let u = needUser(ctx)
			if (!u) {
				return
			}
			let s = ctx.state
			let name = (ctx.body.name || 'New collection').trim()
			if (nameTaken(s, u, name)) {
				return fail(ctx, 409, 'Error: Collection name already exists.')
			}
			let now = new Date(NOW).toISOString()
			let id = oid('collection', s.nextCollection++)
			s.collections.push({_id: id, owner: u, name, createdAt: now, updatedAt: now, DLAV: !!ctx.body.DLAV, sharedBy: null, items: (ctx.body.items || []).map(i => ({filename: i.filename, addedAt: now, addedBy: u, DLAV: !!ctx.body.DLAV}))})
			return {ok: true, insertedId: id}
		})
		r.post('api/collections/rename', ctx => {
			let u = needUser(ctx)
			if (!u) {
				return
			}
			if (!ctx.body.collection) {
				return fail(ctx, 400, 'collection required')
			}
			let id = toCollectionId(ctx.body.collection, u)
			if (SYNTH(id)) {
				return fail(ctx, 400, 'Favourites and Shared with me cannot be renamed')
			}
			let name = (ctx.body.name || 'Renamed collection').trim()
			if (nameTaken(ctx.state, u, name, id)) {
				return fail(ctx, 409, 'Error: Collection name already exists.')
			}
			let c = findCollection(ctx.state, id, u)
			if (c) {
				c.name = name
				c.updatedAt = new Date(NOW).toISOString()
			}
			return {ok: true}
		})
		r.post('api/collections/delete', ctx => {
			let u = needUser(ctx)
			if (!u) {
				return
			}
			if (!ctx.body.collection) {
				return fail(ctx, 400, 'collection required')
			}
			let id = toCollectionId(ctx.body.collection, u)
			if (SYNTH(id)) {
				return fail(ctx, 400, 'Favourites and Shared with me cannot be deleted')
			}
			ctx.state.collections = ctx.state.collections.filter(c => !(c._id === id && c.owner === u))
			return {ok: true}
		})
		r.post('api/collections/add-item', ctx => {
			let u = needUser(ctx)
			if (!u) {
				return
			}
			let {item, collection} = ctx.body
			if (!item || !collection) {
				return fail(ctx, 400, 'item and collection required')
			}
			let id = toCollectionId(collection, u)
			let s = ctx.state
			let c = findCollection(s, id, u)
			if (!c && SYNTH(id)) {
				c = {_id: id, owner: u, name: SYNTH_NAME(id), createdAt: new Date(NOW).toISOString(), updatedAt: new Date(NOW).toISOString(), DLAV: false, sharedBy: null, items: []}
				s.collections.push(c)
			}
			if (!c) {
				return fail(ctx, 404, 'Collection not found')
			}
			c.items = c.items.filter(i => i.filename !== item).concat([{filename: item, addedAt: new Date(NOW).toISOString(), addedBy: u}])
			c.updatedAt = new Date(NOW).toISOString()
			return {ok: true}
		})
		r.post('api/collections/remove-item', ctx => {
			let u = needUser(ctx)
			if (!u) {
				return
			}
			if (!ctx.body.item || !ctx.body.collection) {
				return fail(ctx, 400, 'item and collection required')
			}
			let c = findCollection(ctx.state, toCollectionId(ctx.body.collection, u), u)
			if (c) {
				c.items = c.items.filter(i => i.filename !== ctx.body.item)
				c.updatedAt = new Date(NOW).toISOString()
			}
			return {ok: true}
		})
		r.post('api/collections/send-item', ctx => {
			let u = needUser(ctx)
			if (!u) {
				return
			}
			let s = ctx.state
			let to = s.staff.find(x => x.username === ctx.body.collectionOwner)
			if (!ctx.body.item || !ctx.body.collectionOwner) {
				return fail(ctx, 400, 'item and collectionOwner required')
			}
			if (!to) {
				return fail(ctx, 400, 'Not someone this can be shared with')
			}
			if (!s.byFilename[ctx.body.item]) {
				return fail(ctx, 404, 'No such photo')
			}
			s.shareLog.push({type: 'item', sender: u, receiverUsername: to.username, itemUrl: ctx.body.item, DLAV: !!ctx.body.DLAV, timestamp: new Date(NOW).toISOString()})
			return {ok: true, notified: true}
		})
		r.post('api/collections/send-collection', ctx => {
			let u = needUser(ctx)
			if (!u) {
				return
			}
			let s = ctx.state
			let to = s.staff.find(x => x.username === ctx.body.collectionOwner)
			if (!ctx.body.collectionOwner) {
				return fail(ctx, 400, 'collectionOwner required')
			}
			if (!to) {
				return fail(ctx, 400, 'Not someone this can be shared with')
			}
			let id = oid('collection', s.nextCollection++)
			let items = ctx.body.items || []
			s.shareLog.push({type: 'collection', sender: u, receiverUsername: to.username, collectionId: id, name: (ctx.body.name || 'Shared collection').trim(), itemCount: items.length, DLAV: !!ctx.body.DLAV, timestamp: new Date(NOW).toISOString()})
			return {ok: true, insertedId: id, notified: true}
		})
	},
}
