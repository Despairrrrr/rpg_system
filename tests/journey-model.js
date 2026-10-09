// Run with gjs tests/journey-model.js (or node tests/journey-model.js).
const read = name => typeof require === 'function' ? require('fs').readFileSync(name, 'utf8') : new TextDecoder().decode(imports.gi.GLib.file_get_contents(name)[1]);
const GoalSchedule = eval(read('schedule-model.js') + '\nGoalSchedule;');
const Statistics = eval(read('statistics-model.js') + '\nStatistics;');
const source = read('app.js');
const api = eval(source.slice(source.indexOf('function normalizeJourney('), source.indexOf('function migrateState(')) + '\n({ normalizeJourney, journeyGoals });');
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const monday = new Date(2026, 9, 5, 23, 59, 59);
const goals = [
 {id:'d',type:'step',schedule:{type:'daily'}},
 {id:'q',type:'quest',schedule:{type:'weekly',daysOfWeek:[1,5]}},
 {id:'c',type:'step',parentGoalId:'q',schedule:{type:'daily'}},
 {id:'m',type:'step'}, {id:'a',type:'arc'},
 {id:'custom',type:'step',schedule:{type:'custom',daysOfWeek:[2]}},
 {id:'legacy',type:'step',repeatsDaily:true,schedule:{type:'invalid'}},
];
const today = GoalSchedule.dayKey(monday);
const fresh = api.normalizeJourney(null, goals, today);
assert(JSON.stringify(fresh)===JSON.stringify({date:today,selectedIds:[],hiddenIds:[]}), 'legacy state gains empty daily selection');
const ids = (selection, date=monday) => api.journeyGoals(goals,selection,date).map(goal=>goal.id).join();
assert(ids(fresh)==='d,q,legacy', 'uses schedules and legacy fallback, deduplicates nested child');
const selection = {date:today,selectedIds:['d','m','m','a','missing'],hiddenIds:['q','q']};
const normalized = api.normalizeJourney(selection,goals,today);
assert(normalized.selectedIds.join()==='d,m' && normalized.hiddenIds.join()==='q', 'deduplicates references and removes invalid/Arc IDs');
assert(ids(selection)==='d,c,m,legacy', 'hidden Quest leaves independently due Step accessible');
const tuesday = new Date(2026,9,6);
assert(ids(selection,tuesday)==='d,c,custom,legacy', 'new day clears selections and uses current schedule');
assert(ids(selection,new Date(2026,9,9))==='d,q,legacy', 'removed weekly Quest returns next scheduled day');
goals[0].completed=true;
assert(ids(fresh)==='q,legacy,d', 'completed goals remain and sort last');
assert(JSON.stringify(api.normalizeJourney(normalized,goals,today))===JSON.stringify(normalized), 'idempotent normalization');
assert(api.normalizeJourney({date:today,selectedIds:'bad',hiddenIds:{}},goals,today).selectedIds.length===0, 'malformed optional state tolerated');
(typeof print==='function'?print:console.log)('PASS: Journey date scope, recurrence, deduplication, removal, normalization, legacy data and completion ordering');
