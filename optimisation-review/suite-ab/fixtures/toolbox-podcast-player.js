'use strict'
// toolbox-podcast-player: the student-facing audio player at /podcast-player.
// Three ways in (all supported by the real app): rss+episode (what the toolbox inserts), episodeID (podcast-manager) and a bare mp3.
// /fetch is answered from podcast-manager's seeded podcasts/episodes (any other feed url gets a deterministic synthetic feed).
const {APPS, NOW, DAY, oid, AUDIO, lorem} = require('../lib/shared')
const P = require('../lib/data/podcast')

const POD = n => oid('podcast', n)
const EP = n => oid('episode', n)
const RSS = id => `https://lti.unisq.edu.au/podcast-manager/api/podcasts/rss?podcastID=${id}`
const atobSafe = s => {
	try {
		return Buffer.from(String(s || ''), 'base64').toString('latin1')
	}
	catch (e) {
		return ''
	}
}
const base = u => String(u || '').split('?')[0].split('/').pop()

// absolute storage urls carry the server port (style attributes are not origin-scrubbed by the snapshot) and the transcript link carries it base64 encoded
const SCRUB = [['127\\.0\\.0\\.1(?::|%3A)\\d+', '127.0.0.1:PORT'], ['(get-transcript\\?url=)[A-Za-z0-9+/=]+(&|&amp;)title=[A-Za-z0-9+/=]+', '$1<b64>$2title=<b64>']]

const SLOW = 450

const PLAY_STEPS = [
	{kind: 'click', sel: '.desktop-player .player-rewindButton', label: 'rewind 10s'},
	{kind: 'click', sel: '.desktop-player .player-forwardButton', label: 'forward 10s'},
	{kind: 'click', sel: '.desktop-player .audio-icon-wrapper[title="Alter playback volume"]', label: 'cycle volume'},
	{kind: 'click', sel: '.desktop-player .audio-icon-wrapper[title="Alter playback volume"]', label: 'cycle volume again'},
	{kind: 'click', sel: '.desktop-player .player-playButton', label: 'play'},
	{kind: 'click', sel: '.desktop-player .player-playButton:nth-child(2)', label: 'pause'},
	{kind: 'click', sel: '.desktop-player .episode-player-progress-wrapper', label: 'seek on progress bar'},
]

