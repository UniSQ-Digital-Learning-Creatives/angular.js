'use strict'
// toolbox-sample-app: the copy-me boilerplate for new sibling apps. It has no routes, no templates and an empty <body> (index.html is just the script tags and
// `<body ng-cloak>` with nothing in it; main.js only sets m.user/m.activity and fires one 'loaded' analytics event), so there is nothing to render and
// nothing to stub: the page legitimately shows no text. The session arrives over the network (the page is not given sessionData), which is the only
// thing that happens: fetchActivity -> /get-session-formatted -> m.initialize() -> reportAnalytics (beacon, 204).
const {APPS} = require('../lib/shared')

module.exports = {
	name: 'toolbox-sample-app',
	prefixes: ['/sample'],
	ownNodeModules: `${APPS}/toolbox-sample-app/node_modules`,
	static: [`${APPS}/toolbox-sample-app/public`],
	pages: [
		{
			id: 'sample-app', path: '/sample/', query: {},
			notes: 'Boilerplate: empty body by design (see file header). Exercises angular bootstrap + fetchActivity + one analytics beacon only.',
			interact: {steps: [], generic: false},
		},
	],
	init(s) {
	},
	routes(r) {
	},
}
