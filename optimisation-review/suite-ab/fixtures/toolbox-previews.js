'use strict'
// toolbox-previews: the shared preview shell. Production's index.js serves the app shell for EVERY first path segment that is not a real file/folder in
// public (the segment is the product type: /previews/reactions/..., /previews/podcast-player/...), and the shell iframes the real product (the same url
// without /previews/, plus preview=true). The harness serves static files only when they exist, so the shell route is reproduced here.
const fs = require('fs')
const {APPS, NOW, DAY, oid, uuid, lorem, img, AUDIO} = require('../lib/shared')

const PV = `${APPS}/toolbox-previews`
const PUBLIC_ENTRIES = new Set(fs.readdirSync(`${PV}/public`))

module.exports = {
	name: 'toolbox-previews',
	prefixes: ['/previews'],
	ownNodeModules: `${PV}/node_modules`,
	static: [`${PV}/public`],
	pages: [
		{
			id: 'toolbox-previews', path: '/previews/reactions/', query: {type: 'page', title: 'Week 3 overview', previewReactionBar: 'true', previewHeight: '30px'},
			notes: 'jqLite page. Standing in for a reaction bar: shell + hover overlay + nested real product (/reactions/?...&preview=true, a jQuery page) + the reaction-bar placeholder under it',
			interact: {
				steps: [
					{kind: 'click', sel: '.ilar-overlay-icon-edit', label: 'edit overlay icon (posts ILARPreviewEdit up)'},
					{kind: 'click', sel: '.ilar-overlay-icon-remove', label: 'remove overlay icon (posts ILARPreviewRemove up)'},
				],
				generic: false,
			},
		},
		{
			id: 'toolbox-previews-audio-player', path: '/previews/podcast-player/',
			query: {title: 'Welcome to the course', author: 'Dr Jordan Lee', mp3: AUDIO, image: img(512, 512, 'Welcome'), previewHeight: '150px'},
			notes: 'jqLite page. Standing in for an audio player (podcast-player with mp3= is typed audio-player): nested /podcast-player/?...&preview=true',
			interact: {
				steps: [
					{kind: 'click', sel: '.ilar-overlay-icon-edit', label: 'edit overlay icon'},
					{kind: 'click', sel: '.ilar-overlay-icon-remove', label: 'remove overlay icon'},
				],
				generic: false,
			},
		},
	],
	init(s) {
	},
	routes(r) {
		// every first segment that is not a real public entry gets the shell (index.js router.use before express.static)
		r.get(/^(?!(?:index\.html|sys)(?:\/|$))[^/]+(?:\/.*)?$/, ctx => {
			let first = ctx.rel.split('/')[0]
			if (PUBLIC_ENTRIES.has(first)) {
				return ctx.file(`${PV}/public/${ctx.rel}`)
			}
			return ctx.html(fs.readFileSync(`${PV}/public/index.html`, 'utf8'))
		})
	},
}
