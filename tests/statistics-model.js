// Run with gjs tests/statistics-model.js (or node tests/statistics-model.js).
const read = name => typeof require === 'function' ? require('fs').readFileSync(name, 'utf8')
  : new TextDecoder().decode(imports.gi.GLib.file_get_contents(name)[1]);
const model = eval(read('statistics-model.js') + '\nStatistics;');
function assert(ok, message) { if (!ok) throw new Error(message); }
function rejects(action, message) { let rejected = false; try { action(); } catch (_) { rejected = true; } assert(rejected, message); }
const legacy = {
  updatedAt: 17, skills: [{ id: 'math', name: 'Math', xp: 2000 }],
  goals: [{ id: 'g', skillId: 'math', xp: 50, completed: true, completedDay: '' }],
};
const migrated = model.normalize(legacy, '2026-10-04');
assert(migrated.skills[0].xp === 2000 && migrated.goals[0].completed, 'legacy XP and completion survive');
assert(migrated.updatedAt === 17 && migrated.completionHistory.length === 0, 'no fake edits or historical rewards');
assert(migrated.skills[0].lifeAreaId === '', 'old Skills remain uncategorized');
assert(JSON.stringify(model.normalize(migrated, '2026-10-05')) === JSON.stringify(migrated), 'migration is idempotent and coverage stays fixed');
assert(model.weekStart('2026-10-04') === '2026-09-28', 'Sunday belongs to preceding Monday');
assert(model.weekStart('2026-10-05') === '2026-10-05', 'Monday starts a new week');
assert(model.weekStart('2027-01-01') === '2026-12-28', 'week spans year boundary');
assert(model.shiftDay('2024-02-28', 1) === '2024-02-29', 'leap day');
assert(model.shiftDay('2026-03-07', 2) === '2026-03-09', 'spring daylight saving change');
assert(model.shiftDay('2026-10-31', 2) === '2026-11-02', 'autumn daylight saving change');
assert(!model.validDay('2026-02-30') && !model.validDay('2026-10-04T23:00:00Z'), 'dates are valid calendar dates');
const state = model.normalize({
  skills: ['math', 'english', 'career', 'health', 'free'].map(id => ({ id, name: id, xp: 99999 })),
  goals: [],
}, '2026-09-28');
rejects(() => model.createArea(state, 'a', 'Learning', []), 'empty Area rejected');
rejects(() => model.createArea(state, 'a', 'Learning', ['missing']), 'unknown Skill rejected');
assert(state.lifeAreas.length === 0, 'failed creation is atomic');
model.createArea(state, 'a', 'Learning', ['math', 'english']);
model.createArea(state, 'b', 'Career', ['career']);
model.createArea(state, 'c', 'Health', ['health']);
state.completionHistory = [
  ['math', 300, '2026-09-28'], ['english', 200, '2026-09-28'],
  ['career', 300, '2026-09-30'], ['health', 200, '2026-10-04'],
  ['free', 900, '2026-10-04'], ['math', 999, '2026-10-05'],
  ['math', 999, '2026-09-27'], ['math', 0, '2026-10-01'],
].map(([skillId, xpAwarded, completionDate], i) => ({ id: String(i), goalId: String(i), skillId, xpAwarded, completionDate }));
let week = model.weekly(state, '2026-09-28');
assert(week.days.map(day => day.count).join() === '2,0,1,1,0,0,2', 'counts completions including zero reward, with exact week boundaries');
assert(week.skills[0].id === 'free' && week.skills[0].earned === 900, 'uncategorized Skill participates in progression');
assert(week.categorizedXp === 1000 && week.areas.map(area => area.percentage).join() === '50,30,20', 'focus denominator excludes uncategorized XP');
assert(week.skills.find(skill => skill.id === 'math').earned === 300, 'lifetime XP and adjacent weeks are ignored');
model.assignArea(state, 'math', 'b');
week = model.weekly(state, '2026-09-28');
assert(week.areas.map(area => area.percentage).join() === '20,60,20', 'reassignment applies current grouping to past weeks');
model.assignArea(state, 'math', '');
assert(model.weekly(state, '2026-09-28').categorizedXp === 700, 'uncategorizing removes XP from denominator');
const before = JSON.stringify(state.completionHistory);
model.deleteArea(state, 'b');
assert(state.skills.find(skill => skill.id === 'career').lifeAreaId === '', 'Area deletion uncategorizes Skills');
assert(JSON.stringify(state.completionHistory) === before, 'Area changes preserve history');
const empty = model.weekly(state, '2025-01-06');
assert(empty.categorizedXp === 0 && empty.areas.every(area => area.percentage === 0), 'empty week never produces NaN');
const reloaded = model.normalize(JSON.parse(JSON.stringify(state)));
assert(JSON.stringify(reloaded) === JSON.stringify(state), 'new fields survive JSON round-trip');
(typeof print === 'function' ? print : console.log)('PASS: migration, coverage, local weeks/DST, activity, weekly XP, focus shares, Area validation, assignments and persistence');
