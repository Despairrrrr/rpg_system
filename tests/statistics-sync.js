// Run with gjs tests/statistics-sync.js (or node tests/statistics-sync.js).
const read = name => typeof require === 'function' ? require('fs').readFileSync(name, 'utf8')
  : new TextDecoder().decode(imports.gi.GLib.file_get_contents(name)[1]);
const source = read('app.js');
const Statistics = eval(read('statistics-model.js') + '\nStatistics;');
function assert(ok, message) { if (!ok) throw new Error(message); }
function section(start, end) { return source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start))); }
async function run() {
  const STORAGE_KEY = 'test';
  const SYNC_DEBOUNCE = 800;
  const SCHEMA_VERSION = 3;
  const migrateState = value => ({ ...Statistics.normalize(value), schemaVersion: 3 });
  let state = migrateState({ updatedAt: 10, skills: [{ id: 's', name: 'Math', xp: 100 }], goals: [] });
  let currentUser = { uid: 'u' }, cloudReady = false, syncTimer = null, cloudPull = null, queued;
  let cloud = { updatedAt: 20, state: JSON.stringify({ skills: [{ id: 's', name: 'Math', xp: 200 }], goals: [] }) };
  let writes = [];
  const document = { getElementById: () => null };
  const localStorage = { setItem: (_, value) => { localStorage.saved = value; } };
  const setTimeout = callback => { queued = callback; return 1; };
  const clearTimeout = () => {};
  const render = () => {};
  const firebase = { firestore: () => ({ collection: () => ({ doc: () => ({
    get: async () => ({ exists: Boolean(cloud), data: () => cloud }),
    set: async document => { writes.push(document); },
  }) }) }) };
  const api = eval(section('function saveState(', '// MAIN RENDER') +
    section('async function pushToCloud(', 'function initAuth(') + '\n({ saveState, pushToCloud, pullFromCloud })');
  api.saveState({ maintenance: true });
  await api.pushToCloud();
  assert(state.updatedAt === 10 && writes.length === 0, 'startup normalization cannot push before reconciliation');
  await api.pullFromCloud();
  assert(state.skills[0].xp === 200 && state.updatedAt === 20, 'newer cloud survives startup maintenance');
  assert(state.completionHistory.length === 0 && state.lifeAreas.length === 0, 'cloud legacy schema migrated');
  assert(JSON.parse(localStorage.saved).updatedAt === 20, 'cloud timestamp is preserved locally');
  state.goals.push({ id: 'scheduled', type: 'step', repeatsDaily: false, skillId: 's', title: 'Weekly', schedule: { type: 'weekly', time: '07:00', daysOfWeek: [1,3,5] }, reminder: { enabled: true, offset: '15m' } });
  state.reminderReceipts = { scheduled: { key: 'occurrence', status: 'skipped' } };
  state.completionHistory.push({ id: 'r', goalId: 'g', skillId: 's', completionDate: Statistics.dayKey(), xpAwarded: 10 });
  Statistics.createArea(state, 'a', 'Learning', ['s']);
  api.saveState();
  await api.pushToCloud();
  const sent = JSON.parse(writes[writes.length - 1].state);
  assert(sent.goals[0].schedule.time === '07:00' && sent.goals[0].reminder.offset === '15m' && sent.reminderReceipts.scheduled.status === 'skipped', 'schedule, reminder and receipt cloud round-trip');
  assert(sent.completionHistory.length === 1 && sent.lifeAreas.length === 1 && sent.skills[0].lifeAreaId === 'a', 'cloud round-trip includes facts and relationships');
  assert(writes[writes.length - 1].updatedAt === state.updatedAt, 'cloud envelope uses actual edit timestamp');
  writes = [];
  await api.pullFromCloud();
  assert(state.completionHistory.length === 1 && writes.length === 1, 'newer local state wins and uploads');
  cloudReady = false;
  cloud = null;
  await api.pullFromCloud();
  assert(writes.length === 2, 'first sign-in uploads local progress');
  (typeof print === 'function' ? print : console.log)('PASS: startup reconciliation, timestamps, cloud migration, history and Area persistence, newer-local and first-sign-in upload');
}
run().catch(error => { (typeof printerr === 'function' ? printerr : console.error)(error.stack); if (typeof imports !== 'undefined') imports.system.exit(1); else process.exitCode = 1; });
