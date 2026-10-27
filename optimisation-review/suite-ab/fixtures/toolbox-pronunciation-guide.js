'use strict'
// toolbox-pronunciation-guide: the pronunciation guide viewer at /pronunciation-ilar/?contentID=<guide id>.
// Content is the app's own sample dataset plus generated items (lib/data/toolbox-pronunciation-guide.js). Audio/images come from the guide's
// "elor" resource prefix (an external lor host in production), served here at /pronunciation-ilar/elor/ (audio -> the silent wav, images -> placeholders).
const {APPS, AUDIO, img, oid} = require('../lib/shared')
const D = require('../lib/data/toolbox-pronunciation-guide')

module.exports = {
	name: 'toolbox-pronunciation-guide',
	prefixes: ['/pronunciation-ilar'],
	ownNodeModules: `${APPS}/toolbox-pronunciation-guide/node_modules`,
	static: [`${APPS}/toolbox-pronunciation-guide/public`],
	pages: [
		{
			id: 'toolbox-pronunciation-guide', path: '/pronunciation-ilar/', query: {contentID: oid('pronunciation-guide', 1)},
			settle: {quietMs: 900, maxMs: 15000},
			notes: '~64 cards (lazy-loaded 48 at a time), filter dropdown, search, modal with image/audio/video, reference popups (tippy, 1s timer). Vimeo iframes are external (blocked).',
			interact: {steps: [
				{kind: 'click', sel: '.desktop-filter-container .dropdown-single-select', label: 'open filter dropdown'},
				{kind: 'click', sel: '.desktop-filter-container .dropdown-item:nth-child(3)', label: 'pick Fungi filter'},
				{kind: 'click', sel: '.desktop-filter-container .dropdown-single-select', label: 'reopen filter dropdown'},
				{kind: 'click', sel: '.desktop-filter-container .dropdown-item:nth-child(1)', label: 'clear filter'},
				{kind: 'click', sel: '.desktop-search-button', label: 'open search'},
				{kind: 'type', sel: '#desktop-search-text', text: 'coc', label: 'search for "coc"'},
				{kind: 'type', sel: '#desktop-search-text', text: 'ia', label: 'search for "ia"'},
				{kind: 'click', sel: '.card-button-wrapper .card-button:nth-child(2)', label: 'open a result card'},
				{kind: 'click', sel: '.modal-audio-wrapper .play-button', label: 'play pronunciation in modal'},
				{kind: 'click', sel: '.modal-audio-wrapper .stop-button', label: 'stop pronunciation'},
				{kind: 'click', sel: '.closeModalButtonWrapper', label: 'close modal'},
				{kind: 'click', sel: '.desktopClearSearchX', label: 'close search'},
				{kind: 'click', sel: '.card-button-wrapper .card-button:nth-child(1) .play-button', label: 'play a card inline'},
				{kind: 'click', sel: '.card-button-wrapper .card-button:nth-child(3)', label: 'open third popular card'},
				{kind: 'click', sel: '.closeModalButtonWrapper', label: 'close modal again'},
				// the step's own scrollIntoView scrolls the list, which is what drives the lazy loader (48 cards, then +2 per scroll event)
				{kind: 'click', sel: '.card-section:nth-of-type(2) .card-button:nth-child(44)', label: 'scroll to the 44th A-Z card and open it'},
				{kind: 'click', sel: '.closeModalButtonWrapper', label: 'close modal (last)'},
			]},
		},
	],
	init(s) {
		s.guides = D.guides()
	},
	routes(r) {
		const find = (ctx, id) => ctx.state.guides.find(g => g._id === id)
		r.all('fetch-content', ctx => {
			let id = ctx.query.contentID
			if (!id || id.length !== 24) {
				return ctx.status(412)
			}
			return find(ctx, id) || ctx.status(404)
		})
		r.all('fetch-metadata', ctx => {
			if (!ctx.query.contentID) {
				return ctx.status(412)
			}
			let g = find(ctx, ctx.query.contentID)
			return g ? D.metadata(g) : []
		})
		r.all('fetch-available-guides', ctx => {
			if (ctx.query.lite === 'true') {
				return ctx.state.guides.map(g => ({_id: g._id, name: g.name, 'home-title': g['home-title'], published: g.published}))
			}
			return ctx.state.guides
		})
		// the guide's resource prefix: assets/audio/<file>.mp3 and assets/img/item-images/<file>
		r.get(/^elor\/assets\/audio\/.+/, ctx => ctx.redirect(AUDIO))
		r.get(/^elor\/assets\/img\/item-images\/(.+)$/, ctx => ctx.redirect(img(480, 320, decodeURIComponent(ctx.match[1]).replace(/\.\w+$/, '').slice(0, 24))))
		r.get(/^elor\/assets\/img\/.+/, ctx => ctx.redirect(img(600, 400, 'bacteria')))
	},
}
