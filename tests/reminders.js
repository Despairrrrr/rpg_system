const read = name => typeof require === 'function' ? require('fs').readFileSync(name, 'utf8')
  : new TextDecoder().decode(imports.gi.GLib.file_get_contents(name)[1]);
function assert(ok, message) { if (!ok) throw new Error(message); }
async function run() {
  const GoalSchedule = eval(read('schedule-model.js') + '\nGoalSchedule;');
  const factory = eval(read('reminders.js') + '\ncreateReminderSystem;');
  const base = { id: 'daily', type: 'step', title: 'Read', xp: 10, createdAt: '2026-10-01T12:00:00', schedule: { type: 'daily', time: '07:00' }, reminder: { enabled: true, offset: '5m' } };
  let state = { goals: [base], completionHistory: [] };
  let now = new Date(2026, 9, 9, 6, 54);
  const before = GoalSchedule.latestDue(base, now);
  assert(before.day === '2026-10-08' && before.missed, 'only latest past occurrence is missed before next reminder');
  now = new Date(2026, 9, 9, 6, 55);
  const current = GoalSchedule.latestDue(base, now);
  assert(current.day === '2026-10-09' && !current.missed, 'offset arrival');
  assert(GoalSchedule.latestDue(base, new Date(2026, 9, 9, 8)).missed, 'late open is missed');
  const weekly = { ...base, schedule: { type: 'weekly', time: '07:00', daysOfWeek: [1, 3] } };
  assert(GoalSchedule.latestDue(weekly, now).day === '2026-10-07', 'weekly skips off days');
  const midnight = { ...base, schedule: { type: 'daily', time: '00:05' }, reminder: { enabled: true, offset: '30m' } };
  assert(GoalSchedule.latestDue(midnight, new Date(2026, 9, 9, 23, 35)).day === '2026-10-10', 'offset crosses midnight');
  assert(!GoalSchedule.latestDue({ ...base, schedule: { type: 'daily' } }, now), 'no time means no reminder');
  assert(!GoalSchedule.latestDue({ ...base, reminder: { enabled: false } }, now), 'disabled reminder');
  assert(!GoalSchedule.latestDue({ ...base, schedule: { type: 'daily', time: 'bad' } }, now), 'invalid saved time isolated');
  assert(!GoalSchedule.latestDue({ ...base, createdAt: '2026-10-10T12:00:00' }, now), 'no pre-creation backlog');
  let shown = [], saves = 0, completions = 0;
  const system = factory({ getState: () => state, now: () => now, save: () => saves++,
    render: entries => { shown = entries; }, complete: entry => { completions++; entry.goal.completed = true; entry.goal.completedDay = entry.day; return true; } });
  system.refresh(); assert(shown.length === 1, 'pending shown');
  const stale = shown[0]; system.skip(stale);
  assert(shown.length === 0 && saves === 1, 'skip persists without completion');
  state = JSON.parse(JSON.stringify(state)); system.refresh();
  assert(shown.length === 0, 'skip survives reload');
  now = new Date(2026, 9, 10, 7); system.refresh();
  assert(shown.length === 1, 'next occurrence not skipped');
  system.complete(shown[0]); system.complete(stale);
  assert(completions === 1 && shown.length === 0, 'stale actions cannot duplicate completion');
  state.goals[0].completed = false; state.goals[0].reminder.enabled = false;
  system.refresh(); assert(shown.length === 0, 'editing reminder clears pending entry');
  state.goals = []; system.skip(stale); assert(completions === 1, 'deleted goal action ignored');
  for (const offset of GoalSchedule.offsets) {
    const goal = { ...base, reminder: { enabled: true, offset } };
    const at = new Date(2026, 9, 9, 7); at.setMinutes(at.getMinutes() - parseInt(offset, 10));
    assert(GoalSchedule.latestDue(goal, at).day === '2026-10-09', offset + ' triggers at correct instant');
  }
  const browserFactory = eval(read('reminders.js') + '\ncreateBrowserReminders;');
  let requestCount = 0, sent = [], focused = false, navigated = false;
  class FakeNotification {
    static permission = 'default';
    static requestPermission() { requestCount++; this.permission = 'granted'; return Promise.resolve('granted'); }
    constructor(title, options) { this.title = title; this.options = options; sent.push(this); }
    close() { this.closed = true; }
  }
  const cache = new Map();
  const storage = { getItem: key => cache.get(key), setItem: (key, value) => cache.set(key, value) };
  const liveGoal = { ...base, createdAt: '2020-01-01T12:00:00', reminder: { enabled: true, offset: '0m' } };
  state = { goals: [liveGoal], completionHistory: [], streak: { count: 3 } };
  const options = { getState: () => state, getNotification: () => FakeNotification, storage, locks: null, secure: true,
    focus: () => { focused = true; }, navigate: () => { navigated = true; } };
  const browser = browserFactory(options);
  assert(await browser.requestPermission() === 'granted' && requestCount === 1, 'permission requested once from enabling action');
  await browser.requestPermission(); assert(requestCount === 1, 'granted does not ask again');
  const entries = GoalSchedule.pending(state);
  browser.refresh(entries);
  for (let i = 0; i < 5; i++) await Promise.resolve();
  assert(sent.length === 1 && sent[0].options.body.includes('3-day streak'), 'system notification includes global streak');
  sent[0].onclick(); assert(focused && navigated, 'system click focuses and navigates');
  browserFactory(options).refresh(entries);
  for (let i = 0; i < 5; i++) await Promise.resolve();
  assert(sent.length === 1, 'delivery survives controller reload');
  const actualNow = new Date();
  const oneTime = { ...liveGoal, id: 'silent-one-time', schedule: { type: 'one-time', time: '00:00' } };
  state = { goals: [oneTime], completionHistory: [], oneTimeSchedules: { [oneTime.id]: { day: GoalSchedule.dayKey(actualNow), configuredAt: actualNow.getTime() } } };
  const missedEntries = GoalSchedule.pending(state);
  assert(missedEntries.length === 1 && missedEntries[0].silent, 'past one-time visible in panel');
  const countBeforeSilent = sent.length;
  browserFactory(options).refresh(missedEntries);
  for (let i = 0; i < 5; i++) await Promise.resolve();
  assert(sent.length === countBeforeSilent, 'past-created one-time does not generate a system notification');
  oneTime.completed = true;
  assert(GoalSchedule.pending(state).length === 0, 'one-time completion cancels pending notification');
  state = { goals: [liveGoal], completionHistory: [], streak: { count: 3 } };
  FakeNotification.permission = 'denied';
  assert(await browserFactory(options).requestPermission() === 'denied' && requestCount === 1, 'denial never re-prompts');
  assert(GoalSchedule.pending(state).length === 1, 'denial leaves in-app entry intact');
  assert(await browserFactory({ ...options, secure: false }).requestPermission() === 'unavailable', 'insecure context gracefully unavailable');
  assert(await browserFactory({ ...options, getNotification: () => undefined }).requestPermission() === 'unavailable', 'missing API graceful');
  let fallbackActions = 0;
  await browserFactory({ ...options, locks: { request: () => Promise.reject(new Error('lock unavailable')) } }).exclusive(() => fallbackActions++);
  assert(fallbackActions === 1, 'unavailable lock keeps actions working');
  FakeNotification.permission = 'default';
  FakeNotification.requestPermission = () => Promise.reject(new Error('blocked'));
  assert(await browserFactory(options).requestPermission() === 'unavailable', 'permission rejection caught');
  class ThrowingNotification { static permission = 'granted'; constructor() { throw new Error('unsupported'); } }
  cache.clear();
  browserFactory({ ...options, getNotification: () => ThrowingNotification }).refresh(entries);
  for (let i = 0; i < 5; i++) await Promise.resolve();
  assert(GoalSchedule.pending(state).length === 1, 'constructor failure leaves in-app entry intact');
  (typeof print === 'function' ? print : console.log)('PASS: reminder timing, all offsets, midnight, missed, weekly, invalid data, skip persistence and duplicate actions');
}
run().catch(error => { (typeof printerr === 'function' ? printerr : console.error)(error.stack); if (typeof imports !== 'undefined') imports.system.exit(1); else process.exitCode = 1; });
