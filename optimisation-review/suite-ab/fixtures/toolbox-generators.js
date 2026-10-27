'use strict'
// toolbox-generators: static pages at /image-generators, /banner-generator + API stubs.
//
// The generators are normally iframes inside the toolbox (editors, ?mode=toolbox) or inside Moodle course pages (embeds). They get
// their saved design from the PARENT: the editors read window.parent.m.$root.newIlar (name / params / data-toolbox-config), the embeds
// read window.name (the iframe's name="" attribute). The harness opens every page top-level, so for the pages that need parent-supplied
// state this fixture serves the real index.html / embed.html with ONE small script added (see `withParent` / `withName` below):
//   editors: `angular.module(<ng-app>).run(...)` that seeds $rootScope.newIlar (the editors reach it as window.parent.m.$root.newIlar,
//            and window.parent === window here) - exactly what the toolbox's showInstallScreen leaves there when editing an insert;
//   embeds:  `window.name = <the compressed data string>` before anything else runs.
// Nothing else in the app files is changed.
const fs = require('fs')
const {APPS, NOW, DAY, oid, uuid, lorem, img} = require('../lib/shared')
const G = require('../lib/data/generators')

const PUBLIC = `${APPS}/toolbox-generators/public`
const htmlCache = {}
const readHtml = (rel) => htmlCache[rel] || (htmlCache[rel] = fs.readFileSync(`${PUBLIC}/${rel}`, 'utf8'))
const safe = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')

// What the toolbox's chrome gives the iframe that the generators reach for with window.parent.* (all tiny, none of it changes the generators themselves)
const TOOLBOX_CHROME = {
	saveAsTemplateButton: '<div class="btn-save-as-template" style="position:fixed;right:8px;bottom:8px;padding:4px 10px;background:#eee;font:12px sans-serif;border-radius:4px;cursor:pointer;z-index:5">Save as template</div>',
	// the toolbox's inline photography-gallery iframe. The real one calls window.parent.m.$root.showInlinePhotography.setBannerImage(url) on click and
	// previewBannerImage(url) on hover; these thumbnails do the same so "pick an image" can be driven without the gallery app.
	photographyIframe: '<div class="inline-photography-iframe" style="position:fixed;left:8px;bottom:8px;z-index:5;display:flex;gap:4px;padding:4px;background:#fff;border:1px solid #ccc">' +
		[1, 2, 3].map(n => `<img class="stub-photo" alt="" width="64" height="40" style="cursor:pointer" src="${img(64, 40, 'p' + n)}" data-path="/photography-gallery/photos/${G.photo(60 + n)}" ` +
			`onmouseenter="var t=m.$root.showInlinePhotography;t&&t.previewBannerImage&&(t.previewBannerImage(location.origin+this.dataset.path),t.$applyAsync())" ` +
			`onclick="var t=m.$root.showInlinePhotography;if(t&&t.setBannerImage){t.setBannerImage(location.origin+this.dataset.path);t.galleryOpen=false;m.$root.showInlinePhotography=null;m.$root.$applyAsync()}">`).join('') + '</div>',
}

// Serve an editor's index.html with $rootScope seeded (what the parent toolbox would have put in $root)
function withParent(rel, root, extraBody) {
	let html = readHtml(rel)
	let app = /ng-app="([^"]+)"/.exec(html)[1]
	let script = `<script>angular.module(${safe(app)}).run(['$rootScope',function($rootScope){var s=${safe(root || {})};for(var k in s){$rootScope[k]=s[k]}}])</script>${extraBody || ''}`
	return html.replace('</body>', () => script + '</body>')
}

// Serve an embed.html with the iframe name already set
function withName(rel, name, extraHead) {
	let html = readHtml(rel)
	return html.replace(/<head>/i, () => `<head><script>window.name=${safe(name)}</script>${extraHead || ''}`)
}

// Minimal stand-in for the Rive runtime (unpkg.com/@rive-app/webgl2 is blocked by the harness). Same surface the generators use.
const RIVE_STUB = `<script>(function(){
function Rive(o){var self=this;this.o=o;this.stateMachineNames=['Hover Reactions','Main Timeline'];this.bounds={minX:0,minY:0,maxX:1920,maxY:1080};this.artboardWidth=1920;this.artboardHeight=1080;
 this.isPlaying=!!o.autoplay;var c=o.canvas;if(c&&c.getContext){try{var x=c.getContext('2d');if(x){x.fillStyle='#e8eef7';x.fillRect(0,0,c.width||300,c.height||150);x.fillStyle='#3b6fb6';x.fillRect(10,10,60,40)}}catch(e){}}
 setTimeout(function(){o.onLoad&&o.onLoad()},0)}
Rive.prototype.cleanup=function(){};Rive.prototype.play=function(){this.isPlaying=true};Rive.prototype.resizeDrawingSurfaceToCanvas=function(){};Rive.prototype.pause=function(){};
window.rive={Rive:Rive}})()</script>`


// The overlay buttons (edit text / icon / remove ...) build their tippy popup lazily on the first mouseenter and only wire the click once that has
// finished, so "hover then click" is racy when both land within a few ms (a human hovers long before clicking). To keep the steps deterministic the
// buttons they use are hovered again after every re-render (a theme switch rebuilds every tile): a bubbling `mouseover`, which is what jQuery/jqLite turn into mouseenter.
const primeHover = (sels) => `<script>(function(){var s=${safe(sels)},tm;function hover(){s.forEach(function(q){var e=document.querySelector(q);e&&e.dispatchEvent(new MouseEvent('mouseover',{bubbles:true,cancelable:true,view:window}))})}` +
	`function later(){clearTimeout(tm);tm=setTimeout(hover,30)}new MutationObserver(later).observe(document.documentElement,{childList:true,subtree:true});later()})()</script>`

