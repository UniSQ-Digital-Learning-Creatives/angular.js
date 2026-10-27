'use strict'
// Pronunciation guides, built from the app's own sample dataset (assets/js/data.js, the debug copy of a real guide) plus generated
// extra items so the lazy-loading list (48 at a time) and the filters have something to do.
const fs = require('fs')
const vm = require('vm')
const {APPS, oid, lorem} = require('../shared')

const SRC = `${APPS}/toolbox-pronunciation-guide/assets/js/data.js`
const PREFIX = '/pronunciation-ilar/elor/'

let base = null
function loadBase() {
	if (!base) {
		base = vm.runInNewContext(fs.readFileSync(SRC, 'utf8') + '\n;db')
	}
	return JSON.parse(JSON.stringify(base))
}

const GENERA = ['Acinetobacter', 'Bacteroides', 'Campylobacter', 'Corynebacterium', 'Enterococcus', 'Haemophilus', 'Klebsiella', 'Legionella', 'Listeria', 'Mycobacterium', 'Neisseria', 'Pasteurella',
	'Serratia', 'Shigella', 'Treponema', 'Vibrio', 'Yersinia', 'Aspergillus', 'Cryptococcus', 'Trichophyton', 'Toxoplasma', 'Trypanosoma', 'Leishmania', 'Cryptosporidium']
const SPECIES = ['baumannii', 'fragilis', 'jejuni', 'diphtheriae', 'faecalis', 'influenzae', 'pneumoniae', 'pneumophila', 'monocytogenes', 'tuberculosis', 'meningitidis', 'multocida', 'marcescens', 'sonnei',
	'pallidum', 'cholerae', 'pestis', 'fumigatus', 'neoformans', 'rubrum', 'gondii', 'brucei', 'donovani', 'parvum']
const FILTERS = ['Bacteria', 'Fungi', 'Parasites', 'Gram positive', 'Gram negative']

function guide(n, name, homeTitle, extraItems) {
	let db = loadBase()
	db._id = oid('pronunciation-guide', n)
	db.name = name
	db['home-title'] = homeTitle
	db['home-sub-title'] = 'Select an item to hear how it is pronounced'
	db['selection-name'] = 'Item selection'
	db['selection-description'] = lorem(n, 12)
	db.elorResourcePrefix = PREFIX
	db.published = true
	db.filters = FILTERS.slice()
	db['item-list'].forEach((item, i) => {
		item.tags = [FILTERS[i % 3], FILTERS[3 + (i % 2)]]
		if (i % 7 === 3) {
			item.videoID = '76979871'
		}
		item.italicItemName = i % 2 === 0
	})
	for (let k = 0; k < extraItems; k++) {
		let genus = GENERA[k % GENERA.length], species = SPECIES[(k * 5 + Math.floor(k / GENERA.length) * 3) % SPECIES.length]
		db['item-list'].push({
			itemName: `${genus} ${species}`, pronunciation: `${genus.slice(0, 3).toLowerCase()}-oh-${species.slice(0, 3).toLowerCase()}-EE-us`, active: k % 11 !== 10, italicItemName: true,
			basic: `<p><strong><em>${genus[0]}. ${species}</em></strong> ${lorem(n * 100 + k, 34)}</p><p>${lorem(n * 100 + k + 1, 22)}</p>`,
			basicImage: k % 3 === 0 ? `generated-${k}.jpg` : '', mp3s: [k % 9 === 8 ? '' : `ps_Generated${k}.mp3`].filter(Boolean), tags: [FILTERS[k % 3], FILTERS[3 + (k % 2)]],
		})
	}
	return db
}

function guides() {
	return [
		guide(1, 'Microbiology pronunciation guide', 'Microbiology pronunciation guide', 70),
		guide(2, 'Anatomy terms', 'Anatomy terms', 6),
		guide(3, 'Medical terminology', 'Medical terminology', 14),
		guide(4, 'Languages of the Pacific', 'Languages of the Pacific', 3),
	]
}

// fetch-metadata: one record per "item selection" analytics event; counts decide "Most popular"
function metadata(db) {
	let out = []
	let names = db['item-list'].map(i => i.itemName)
	let weights = [14, 3, 22, 9, 6, 17, 2, 11, 5, 8]
	weights.forEach((w, k) => {
		let item = names[(k * 3) % names.length]
		for (let j = 0; j < w; j++) {
			out.push({_id: oid('pron-meta', out.length + 1), meta: {item}})
		}
	})
	return out
}

module.exports = {guides, metadata, PREFIX, FILTERS}