module.exports = {
	name: 'toolbox-podcast-player',
	prefixes: ['/podcast-player'],
	ownNodeModules: `${APPS}/toolbox-podcast-player/node_modules`,
	static: [`${APPS}/toolbox-podcast-player/public`],
	pages: [
		{
			id: 'toolbox-podcast-player', scrub: SCRUB, path: '/podcast-player/', query: {rss: RSS(POD(1)), episode: '2', title: 'Podcast player', podcastID: POD(1)},
			settle: {quietMs: 1100, maxMs: 15000},
			notes: 'rss mode (what the toolbox inserts into a course). Audio is the harness silent wav.',
			interact: {steps: PLAY_STEPS},
		},
		{
			id: 'toolbox-podcast-player-episodeid', scrub: SCRUB, path: '/podcast-player/', query: {episodeID: EP(5)},
			settle: {quietMs: 1100, maxMs: 15000},
			notes: 'extra page: episodeID mode, which reads /podcast-manager/api/episodes|podcasts/get (cross-app); the episode has a transcript',
			interact: {steps: PLAY_STEPS.slice(0, 4)},
		},
	],
	init(s) {
		s.positions = {}
		s.transcripts = {}
	},
	routes(r) {
		const mgr = ctx => ctx.appState('podcast-manager') || {podcasts: P.podcasts(), episodes: P.episodes()}
		const hostOf = ctx => `http://${ctx.req.headers.host}`

		// synthetic feed for any rss url that is not podcast-manager's own (deterministic from the url text)
		function syntheticFeed(url) {
			let h = 0
			for (let i = 0; i < url.length; i++) {
				h = (h * 31 + url.charCodeAt(i)) >>> 0
			}
			let pod = {_id: oid('synthetic-feed', h), title: 'External podcast ' + (h % 97), description: lorem(h % 50, 18), cover: 'cover-1.jpg'}
			let eps = []
			for (let k = 0; k < 8; k++) {
				eps.push({_id: oid('synthetic-ep', h + k), title: `External episode ${k + 1}: ${lorem(h + k, 4)}`, description: lorem(h + k + 100, 22), cover: null, mp3: `episode-${(k % 5) + 1}.mp3`, presenter: P.PRESENTERS[k % P.PRESENTERS.length], published: NOW - (8 - k) * 7 * DAY, duration: 900 + k * 61, fileSize: 12000000})
			}
			return {pod, eps}
		}

		// Deliberately slow (see SLOW): the player has a load-order race. The volume/speed bars sit in index.html and link first; the <audio> in
		// sys/pages/player.html links when that template arrives and sets player._speed = 35. If the feed data (m.podcast) is already there by
		// then, the _speed watcher runs and sets playback speed to 1.2x and saves it to the user's settings; if the feed is still on its way it
		// does not (stays 1x). On a fast server both outcomes happen from run to run, so the data is held back to make 1x the stable outcome.
		r.get('fetch', async ctx => {
			await new Promise(resolve => setTimeout(resolve, SLOW))
			let episode = parseInt(ctx.query.episode) - 1
			let feedUrl = ctx.query.rss || ctx.query.feed
			if (!(feedUrl && (episode || episode === 0))) {
				return ctx.status(412)
			}
			let m = /podcastID=([0-9a-f]{24})/.exec(feedUrl)
			let src
			if (feedUrl.indexOf('/podcast-manager/api/podcasts/rss') > -1 && m) {
				let s = mgr(ctx)
				let pod = s.podcasts.find(p => p._id === m[1])
				if (!pod) {
					return ctx.status(404)
				}
				src = {pod, eps: s.episodes.filter(e => e.podcastID === pod._id)}
			}
			else {
				src = syntheticFeed(feedUrl)
			}
			let feed = P.parsedFeed(src.pod, src.eps, hostOf(ctx), src.pod.owner === 'u1234567' ? ctx.session.user.fullName : 'University of Southern Queensland', feedUrl)
			let idx = (feed.items.length - 1) - episode
			let e = feed.items[idx]
			if (!e || !e.enclosure) {
				return ctx.status(404)
			}
			e.mp3 = e.enclosure.url
			e.episodeNumber = idx
			return {podcast: {title: feed.title, description: feed.description, feed: feed.feedUrl, itunes: feed.itunes, image: feed.image || {url: (feed.itunes || {}).image}}, episode: e}
		})
		r.get('fetch-rss', ctx => {
			let feedUrl = ctx.query.rss || ctx.query.feed
			if (!feedUrl) {
				return ctx.status(412)
			}
			let m = /podcastID=([0-9a-f]{24})/.exec(feedUrl)
			let s = mgr(ctx)
			let pod = m && s.podcasts.find(p => p._id === m[1])
			let src = pod ? {pod, eps: s.episodes.filter(e => e.podcastID === pod._id)} : syntheticFeed(feedUrl)
			return P.parsedFeed(src.pod, src.eps, hostOf(ctx), 'University of Southern Queensland', feedUrl)
		})
		r.get('fetch-image', ctx => ctx.query.image ? ctx.redirect('/__fixtures/img/150x150.svg?t=cover') : ctx.status(412))
		r.get('fetch-episode', ctx => ctx.query.mp3 ? ctx.redirect(AUDIO) : ctx.status(412))

		// listening position, keyed like the real collection: {id, user}
		r.all('save-progress', ctx => {
			let position = parseFloat(ctx.query.position)
			if (ctx.query.user && ctx.query.id && !isNaN(position)) {
				ctx.state.positions[ctx.query.user + '|' + ctx.query.id] = position
				return ctx.status(200)
			}
			return ctx.status(412)
		})
		r.get('get-progress', ctx => {
			let pos = ctx.query.user && ctx.query.id ? ctx.state.positions[ctx.query.user + '|' + ctx.query.id] : undefined
			return pos === undefined ? {default: true, position: 0} : {_id: oid('progress', 1), id: ctx.query.id, user: ctx.query.user, position: pos}
		})

		// transcripts: held per mp3 url; podcast-manager episodes carry theirs. Mirrors the real handler's checkOnly quirk
		// (the *client* sends checkOnly=true to ask "is there one", the server variable is the inverse and answers with json)
		r.get('get-transcript', ctx => {
			let title = ctx.query.title ? atobSafe(ctx.query.title).replace(/[/\\?%*:|"<>]/g, '-') : null
			let url = ctx.query.url ? atobSafe(ctx.query.url) : null
			let checkOnly = ctx.query.checkOnly !== 'true'
			if (!(url && title && url.substring(0, 5) !== 'blob:')) {
				return ctx.status(412)
			}
			let transcript = ctx.state.transcripts[url]
			if (transcript === undefined) {
				let ep = mgr(ctx).episodes.find(e => e.mp3 === base(url))
				transcript = ep && ep.transcript ? ep.transcript : false
			}
			if (transcript) {
				if (checkOnly) {
					ctx.res.writeHead(200, {'content-type': 'text/plain; charset=utf-8', 'content-disposition': `attachment; filename="${title}.txt"`})
					return ctx.res.end(transcript)
				}
				return ctx.json(transcript)
			}
			ctx.state.transcripts[url] = false
			return checkOnly ? ctx.status(404) : ctx.json(false)
		})
		r.get('get-panopto-status', ctx => {
			let url = ctx.query.url ? atobSafe(ctx.query.url) : null
			if (url && url.includes('https://usq.au.panopto.com/Panopto/Podcast/Syndication/')) {
				return {status: 'n/a'}
			}
			return ctx.status(412)
		})
		r.post('ingest-new-media', ctx => ctx.status(200))
	},
}