// A "Moodle" API that never answers: the course banner generator's fetch(`${lms_url}/...`) calls are blocked by the harness anyway.


// repaintButtons()/repaintCards() (called from a ResizeObserver) leave style="transform: unset !important" on whichever tiles/cards exist at that
// instant; gallery previews are rendered lazily (IntersectionObserver) so whether they were there yet is a pure timing race, not a build difference.
// (tippy numbers its popups in creation order, and the icon-mode watcher rebuilds them off a 100ms timer, so the id counter is timing dependent too)
const REPAINT_SCRUB = [[' style="transform: (?:unset !important|translateZ\\(0px\\))"', ''], ['id="tippy-\\d+"', 'id="tippy-N"']]

// ---- hand-written interaction steps (what a designer / student does) ------------------------------------------------------------
// Steps only click / type / select by css selector. The overlay buttons (edit text, icon, remove ...) build their tippy popup lazily on the
// first interaction, so those are clicked twice (first click builds it, second opens it) - same as a human's mouseenter + click.
const nth = (root, n) => `${root} > :nth-child(${n})`
const btTile = (n) => nth('.generated-data .buttons-and-tiles', n)
const cardAt = (n) => nth('.generated-data .toolbox-cards', n)
const optLayout = (row, k) => `${row} .options-layout-wrapper:nth-child(2) .icon-layout:nth-child(${k})`
const optAlign = (row, k) => `${row} .options-layout-wrapper:nth-child(3) .icon-layout:nth-child(${k})`

const BT_STEPS = [
	{kind: 'click', sel: optLayout('.options-row-toolbox', 3), label: 'layout: 2 columns'},
	{kind: 'click', sel: optAlign('.options-row-toolbox', 3), label: 'align: centre'},
	{kind: 'click', sel: '.options-row-toolbox colour-dots .dot:nth-child(4)', label: 'colour: green'},
	{kind: 'select', sel: '.options-row-toolbox .options-icon-select', index: 2, label: 'icon option: chevron'},
	{kind: 'select', sel: '.options-row-toolbox .options-theme-select', index: 2, label: 'theme: large text buttons'},
	{kind: 'select', sel: '.options-row-toolbox .options-icon-select', index: 3, label: 'icon option: icon set'},
	{kind: 'select', sel: '.options-row-toolbox .options-theme-select', index: 4, label: 'theme: tiles behind text'},
	{kind: 'click', sel: `${btTile(1)} .edit-overlay-button-edit-text`, label: 'tile 1: edit text'},
	{kind: 'type', sel: 'input[placeholder="Enter text here"]', text: 'Week 1: Getting started (updated)', label: 'tile 1: type into text popup'},
	{kind: 'click', sel: '.options-row-title', label: 'click away (closes popups, moves the pointer off the tiles)'},
	{kind: 'click', sel: `${btTile(2)} .edit-overlay-button-edit-icon`, label: 'tile 2: icon picker'},
	{kind: 'click', sel: '.tippy-box .overlay-popup-icon:nth-child(9)', label: 'tile 2: pick an icon'},
	{kind: 'click', sel: '.options-row-title', label: 'click away (closes popups, moves the pointer off the tiles)'},
	{kind: 'click', sel: `${btTile(4)} .edit-overlay-button-edit-image`, label: 'tile 4: change image (opens the inline gallery)'},
	{kind: 'click', sel: '.stub-photo:nth-child(2)', label: 'tile 4: pick a photo in the gallery'},
	{kind: 'click', sel: `${btTile(6)} .add-new-button`, label: 'add a tile'},
	{kind: 'click', sel: `${btTile(3)} .edit-overlay-button-delete`, label: 'tile 3: remove'},
	{kind: 'click', sel: '.tippy-box .tb-btn-outline', label: 'confirm remove'},
	{kind: 'click', sel: '.options-row-title', label: 'click away (closes popups, moves the pointer off the tiles)'},
	{kind: 'click', sel: '.btn-save-as-template', label: 'save as template'},
	{kind: 'type', sel: 'input[placeholder="Enter template name here"]', text: 'My launch tiles', label: 'template name'},
	{kind: 'click', sel: '.tippy-box .overlay-popup-button', label: 'save template'},
	{kind: 'click', sel: '.options-row-title', label: 'click away (closes popups, moves the pointer off the tiles)'},
	{kind: 'click', sel: '.templates-wrapper-option-dropdown', label: 'open template gallery'},
	{kind: 'select', sel: '.options-template-filter-select', index: 1, label: 'gallery filter: used in this course'},
	{kind: 'select', sel: '.options-template-filter-select', index: 0, label: 'gallery filter: saved templates'},
	{kind: 'type', sel: '.options-template-search', text: 'links', label: 'gallery search'},
	{kind: 'click', sel: '.template-gallery-entry', label: 'load a template from the gallery'},
]

