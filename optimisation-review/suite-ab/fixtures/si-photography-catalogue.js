'use strict'
// si-photography-catalogue (appName photography-gallery): the legacy gallery. GET list (the WHOLE photo array, like the real in-memory
// payload: 1200 photos here, ~7000 in production), single?id=, update-views / update-downloads / update-favourite (counters kept in state),
// photos/<file> (placeholder via img()). Client-side filter|orderBy|limitTo over all photos is the hot part of this page.
const {APPS, NOW, DAY, oid, img} = require('../lib/shared')
const {buildPhotos} = require('../lib/data/media-catalogue')

const ME = 'Test.Staff@unisq.edu.au'
const PREFIX = '/photography-gallery'

function build(s) {
	let src = buildPhotos(1200)
	s.photos = src.map((p, i) => {
		let enc = encodeURIComponent(p.filename)
		let subject = p.tags.slice()
		if (i % 53 === 0) {
			subject.push('course-header-banner')
		}
		if (i % 71 === 0) {
			subject.push('welcome-banner')
		}
		return {
			_id: p._id,
			filename: enc,
			url: `${PREFIX}/photos/${enc}`,
			thumbnail: `${PREFIX}/photos/${encodeURIComponent(p.thumbnail)}`,
			metadata: {creator: p.meta.creator[0] === 'USQ' ? 'University Of Southern Queensland' : p.meta.creator[0], subject, description: p.description, date: i % 17 === 0 ? null : p.meta.date, originalFilename: p.filename},
			favourites: i % 29 === 0 ? [ME, 'Someone.Else@unisq.edu.au'] : i % 13 === 0 ? ['Someone.Else@unisq.edu.au'] : [],
			views: (i * 37) % 400,
			downloads: (i * 11) % 60,
			added: p.added,
		}
	})
	s.byId = new Map(s.photos.map(p => [p._id, p]))
}

module.exports = {
	name: 'si-photography-catalogue',
	prefixes: [PREFIX],
	ownNodeModules: `${APPS}/si-photography-catalogue/node_modules`,
	static: [`${APPS}/si-photography-catalogue/public`],
	pages: [
		{
			id: 'si-photography-catalogue', path: PREFIX + '/', query: {sessionID: 'ab-session', mode: 'standalone'},
			notes: 'standalone mode, 1200 photos, 40 per page, scroll paging; search/favourites/sort all re-filter the whole list client side',
			// photo thumbnails are lazy-loaded off an IntersectionObserver queue (6 at a time): the set of image requests is timing dependent
			// the page re-filters 1200 photos from a 150ms interval after every change: give steps a long quiet window when the runner supports it
			settle: {quietMs: 900},
			interact: {
				steps: [
					{kind: 'type', sel: '.search-bar', text: 'engineering', label: 'search (filter over all photo fields)'},
					{kind: 'click', sel: '.gallery-item:nth-child(2) .gallery-item-image', label: 'open a photo'},
					{kind: 'click', sel: '.photo-details-favourite', label: 'favourite it (modal)'},
					{kind: 'click', sel: '.photo-details-download', label: 'download info side'},
					{kind: 'click', sel: '.download-side .photo-close-button', label: 'back to image'},
					{kind: 'click', sel: '.photo-close-button', label: 'close photo'},
					{kind: 'click', sel: '.favourite-filter-button', label: 'favourites only'},
					{kind: 'click', sel: '.favourite-filter-button', label: 'favourites off'},
					{kind: 'type', sel: '.search-bar', text: '', label: 'clear search'},
					{kind: 'click', sel: '.sort-option:nth-child(1)', label: 'sort popular'},
					{kind: 'click', sel: '.sort-option:nth-child(1)', label: 'sort popular (reverse)'},
					{kind: 'click', sel: '.sort-option:nth-child(2)', label: 'sort new'},
					// last: scrolling to the page end loads the next 40
					{kind: 'click', sel: '.gallery-item:nth-child(40) .photo-details-favourite', label: 'scroll to page end, favourite'},
				],
				generic: false,
			},
		},
		{
			id: 'si-photography-catalogue-modal', path: PREFIX + '/', query: {sessionID: 'ab-session', mode: 'catalogue', page: 'modal', photo: JSON.stringify({
				_id: oid('photo', 7), filename: 'sample.jpg', url: `${PREFIX}/photos/sample.jpg`, views: 12, downloads: 3, favourites: [], added: NOW - DAY,
				metadata: {originalFilename: 'sample.jpg', creator: 'USQ', subject: ['campus'], description: '-', date: null},
			})},
			notes: 'the modal page (opened in an iframe by the standalone page): single photo with views/embeds/favourite/insert',
		},
	],
	init(s) {
		build(s)
	},
	routes(r) {
		let photo = ctx => {
			let name = decodeURIComponent(ctx.params.file)
			let thumb = /_thumb\.[a-z]+$/i.test(name)
			let base = name.replace(/_thumb(?=\.[a-z]+$)/i, '').replace(/\.[a-z]+$/i, '')
			ctx.redirect(thumb ? img(320, 214, base.slice(0, 26)) : img(1200, 800, base.slice(0, 40)))
		}
		r.get('photos/:file', photo)
		// The page asks for the list at controller init and for the session in parallel, and only marks `photo.favourited` when the user has already
		// arrived (main.js getPhotos). The real 4.5mb list always loses that race to the session, so hold this one back a little: otherwise the
		// favourites filter works or finds nothing depending on request timing, and A/B runs flip between the two.
		r.get('list', async ctx => {
			await new Promise(resolve => setTimeout(resolve, 400))
			return ctx.state.photos
		})
		r.get('single', ctx => ctx.state.byId.get(ctx.query.id) || ctx.state.photos[0] || {})
		r.all('update-views', ctx => {
			let p = ctx.state.byId.get(ctx.query.id)
			if (!ctx.query.id) {
				return ctx.status(412)
			}
			if (p) {
				p.views = (p.views || 0) + 1
			}
			return ctx.status(200)
		})
		r.all('update-downloads', ctx => {
			let p = ctx.state.byId.get(ctx.query.id)
			if (!ctx.query.id) {
				return ctx.status(412)
			}
			if (p) {
				p.downloads = (p.downloads || 0) + 1
			}
			return ctx.status(200)
		})
		r.all('update-favourite', ctx => {
			let p = ctx.state.byId.get(ctx.query.id)
			let u = ctx.query.user
			if (!ctx.query.id || !u) {
				return ctx.status(412)
			}
			if (p) {
				let i = p.favourites.indexOf(u)
				if (i > -1) {
					p.favourites.splice(i, 1)
				}
				else {
					p.favourites.push(u)
				}
			}
			return ctx.status(200)
		})
	},
}
