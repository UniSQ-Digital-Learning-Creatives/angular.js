'use strict'
// Completion Progress blocks as block_usqilar_get_completion_progress returns them (what ilar-manager.js posts to /save-completion-data)
const {img, oid} = require('../shared')

const ACTIVITY_KINDS = [
	['page', 'Page'], ['quiz', 'Quiz'], ['forum', 'Forum'], ['assign', 'Assignment'], ['url', 'Link'], ['resource', 'Reading'], ['h5pactivity', 'Interactive'], ['lesson', 'Lesson'],
]
const STATUS = ['complete', 'complete', 'complete', 'incomplete', 'complete', 'incomplete', 'incomplete', 'incomplete']

function block(n, blockid, stableid, name, count, doneEvery, percentage) {
	return {
		blockid, stableid, name, enabled: true, percentage,
		activities: Array.from({length: count}, (_, k) => {
			let [kind, label] = ACTIVITY_KINDS[(k + n) % ACTIVITY_KINDS.length]
			let id = n * 1000 + k + 1
			return {
				id, name: `${label} ${k + 1}: ${['Welcome and overview', 'Key concepts', 'Worked examples', 'Practice questions', 'Reflection', 'Case study', 'Check your understanding', 'Further reading'][k % 8]}`,
				icon: img(24, 24, kind), link: `https://lms.example.edu/mod/${kind}/view.php?id=${id}`, type: kind, available: true,
				status: k % doneEvery === doneEvery - 1 ? 'incomplete' : (k < count * percentage / 100 ? 'complete' : 'incomplete'),
			}
		}),
	}
}

function blocks() {
	return [
		block(1, 4101, 'blk-module-1', 'Module 1 progress', 12, 5, 58),
		block(2, 4102, 'blk-assessments', 'Assessment progress', 6, 4, 33),
		block(3, 4103, 'blk-weekly', 'Week by week', 24, 6, 71),
	]
}

function settings() {
	return [
		{_id: oid('tracker-settings', 1), id: oid('tracker', 1), courseID: 1111, blockID: 'blk-module-1', blockTitle: 'Module 1 progress', colour: '--blue-gradient', showTitle: true, showPercentage: true},
		{_id: oid('tracker-settings', 2), id: oid('tracker', 2), courseID: 1111, blockID: 'blk-weekly', blockTitle: 'Week by week', colour: '--green-gradient', showTitle: false, showPercentage: true},
		{_id: oid('tracker-settings', 3), id: oid('tracker', 3), courseID: 1111, blockID: 'blk-assessments', blockTitle: 'Assessment progress', colour: '--purple-gradient', showTitle: true, showPercentage: false},
	]
}

module.exports = {blocks, settings}