const CARDS_STEPS = [
	{kind: 'click', sel: optLayout('.options-row', 3), label: 'layout: 2 columns'},
	{kind: 'click', sel: optAlign('.options-row', 3), label: 'align: centre'},
	{kind: 'click', sel: '.options-row colour-dots .dot:nth-child(2)', label: 'accent: gold'},
	{kind: 'select', sel: '.options-reveal-select', index: 1, label: 'reveal: click only'},
	{kind: 'click', sel: cardAt(1), label: 'flip card 1'},
	{kind: 'select', sel: '.options-theme-select', index: 2, label: 'theme: link card'},
	{kind: 'select', sel: '.options-icon-select', index: 2, label: 'icon option: chevron'},
	{kind: 'select', sel: '.options-theme-select', index: 3, label: 'theme: plain card'},
	{kind: 'select', sel: '.options-theme-select', index: 1, label: 'theme: flip card'},
	{kind: 'select', sel: '.options-icon-select', index: 3, label: 'icon option: icon set'},
	{kind: 'click', sel: `${cardAt(1)} .edit-overlay-button-edit-title`, label: 'card 1: edit title'},
	{kind: 'type', sel: 'input[placeholder="Enter the card title here"]', text: 'Reading actively (v2)', label: 'card 1: type title'},
	{kind: 'click', sel: '.options-row-title', label: 'click away (closes popups, moves the pointer off the tiles)'},
	{kind: 'click', sel: `${cardAt(2)} .edit-overlay-button-edit-text`, label: 'card 2: edit text'},
	{kind: 'type', sel: 'textarea[placeholder="Enter the card text here"]', text: 'Swap drafts, then give one strength and one suggestion each.', label: 'card 2: type text'},
	{kind: 'click', sel: '.options-row-title', label: 'click away (closes popups, moves the pointer off the tiles)'},
	{kind: 'click', sel: `${cardAt(3)} .edit-overlay-button-edit-icon`, label: 'card 3: icon picker'},
	{kind: 'click', sel: '.tippy-box .overlay-popup-icon:nth-child(12)', label: 'card 3: pick an icon'},
	{kind: 'click', sel: '.options-row-title', label: 'click away (closes popups, moves the pointer off the tiles)'},
	{kind: 'click', sel: `${cardAt(5)} .edit-overlay-button-edit-image`, label: 'card 5: change image (opens the inline gallery)'},
	{kind: 'click', sel: '.stub-photo:nth-child(3)', label: 'card 5: pick a photo in the gallery'},
	{kind: 'click', sel: `${cardAt(6)} .add-new-card`, label: 'add a card'},
	{kind: 'click', sel: `${cardAt(4)} .edit-overlay-button-delete`, label: 'card 4: remove'},
	{kind: 'click', sel: '.tippy-box .tb-btn-outline', label: 'confirm remove'},
	{kind: 'click', sel: '.options-row-title', label: 'click away (closes popups, moves the pointer off the tiles)'},
	{kind: 'click', sel: '.btn-save-as-template', label: 'save as template'},
	{kind: 'type', sel: 'input[placeholder="Enter template name here"]', text: 'My study cards', label: 'template name'},
	{kind: 'click', sel: '.tippy-box .overlay-popup-button', label: 'save template'},
	{kind: 'click', sel: '.options-row-title', label: 'click away (closes popups, moves the pointer off the tiles)'},
	{kind: 'click', sel: '.templates-wrapper-option-dropdown', label: 'open template gallery'},
	{kind: 'select', sel: '.options-template-filter-select', index: 2, label: 'gallery filter: added by you'},
	{kind: 'select', sel: '.options-template-filter-select', index: 0, label: 'gallery filter: saved templates'},
	{kind: 'type', sel: '.options-template-search', text: 'tips', label: 'gallery search'},
	{kind: 'click', sel: '.template-gallery-entry', label: 'load a template from the gallery'},
]

const COUNTER_STEPS = [
	{kind: 'click', sel: '.labels label:nth-child(1) .inc-button', label: 'readings +1'},
	{kind: 'click', sel: '.labels label:nth-child(1) .inc-button', label: 'readings +1 again'},
	{kind: 'click', sel: '.labels label:nth-child(2) .dec-button', label: 'audios -1'},
	{kind: 'type', sel: '#activities', text: '14', label: 'activities: type 14'},
	{kind: 'type', sel: '#duration-1', text: '3', label: 'duration hours: type 3'},
	{kind: 'type', sel: '#duration-2', text: '15', label: 'duration minutes: type 15'},
	{kind: 'click', sel: 'colour-dots .dot:nth-child(4)', label: 'colour: green'},
	{kind: 'type', sel: '#videos', text: '0', label: 'videos: type 0 (item disappears)'},
	{kind: 'click', sel: '.reset-button', label: 'clear (reset)'},
	{kind: 'click', sel: '.labels label:nth-child(3) .inc-button', label: 'activities +1 after reset'},
]

const BANNER_STEPS = [
	{kind: 'click', sel: '.gradient-wrapper .dots .dot:nth-child(3)', label: 'gradient: orange'},
	{kind: 'click', sel: '.gradient-wrapper .dots .dot:nth-child(5)', label: 'gradient: blue'},
	{kind: 'type', sel: '.textbox .text', text: 'Welcome to ABC3001: Learning Foundations', label: 'banner text'},
	{kind: 'click', sel: '.pick-image-button', label: 'select image (opens inline gallery)'},
	{kind: 'click', sel: '.stub-photo:nth-child(1)', label: 'pick a photo in the gallery'},
	{kind: 'click', sel: '.gradient-wrapper .dots .dot:nth-child(2)', label: 'gradient: yellow'},
	{kind: 'click', sel: '.pick-image-button', label: 'select image again'},
	{kind: 'click', sel: '.pick-image-button', label: 'close gallery'},
]

