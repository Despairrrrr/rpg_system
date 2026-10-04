// Run with: gjs tests/daily-reset.js (or node tests/daily-reset.js).
const source = typeof require === 'function'
  ? require('fs').readFileSync('app.js', 'utf8')
  : new TextDecoder().decode(imports.gi.GLib.file_get_contents('app.js')[1]);
function assert(ok, message) { if (!ok) throw new Error(message); }
function section(start, end) {
  return source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
}
const NativeDate = Date;
let clock = new NativeDate(2026, 9, 4, 23, 59, 59).getTime();
class FakeDate extends NativeDate {
  constructor(...args) { super(...(args.length ? args : [clock])); }
}
function run(Date) {
  let state = {
    goals: [
      { id: 'daily', repeatsDaily: true, completed: true, completedDay: '2026-10-04', skillId: 's', xp: 10 },
      { id: 'ordinary', repeatsDaily: false, completed: true, completedDay: '2026-10-04', skillId: 's', xp: 20 },
      { id: 'open', repeatsDaily: true, completed: false, completedDay: '', skillId: 's', xp: 10 },
    ],
    skills: [{ id: 's', xp: 100 }],
    completionHistory: [],
  };
  let saves = 0, renderedDay = '2026-10-04', dayRefreshTimer = null, pending;
  let nextId = 0;
  const crypto = { randomUUID: () => String(++nextId) };
  const saveState = () => { saves++; };
  const isRepeatingGoal = goal => Boolean(goal?.repeatsDaily);
  const render = () => { api.resetRepeatingGoals(); renderedDay = api.getDayKey(); };
  const setTimeout = (callback, delay) => { pending = { callback, delay }; return 1; };
  const clearTimeout = () => {};
  const document = { querySelector: () => null };
  const CSS = { escape: value => value };
  const els = { xpBar: null };
  const getTotalPlayerXp = () => state.skills[0].xp;
  const readFillPercent = () => 0;
  const getLevelInfo = () => ({ level: 1, progress: 0 });
  const bumpStreak = () => {};
  const runCompletionFeedback = () => {};
  const api = eval(
    section('function getDayKey(', 'function bumpStreak(') +
    section('function toggleGoalCompletion(', '\n// UPDATE') +
    '\n({ getDayKey, resetRepeatingGoals, refreshLocalDay, toggleGoalCompletion })'
  );

  assert(api.getDayKey() === '2026-10-04', 'uses local date before midnight');
  assert(!api.resetRepeatingGoals() && saves === 0, 'same-day completion remains saved');
  api.toggleGoalCompletion('daily', false);
  assert(state.skills[0].xp === 90, 'manual uncheck subtracts XP');
  api.toggleGoalCompletion('daily', true);
  assert(state.skills[0].xp === 100, 'manual recheck restores XP');
  api.refreshLocalDay();
  assert(pending.delay === 1000, 'timer targets local midnight');
  clock += 1000;
  pending.callback();
  assert(api.getDayKey() === '2026-10-05', 'date changes at local midnight');
  assert(!state.goals[0].completed && state.goals[0].completedDay === '', 'daily checkmark clears');
  assert(state.goals[1].completed, 'ordinary goal stays completed');
  assert(!state.goals[2].completed, 'open goal stays open');
  assert(state.skills[0].xp === 100, 'automatic reset preserves XP');
  const saved = saves;
  api.refreshLocalDay();
  assert(saves === saved, 'repeated checks do not save again');
  api.toggleGoalCompletion('daily', true);
  assert(state.skills[0].xp === 110 && state.goals[0].completedDay === '2026-10-05', 'new day awards new XP');
  clock += 3 * 86400000;
  api.toggleGoalCompletion('daily', false);
  assert(state.skills[0].xp === 110 && !state.goals[0].completed, 'stale click after sleep cannot subtract previous-day XP');
  state.goals[0].completed = true;
  state.goals[0].completedDay = '';
  render();
  assert(!state.goals[0].completed && state.skills[0].xp === 110, 'legacy undated completion resets on render without losing XP');
}
run(FakeDate);
(typeof print === 'function' ? print : console.log)('PASS: local midnight, manual XP reversal, daily reset, ordinary goals, repeat rewards, suspended tab, legacy completion');
