'use strict'
// toolbox-gift-quiz-converter: a Word (.docx) -> Moodle GIFT converter. The only input is a file, which the harness's step kinds cannot
// provide, so GET /gift/ is served with a small script that plays the user picking files:
//  - on load it feeds the first sample document through the real <input type=file> (DataTransfer + change event)
//  - every later click that would open the file picker (click on the drop zone) feeds the next sample instead (input.click() is overridden)
// Samples are the app's own real documents (res/GIFT-formatted-word-documents, local only) served read-only at /gift/__samples/<n>.docx.
// When res/ is not present the synthetic fallback below is used for every sample.
const fs = require('fs')
const path = require('path')
const {APPS} = require('../lib/shared')

const RES = `${APPS}/toolbox-gift-quiz-converter/res/GIFT-formatted-word-documents`
const INDEX = `${APPS}/toolbox-gift-quiz-converter/public/index.html`

// [file under res, name shown in the UI]
const SAMPLES = [
	['raw quizes/Quiz 3 Question Pool.docx', 'Quiz 3 Question Pool.docx'],
	['raw quizes/Quiz 2 week 2.docx', 'Quiz 2 week 2.docx'],
	['test-set/Quiz 2 week 2-corrupted.docx', 'Quiz 2 week 2-corrupted.docx'],
	[null, 'Not really a document.docx'], // plain text with a .docx name: the "does not look like a Word document" error path
	['raw quizes/Quiz 3 week 3 MCQs gift formated.docx', 'Quiz 3 week 3 MCQs gift formated.docx'],
]

function driver(cfg) {
	var next = 1
	function feed(i) {
		var s = cfg.samples[i % cfg.samples.length]
		return fetch(s.url).then(function (r) {
			return r.arrayBuffer()
		}).then(function (buf) {
			var file = new File([buf], s.name, {type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'})
			var dt = new DataTransfer()
			dt.items.add(file)
			var input = document.querySelector('input[type=file]')
			input.files = dt.files
			input.dispatchEvent(new Event('change', {bubbles: true}))
		})
	}
	var realClick = HTMLInputElement.prototype.click
	HTMLInputElement.prototype.click = function () {
		if (this.type === 'file') {
			feed(next++)
			return
		}
		return realClick.apply(this, arguments)
	}
	function boot() {
		if (document.querySelector('input[type=file]') && window.m && window.m.handleFile) {
			feed(0)
		}
		else {
			setTimeout(boot, 50)
		}
	}
	window.addEventListener('load', boot)
}

function sampleBytes(n) {
	let [rel] = SAMPLES[n] || []
	if (rel === null) {
		return Buffer.from('This is plain text, not a zip archive.\n')
	}
	try {
		return fs.readFileSync(path.join(RES, rel))
	}
	catch (e) {
		return null
	}
}

function servePage(ctx) {
	let cfg = {samples: SAMPLES.map(([, name], i) => ({url: `/gift/__samples/${i}.docx`, name}))}
	let html = fs.readFileSync(INDEX, 'utf8').replace('</body>', `<script>(${driver.toString()})(${JSON.stringify(cfg)})</script>\n</body>`)
	return ctx.html(html)
}

module.exports = {
	name: 'toolbox-gift-quiz-converter',
	prefixes: ['/gift'],
	ownNodeModules: `${APPS}/toolbox-gift-quiz-converter/node_modules`,
	static: [`${APPS}/toolbox-gift-quiz-converter/public`],
	pages: [
		{
			id: 'toolbox-gift-quiz-converter', path: '/gift/', query: {},
			settle: {quietMs: 900, maxMs: 15000},
			notes: 'a sample .docx is fed through the real file input on load; clicking the drop zone feeds the next sample (see fixtures file). Parsing runs in the browser (JSZip + giftParser.js, DOMParser)',
			interact: {steps: [
				{kind: 'click', sel: 'details.preview summary', label: 'open GIFT preview'},
				{kind: 'click', sel: '.drop', label: 'choose next file (pool format)'},
				{kind: 'click', sel: 'details.preview summary', label: 'open GIFT preview (2nd file)'},
				{kind: 'click', sel: '.drop', label: 'choose next file (corrupted)'},
				{kind: 'click', sel: '.drop', label: 'choose next file (not a zip at all)'},
				{kind: 'click', sel: '.drop', label: 'choose next file (GIFT as typed)'},
				{kind: 'click', sel: 'details.preview summary', label: 'open GIFT preview (4th file)'},
			]},
		},
	],
	routes(r) {
		r.get('__samples/:n', ctx => {
			let n = parseInt(String(ctx.params.n)) || 0
			let buf = sampleBytes(n)
			if (!buf) {
				return ctx.status(404)
			}
			ctx.res.writeHead(200, {'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'cache-control': 'no-store'})
			ctx.res.end(buf)
		})
		r.get('', servePage)
		r.get('index.html', servePage)
	},
}