const COURSE_BANNER_STEPS = [
	{kind: 'click', sel: '.dots-wrapper colour-dots .dot:nth-child(3)', label: 'gradient: orange'},
	{kind: 'click', sel: '.dots-wrapper colour-dots .dot:nth-child(5)', label: 'gradient: blue'},
	{kind: 'click', sel: '.pick-image-button', label: 'select image (opens inline gallery)'},
	{kind: 'click', sel: '.stub-photo:nth-child(2)', label: 'pick a photo in the gallery'},
	{kind: 'click', sel: '.brighten-wrapper', label: 'brighten toggle'},
	{kind: 'click', sel: '.dots-wrapper colour-dots .dot:nth-child(2)', label: 'gradient: gold'},
]

const HR_STEPS = [
	{kind: 'click', sel: '.copy-button', label: 'copy the <hr> html'},
]

const INTRO_STEPS = [
	{kind: 'click', sel: '.options-row:nth-child(3) .ilar-option-input-subtitle', label: 'style: quote text'},
	{kind: 'click', sel: '.options-row:nth-child(5) .ilar-option-input-subtitle', label: 'style: background call-out'},
	{kind: 'click', sel: 'colour-dots .dot:nth-child(5)', label: 'colour: blue'},
	{kind: 'click', sel: '.options-row:nth-child(7) .ilar-option-input-subtitle', label: 'style: sensitive text'},
	{kind: 'click', sel: 'colour-dots .dot:nth-child(2)', label: 'colour: gold'},
	{kind: 'click', sel: '.options-row:nth-child(2) .ilar-option-input-subtitle', label: 'style: introduction text'},
]

const TABLES_STEPS = [
	{kind: 'click', sel: '.options-row:nth-child(2) .ilar-option-input-subtitle', label: 'style: clean'},
	{kind: 'click', sel: '.options-row:nth-child(4) .ilar-option-input-subtitle', label: 'style: horiz + vert lines'},
	{kind: 'click', sel: '.table-add-header-tickbox .ilar-option-input-subtitle', label: 'header row: toggle off'},
	{kind: 'click', sel: '.table-add-header-tickbox .ilar-option-input-subtitle', label: 'header row: toggle on'},
	{kind: 'click', sel: '.table-cols-picker-wrapper .inc-button', label: 'columns +1'},
	{kind: 'click', sel: '.table-cols-picker-wrapper .dec-button', label: 'columns -1'},
	{kind: 'click', sel: '.table-rows-picker-wrapper .inc-button', label: 'rows +1'},
	{kind: 'type', sel: '.table-rows-picker-wrapper input', text: '4', label: 'rows: type 4'},
	{kind: 'click', sel: 'colour-dots .dot:nth-child(3)', label: 'colour: orange'},
	{kind: 'click', sel: '.options-row:nth-child(6) .ilar-option-input-subtitle', label: 'style: alt rows + vert lines'},
]

const RESOURCE_STEPS = [
	{kind: 'click', sel: '.options-row:nth-child(4) .ilar-option-input-subtitle', label: 'field: content area on'},
	{kind: 'click', sel: '.options-row:nth-child(3) .ilar-option-input-subtitle', label: 'field: introduction off'},
	{kind: 'click', sel: '.options-row:nth-child(6) .ilar-option-input-subtitle', label: 'field: technical specs'},
	{kind: 'click', sel: '.options-row:nth-child(8) .ilar-option-input-subtitle', label: 'field: further resources off'},
	{kind: 'click', sel: 'colour-dots .dot:nth-child(2)', label: 'colour: gold'},
	{kind: 'click', sel: '.options-row:nth-child(2) .ilar-option-input-subtitle', label: 'field: resource title off'},
]

const PROFILE_STEPS = [
	{kind: 'click', sel: 'colour-dots .dot:nth-child(4)', label: 'border colour: green'},
	{kind: 'click', sel: 'colour-dots .dot:nth-child(2)', label: 'border colour: gold'},
]

const RIVE_EDITOR_STEPS = [
	{kind: 'click', sel: '.state-machine:nth-child(1) input', label: 'state machine: first'},
	{kind: 'click', sel: '.state-machine:nth-child(2) input', label: 'state machine: second'},
	{kind: 'click', sel: '.settings-options label.checkbox-label:nth-of-type(1)', label: 'option: autoplay off'},
	{kind: 'click', sel: '.settings-options label.checkbox-label:nth-of-type(2)', label: 'option: reaction bar on'},
	{kind: 'click', sel: '.preview-frame', label: 'start the paused preview'},
	{kind: 'click', sel: '.settings-options label.checkbox-label:nth-of-type(1)', label: 'option: autoplay on'},
]

const RIVE_PLAYER_STEPS = [
	{kind: 'click', sel: '.rive-play', label: 'press play'},
]

const BT_EMBED_STEPS = [
	{kind: 'click', sel: '.buttons-and-tiles > :nth-child(6)', label: 'click the tile that has no link'},
]

const CARDS_EMBED_STEPS = [
	{kind: 'click', sel: '.toolbox-cards > :nth-child(1)', label: 'flip card 1'},
	{kind: 'click', sel: '.toolbox-cards > :nth-child(3)', label: 'flip card 3'},
	{kind: 'click', sel: '.toolbox-cards > :nth-child(1)', label: 'unflip card 1'},
	{kind: 'click', sel: '.toolbox-cards > :nth-child(4)', label: 'flip card 4 (no link)'},
]

