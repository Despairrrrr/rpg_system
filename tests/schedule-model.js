const read = name => typeof require === 'function' ? require('fs').readFileSync(name, 'utf8')
  : new TextDecoder().decode(imports.gi.GLib.file_get_contents(name)[1]);
const Schedule = eval(read('schedule-model.js') + '\nGoalSchedule;');
const app = read('app.js');
const model = app.slice(app.indexOf('// <goal-model>'), app.indexOf('// </goal-model>'));
const modelApi = (() => eval(read('statistics-model.js') + '\n' + model + '\n({ migrateState });'))();
function assert(ok, message) { if (!ok) throw new Error(message); }
const legacy = { updatedAt: 17, skills: [{ id: 's', xp: 123 }], goals: [
  { id: 'a', type: 'step', skillId: 's', repeatsDaily: true, completed: true, completedDay: '2026-10-09' },
  { id: 'b', type: 'quest', skillId: 's', repeatsDaily: false },
] };
const loaded = modelApi.migrateState(legacy);
assert(loaded.updatedAt === 17 && loaded.skills[0].xp === 123, 'legacy XP and edit timestamp preserved');
assert(loaded.goals[0].completed && loaded.goals[0].repeatsDaily, 'legacy completion and recurrence preserved');
assert(!loaded.goals[1].schedule && !loaded.goals[1].reminder, 'optional fields remain absent');
const scheduled = { ...legacy.goals[0], schedule: { type: 'weekly', time: '07:00', daysOfWeek: [5, 1, 3] }, reminder: { enabled: true, offset: '15m' } };
const roundTrip = modelApi.migrateState(JSON.parse(JSON.stringify({ ...legacy, goals: [scheduled] }))).goals[0];
assert(JSON.stringify(roundTrip.schedule) === JSON.stringify(scheduled.schedule), 'schedule round-trip');
assert(roundTrip.reminder.offset === '15m', 'reminder round-trip');
assert(Schedule.read(scheduled).daysOfWeek.join() === '1,3,5', 'normalized weekday order');
assert(Schedule.read({ ...scheduled, schedule: { type: 'weekly', daysOfWeek: [] } }) === null, 'bad saved schedule safely ignored');
assert(Schedule.read(legacy.goals[0]) === null, 'absent schedule falls back to legacy');
assert(loaded.goals[0].schedule.type === 'daily' && loaded.goals[0].reminder.enabled === false && loaded.goals[0].reminder.offset === '0m', 'legacy daily migration');
assert(JSON.stringify(modelApi.migrateState(loaded)) === JSON.stringify(loaded), 'migration is idempotent');
(typeof print === 'function' ? print : console.log)('PASS: optional model, old data, schedule round-trip and safe reads');

for (const time of ['00:00', '23:59', '07:00']) assert(Schedule.validTime(time), 'valid ' + time);
for (const time of ['24:00', '12:60', '7:00', '10:00:00', 700]) assert(!Schedule.validTime(time), 'invalid ' + time);
for (const type of ['weekly', 'custom']) {
  let rejected = false;
  try { Schedule.validate({ type, daysOfWeek: [] }, undefined, 'step'); } catch (error) { rejected = error.message === 'Select at least one day'; }
  assert(rejected, 'empty days rejected');
}
assert(!Schedule.validate({ type: 'one-time', time: 'bad' }, { enabled: true }, 'step').reminder, 'one-time ignores hidden fields');
for (const offset of Schedule.offsets) assert(Schedule.validate({ type: 'daily', time: '18:30' }, { enabled: true, offset }, 'step').reminder.offset === offset, 'valid offset');

const weeklyGoal = { type: 'step', completed: true, completedDay: '2026-10-05', schedule: { type: 'weekly', daysOfWeek: [1, 3, 5] } };
assert(!Schedule.shouldReset(weeklyGoal, new Date(2026, 9, 6, 12)), 'weekly remains done on off day');
assert(Schedule.shouldReset(weeklyGoal, new Date(2026, 9, 7, 0)), 'weekly reopens on next selected day');
assert(Schedule.shouldReset({ ...weeklyGoal, completedDay: '2026-10-02' }, new Date(2026, 9, 6, 12)), 'weekly reset after sleeping through selected day');
assert(Schedule.shouldReset({ completed: true, completedDay: '2026-10-05', repeatsDaily: true }, new Date(2026, 9, 6)), 'legacy daily fallback resets');
assert(!Schedule.shouldReset({ completed: true, completedDay: '2026-10-05' }, new Date(2026, 9, 6)), 'ordinary completion never resets');
assert(Schedule.label(weeklyGoal).includes('Mon, Wed, Fri') && Schedule.label(weeklyGoal).includes('Any time'), 'schedule label');

const early = { ...weeklyGoal, schedule: { type: 'daily', time: '00:05' }, completedDay: '2026-10-09', completedScheduleDay: '2026-10-10' };
assert(!Schedule.shouldReset(early, new Date(2026, 9, 10)), 'early completion survives midnight');
assert(Schedule.shouldReset(early, new Date(2026, 9, 11)), 'early completion resets next day');
const late = { ...early, completedDay: '2026-10-11' };
assert(!Schedule.shouldReset(late, new Date(2026, 9, 11, 12)), 'late completion stays done on actual completion day');
const dst = { id: 'dst', type: 'step', schedule: { type: 'daily', time: '02:30' }, reminder: { enabled: true, offset: '0m' } };
const spring = Schedule.latestDue(dst, new Date(2026, 2, 8, 4));
assert(spring.day === '2026-03-08' && spring.scheduledAt === new Date(2026, 2, 8, 2, 30).getTime(), 'DST gap follows local calendar normalization');
const autumn = { ...dst, schedule: { type: 'daily', time: '01:30' } };
assert(Schedule.latestDue(autumn, new Date(2026, 10, 1, 1, 45)).key === Schedule.latestDue(autumn, new Date(2026, 10, 1, 2, 45)).key, 'DST repeated hour shares one occurrence');