module.exports = {
	name: 'toolbox-generators',
	prefixes: ['/image-generators', '/banner-generator'],
	ownNodeModules: `${APPS}/toolbox-generators/node_modules`,
	static: [`${APPS}/toolbox-generators/public`],
	pages: [
		// ---- editors (opened the way the toolbox opens them: ?mode=toolbox, re-opening an existing insert where the generator supports it)
		{id: 'gen-banner-generator', path: '/image-generators/banner-generator/', query: {mode: 'toolbox'}, interact: {steps: BANNER_STEPS},
			notes: 'Welcome banner editor. Blank (it has no saved-design concept: the banner is an <img> built from the svg + text). Select image toggles the toolbox inline gallery, stubbed as an empty hidden div.'},
		{id: 'gen-buttons-and-tiles', path: '/image-generators/buttons-and-tiles/', query: {mode: 'toolbox'}, interact: {steps: BT_STEPS}, scrub: REPAINT_SCRUB,
			notes: 'Re-opens a saved 6-tile design from $root.newIlar.name (the toolbox\'s edit-existing path). Template gallery fed by fetch-all-buttons-and-tiles-existing (14 saved templates over 2 pages + inserted ones).'},
		{id: 'gen-cards', path: '/image-generators/cards/', query: {mode: 'toolbox'}, interact: {generic: false, steps: CARDS_STEPS}, scrub: REPAINT_SCRUB,
			notes: 'Re-opens a saved 6-card flip-card design from $root.newIlar.name. Gallery fed by fetch-all-cards-existing.'},
		{id: 'gen-counter-button-editor', path: '/image-generators/counter-button-editor/', query: {mode: 'toolbox'}, interact: {steps: COUNTER_STEPS},
			notes: 'Re-opens an existing activity summary graphic (newIlar.params.data); contains a nested same-origin embed.html iframe preview.'},
		{id: 'gen-course-banner-generator', path: '/image-generators/course-banner-generator/', query: {mode: 'toolbox'}, interact: {steps: COURSE_BANNER_STEPS},
			notes: 'Moodle fetches (`${lms_url}/course/edit.php` ...) only run on Apply/save and are never reached here; the banner svg->canvas path runs (needs /styles/palette.min.css).'},
		{id: 'gen-horizontal-rule', path: '/image-generators/horizontal-rule/', query: {}, interact: {steps: HR_STEPS},
			notes: 'Static info page; its hero image is on lor.usq.edu.au (blocked).'},
		{id: 'gen-introduction-text', path: '/image-generators/introduction-text/', query: {mode: 'toolbox'}, interact: {steps: INTRO_STEPS},
			notes: 'Re-opens a saved text style from data-toolbox-config.'},
		{id: 'gen-profile-image-generator', path: '/image-generators/profile-image-generator/', query: {mode: 'toolbox'}, interact: {steps: PROFILE_STEPS},
			notes: 'Re-opens a saved profile image (params.source fetched from /storage/.../profile-images/<id>.webp, served as a generated PNG).'},
		{id: 'gen-resource-templates', path: '/image-generators/resource-templates/', query: {mode: 'toolbox'}, interact: {steps: RESOURCE_STEPS},
			notes: 'Re-opens a saved config from data-toolbox-config; the icons are fetched from /images/icons (toolbox).'},
		{id: 'gen-rive-player-editor', path: '/image-generators/rive-player-editor/', query: {mode: 'toolbox'}, interact: {steps: RIVE_EDITOR_STEPS},
			notes: 'Re-opens an existing player (params.rive, fetched as a fake .riv). Rive runtime (unpkg.com/@rive-app/webgl2, blocked) is replaced by a tiny stub so the state-machine list / aspect ratio / preview paths run.'},
		{id: 'gen-rive-player', path: '/image-generators/rive-player/', query: {rive: '/storage/production/interactives/rive-test/treasure_valley_interactive_map.riv', stateMachine: 'Hover Reactions', autoplay: 'false'}, interact: {steps: RIVE_PLAYER_STEPS},
			notes: 'The player with autoplay=false (shows the play button). Rive runtime stubbed (unpkg blocked).'},
		{id: 'gen-tables', path: '/image-generators/tables/', query: {mode: 'toolbox'}, interact: {steps: TABLES_STEPS},
			notes: 'Re-opens a saved 5x9 "alt rows + vert lines" table config.'},
		// ---- student-facing embeds (jqLite, no jQuery). iframe src as the editors write it: embed.html?id=<saved design id>; data comes in via window.name
		{id: 'gen-buttons-and-tiles-embed', scrub: REPAINT_SCRUB, path: '/image-generators/buttons-and-tiles/embed.html', query: {id: G.BT_IDS[0]}, session: {role: 'student'}, interact: {steps: BT_EMBED_STEPS},
			notes: 'EMBED, jqLite. 6 tiles with image above text + icon set (window.name data, as the editor serialises it).'},
		{id: 'gen-buttons-and-tiles-embed-standard', scrub: REPAINT_SCRUB, path: '/image-generators/buttons-and-tiles/embed.html', query: {id: G.BT_IDS[1]}, session: {role: 'student'}, interact: {generic: false, steps: []},
			notes: 'EMBED variant: 5 standard text buttons + chevron, 2 columns.'},
		{id: 'gen-buttons-and-tiles-embed-large', scrub: REPAINT_SCRUB, path: '/image-generators/buttons-and-tiles/embed.html', query: {id: G.BT_IDS[2]}, session: {role: 'student'}, interact: {steps: [{kind: 'click', sel: '.buttons-and-tiles > :nth-child(4)', label: 'click the button that has no link'}]},
			notes: 'EMBED variant: 4 large text buttons + icon set, centre aligned, one with whitespace-only text (hidden label branch).'},
		{id: 'gen-buttons-and-tiles-embed-banner', scrub: REPAINT_SCRUB, path: '/image-generators/buttons-and-tiles/embed.html', query: {id: G.BT_IDS[3], mode: 'banners'}, session: {role: 'student'}, interact: {generic: false, steps: []},
			notes: 'EMBED variant: mode=banners (welcome banner), tiles behind text, chevron, motion on, 3 tiles single column.'},
		{id: 'gen-cards-embed', scrub: REPAINT_SCRUB, path: '/image-generators/cards/embed.html', query: {id: G.CARD_IDS[0]}, session: {role: 'student'}, interact: {steps: CARDS_EMBED_STEPS},
			notes: 'EMBED, jqLite. 6 flip cards (image front, text behind), icon set.'},
		{id: 'gen-cards-embed-link', scrub: REPAINT_SCRUB, path: '/image-generators/cards/embed.html', query: {id: G.CARD_IDS[1]}, session: {role: 'student'}, interact: {generic: false, steps: []},
			notes: 'EMBED variant: 4 "image card with link bar" cards + chevron, 2 columns.'},
		{id: 'gen-cards-embed-plain', scrub: REPAINT_SCRUB, path: '/image-generators/cards/embed.html', query: {id: G.CARD_IDS[2]}, session: {role: 'student'}, interact: {generic: false, steps: []},
			notes: 'EMBED variant: 5 plain image cards, centre aligned.'},
		{id: 'gen-counter-button-editor-embed', path: '/image-generators/counter-button-editor/embed.html', query: {cdtID: G.COUNTERS.full.cdtID, data: JSON.stringify(G.COUNTERS.full)}, session: {role: 'student'}, interact: {generic: false, steps: []},
			notes: 'EMBED, jqLite. Activity summary graphic with all five items.'},
		{id: 'gen-counter-button-editor-embed-partial', path: '/image-generators/counter-button-editor/embed.html', query: {cdtID: G.COUNTERS.partial.cdtID, data: JSON.stringify(G.COUNTERS.partial)}, session: {role: 'student'}, interact: {generic: false, steps: []},
			notes: 'EMBED variant: singular labels, items with 0 hidden, green.'},
	],
	// per-server state (reset by /__reset): everything the stub backend keeps in memory
	init(s) {
		s.btSaved = {}      // templates saved through save-buttons-and-tiles-template, by _id
		s.cardsSaved = {}
		s.profileSaves = 0
		s.riveSaves = 0
	},
	routes(r) {
		const ctxInfo = (ctx) => {
			let u = ctx.global.session.user, a = ctx.global.session.activity
			return {courseCode: a.courseCode, courseLabel: a.courseLabel, username: u.username, fullName: u.fullName}
		}

		// ======== pages that need parent-supplied state ========
		// --- buttons and tiles
		const btEditor = (ctx) => ctx.html(withParent('buttons-and-tiles/index.html', {
			newIlar: {name: G.nameOf(G.btDoc(G.BT_IDS[0])), params: {}},
		}, TOOLBOX_CHROME.saveAsTemplateButton + TOOLBOX_CHROME.photographyIframe + primeHover([`${btTile(1)} .edit-overlay-button-edit-text`, `${btTile(2)} .edit-overlay-button-edit-icon`, `${btTile(3)} .edit-overlay-button-delete`])))
		r.get('buttons-and-tiles', btEditor)
		r.get('buttons-and-tiles/index.html', btEditor)
		r.get('buttons-and-tiles/embed.html', ctx => {
			let id = ctx.query.id
			let design = G.BT_DESIGNS[id] ? id : G.BT_IDS[0]
			return ctx.html(withName('buttons-and-tiles/embed.html', G.nameOf(G.btDoc(design))))
		})
		// --- cards
		const cardsEditor = (ctx) => ctx.html(withParent('cards/index.html', {
			newIlar: {name: G.nameOf(G.cardDoc(G.CARD_IDS[0])), params: {}},
		}, TOOLBOX_CHROME.saveAsTemplateButton + TOOLBOX_CHROME.photographyIframe + primeHover([`${cardAt(1)} .edit-overlay-button-edit-title`, `${cardAt(2)} .edit-overlay-button-edit-text`, `${cardAt(3)} .edit-overlay-button-edit-icon`, `${cardAt(4)} .edit-overlay-button-delete`])))
		r.get('cards', cardsEditor)
		r.get('cards/index.html', cardsEditor)
		r.get('cards/embed.html', ctx => {
			let id = ctx.query.id
			let design = G.CARD_DESIGNS[id] ? id : G.CARD_IDS[0]
			return ctx.html(withName('cards/embed.html', G.nameOf(G.cardDoc(design))))
		})
		// --- counter button (activity summary graphic): the toolbox hands a re-opened one its data= string in newIlar.params.data
		const counterEditor = (ctx) => ctx.html(withParent('counter-button-editor/index.html', {
			newIlar: {params: {data: encodeURIComponent(JSON.stringify(G.COUNTERS.full)), code: null}},
		}))
		r.get('counter-button-editor', counterEditor)
		r.get('counter-button-editor/index.html', counterEditor)
		// --- generators that bake their settings into data-toolbox-config on what they insert
		const cfgPage = (dir, cfg) => {
			let h = (ctx) => ctx.html(withParent(`${dir}/index.html`, {newIlar: {'data-toolbox-config': G.toolboxConfig(cfg), params: {}}}))
			r.get(dir, h)
			r.get(`${dir}/index.html`, h)
		}
		cfgPage('tables', {type: 'alt-vert', rows: 9, columns: 5, header: true, colour: 'blue'})
		cfgPage('introduction-text', {type: 'toolbox-text-styles-3', colour: 'green'})
		cfgPage('resource-templates', {title: true, introduction: true, content: false, transcripts: true, 'technical-specs': true, references: false, 'further-reading': true, colour: 'purple'})
		// --- course banner generator: the toolbox's Insert hook
		const courseBanner = (ctx) => ctx.html(withParent('course-banner-generator/index.html', {installItem: {}}, TOOLBOX_CHROME.photographyIframe))
		r.get('course-banner-generator', courseBanner)
		r.get('course-banner-generator/index.html', courseBanner)
		// --- banner generator (select image button scrolls the toolbox's inline gallery iframe into view)
		const banner = (ctx) => ctx.html(withParent('banner-generator/index.html', {}, TOOLBOX_CHROME.photographyIframe))
		r.get('banner-generator', banner)
		r.get('banner-generator/index.html', banner)
		// --- profile image generator re-opening a saved one: params come off the inserted img's querystring
		// profile-image-generator declares `let m` at script level, so unlike the other generators its scope is NOT window.m - a top-level page therefore
		// has no `window.parent.m` at all. Provide the toolbox's scope (window.m, a plain stand-in) carrying newIlar, which is what it reads when re-opening.
		const profile = (ctx) => ctx.html(readHtml('profile-image-generator/index.html').replace(/<head>/i, () => '<head><script>window.m={$applyAsync:function(){},$root:{$applyAsync:function(){},newIlar:{params:' + safe({
			source: oid('profile-source', 1), src: `/storage/production/image-generators/profile-images/${oid('profile', 1)}.svg`, colour: 'blue', scale: '1.6', x: '0.2', y: '-0.1',
		}) + '}}};' +
			// storageBase() is `${protocol}//${hostname}/storage/...` (no port: production is 443 behind haproxy). Send it to the harness origin like haproxy would.
			'(function(){var f=window.fetch;window.fetch=function(u,o){if(typeof u==="string"){var b=location.protocol+"//"+location.hostname+"/storage/";if(u.indexOf(b)===0){u=location.origin+"/storage/"+u.slice(b.length)}}return f.call(this,u,o)}})()</script>'))
		r.get('profile-image-generator', profile)
		r.get('profile-image-generator/index.html', profile)
		// --- rive: runtime stubbed (unpkg blocked). Editor re-opens an existing player.
		const riveEditor = (ctx) => ctx.html(withParent('rive-player-editor/index.html', {
			newIlar: {params: {rive: '/storage/production/rive-player/Treasure_Valley_Map_u1234567.riv?v=1772000000000', stateMachine: 'Main Timeline', autoplay: 'true', 'add-reaction-bar': 'false'}},
		}).replace(/<head>/i, () => '<head>' + RIVE_STUB))
		r.get('rive-player-editor', riveEditor)
		r.get('rive-player-editor/index.html', riveEditor)
		const rivePlayer = (ctx) => ctx.html(readHtml('rive-player/index.html').replace(/<head>/i, () => '<head>' + RIVE_STUB))
		r.get('rive-player', rivePlayer)
		r.get('rive-player/index.html', rivePlayer)

		// ======== buttons and tiles API ========
		const btAll = (ctx) => {
			let me = ctxInfo(ctx)
			let list = []
			for (let i = 0; i < G.BT_TEMPLATE_COUNT; i++) {
				list.push(G.btTemplate(i, me))
			}
			Object.keys(ctx.state.btSaved).forEach(id => list.push(ctx.state.btSaved[id]))
			return list.sort((a, b) => (b.timestamp - a.timestamp) || (a._id < b._id ? -1 : 1))
		}
		r.get('fetch-buttons-and-tiles-data', ctx => {
			let id = ctx.query.id
			if (!id) {
				return ctx.status(412)
			}
			let doc = ctx.state.btSaved[id] || (G.BT_DESIGNS[id] && G.btDoc(id, ctxInfo(ctx))) || btAll(ctx).find(t => t._id === id)
			return doc ? ctx.json(doc) : ctx.status(404)
		})
		r.get('fetch-all-buttons-and-tiles-templates', ctx => {
			if (!ctx.query.username || !ctx.query.courseCode) {
				return ctx.status(412)
			}
			return btAll(ctx).filter(t => t.username === ctx.query.username || t.courseCode === ctx.query.courseCode)
		})
		r.get('fetch-all-buttons-and-tiles-existing', ctx => {
			let {username, courseCode} = ctx.query
			let skip = parseInt(ctx.query.skip) || 0
			if (!username || !courseCode) {
				return ctx.status(412)
			}
			// saved templates (paged), then what's been inserted into this course / by this user (the real route pages those the same way; the
			// ingest rows carry the editor's own data object, i.e. the NON-compressed form)
			let templates = btAll(ctx).filter(t => t.username === username || t.courseCode === courseCode).slice(skip, skip + 12)
			let inserted = skip === 0 ? G.BT_IDS.map(id => G.btEditorForm(G.btDoc(id, ctxInfo(ctx)), ctx.req.headers.host)) : []
			return templates.concat(inserted, inserted.slice(0, 2))
		})
		r.all('save-buttons-and-tiles-template', ctx => {
			let data
			try {
				data = JSON.parse(ctx.body.data)
			}
			catch (e) {
				return ctx.status(412)
			}
			if (!data) {
				return ctx.status(412)
			}
			let id = data._id
			delete data.type
			ctx.state.btSaved[id] = Object.assign({}, ctx.state.btSaved[id], data, {_id: id, type: 'template'})
			return ctx.text('OK')
		})
		r.get('fetch-image', ctx => ctx.redirect(img(640, 400, 'proxied')))

		// ======== cards API ========
		const cardsAll = (ctx) => {
			let me = ctxInfo(ctx)
			let list = []
			for (let i = 0; i < G.CARD_TEMPLATE_COUNT; i++) {
				list.push(G.cardTemplate(i, me))
			}
			Object.keys(ctx.state.cardsSaved).forEach(id => list.push(ctx.state.cardsSaved[id]))
			return list.sort((a, b) => (b.timestamp - a.timestamp) || (a._id < b._id ? -1 : 1))
		}
		r.get('fetch-cards-data', ctx => {
			let id = ctx.query.id
			if (!id) {
				return ctx.status(412)
			}
			let doc = ctx.state.cardsSaved[id] || (G.CARD_DESIGNS[id] && G.cardDoc(id, ctxInfo(ctx))) || cardsAll(ctx).find(t => t._id === id)
			return doc ? ctx.json(doc) : ctx.status(404)
		})
		r.get('fetch-all-cards-existing', ctx => {
			let {username, courseCode} = ctx.query
			let skip = parseInt(ctx.query.skip) || 0
			if (!username || !courseCode) {
				return ctx.status(412)
			}
			let templates = cardsAll(ctx).filter(t => t.username === username || t.courseCode === courseCode).slice(skip, skip + 12)
			let inserted = skip === 0 ? G.CARD_IDS.map(id => G.cardEditorForm(G.cardDoc(id, ctxInfo(ctx)), ctx.req.headers.host)) : []
			return templates.concat(inserted, inserted.slice(0, 2))
		})
		r.all('save-cards-template', ctx => {
			let data
			try {
				data = JSON.parse(ctx.body.data)
			}
			catch (e) {
				return ctx.status(412)
			}
			if (!data || !data._id) {
				return ctx.status(412)
			}
			let id = data._id
			delete data.type
			ctx.state.cardsSaved[id] = Object.assign({}, ctx.state.cardsSaved[id], data, {_id: id, type: 'template'})
			return ctx.text('OK')
		})

		// ======== other generator endpoints ========
		// course banner generator: POST ../download-base64 (multipart: base64, width, format, quality) -> the converted image bytes
		r.all('download-base64', ctx => {
			let b64 = ctx.body && ctx.body.base64
			let buf = b64 ? Buffer.from(String(b64).replace(/^data:[^,]*,/, ''), 'base64') : G.pngGradient(160, 90, 2)
			ctx.res.writeHead(200, {'content-type': 'image/jpeg', 'content-disposition': 'attachment; filename="banner.jpg"', 'cache-control': 'no-store'})
			ctx.res.end(buf)
		})
		// welcome banner image (used by the inserted <img>, not by the editor itself)
		r.get('banner', ctx => {
			ctx.text(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="300" viewBox="0 0 1200 300"><rect width="1200" height="300" fill="#4a6fa5"/><text x="60" y="160" font-size="48" fill="#fff" font-family="sans-serif">Welcome banner</text></svg>`, 200, 'image/svg+xml')
		})
		r.post('save-profile-image', ctx => {
			ctx.state.profileSaves++
			return {id: uuid('profile-saved', ctx.state.profileSaves), source: ctx.state.profileSaves === 1 ? uuid('profile-source-saved', 1) : null, ext: 'svg'}
		})
		r.post('save-rive-file', ctx => {
			ctx.state.riveSaves++
			let name = `animation_${ctx.global.session.user.username}.riv`
			return {url: `/storage/production/rive-player/${name}?v=${NOW}`, name}
		})

		// ======== cross-app stubs (the owning app's real route wins if it defines one) ========
		// photos: tiles/cards store only the photo id, the embed/editor composes /photography-gallery/photos/<id>
		r.abs('GET', '/photography-gallery/photos/:id', ctx => ctx.redirect(img(640, 400, 'photo ' + String(ctx.params.id).slice(0, 6))))
		// stored profile-image source (webp in production) and the flattened result
		r.abs('GET', /^storage\/(?:production|testing|development)\/image-generators\/profile-images\/[^/]+\.(?:webp|png|jpg|jpeg)$/, ctx => {
			ctx.res.writeHead(200, {'content-type': 'image/png', 'cache-control': 'no-store'})
			ctx.res.end(G.pngGradient(480, 360, 3))
		})
		r.abs('GET', /^storage\/(?:production|testing|development)\/image-generators\/profile-images\/[^/]+\.svg$/, ctx => {
			ctx.text(`<svg xmlns="http://www.w3.org/2000/svg" width="405" height="405" viewBox="0 0 405 405"><circle cx="202" cy="202" r="198" fill="#3b6fb6" stroke="#444" stroke-width="6"/></svg>`, 200, 'image/svg+xml')
		})
		// .riv files (header is all the editor checks before handing the bytes to the rive runtime)
		r.abs('GET', /^storage\/(?:production|testing|development)\/(?:rive-player|interactives\/[^/]+)\/[^/]+\.riv$/, ctx => {
			ctx.res.writeHead(200, {'content-type': 'application/octet-stream', 'cache-control': 'no-store'})
			ctx.res.end(Buffer.concat([Buffer.from('RIVE'), Buffer.alloc(2048, 7)]))
		})
	},
}
