// Run with gjs tests/journey-model.js (or node tests/journey-model.js).
const read = name => typeof require === 'function' ? require('fs').readFileSync(name, 'utf8') : new TextDecoder().decode(imports.gi.GLib.file_get_contents(name)[1]);
const GoalSchedule = eval(read('schedule-model.js') + '\nGoalSchedule;');
const Statistics = eval(read('statistics-model.js') + '\nStatistics;');
const source = read('app.js');
const api = eval(source.slice(source.indexOf('function normalizeJourney('), source.indexOf('function migrateState(')) + '\n({ normalizeJourney, journeyGoals, journeyTime, orderJourneyGoals, journeySections });');
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
assert(JSON.stringify(fresh)===JSON.stringify({date:today,selectedIds:[],hiddenIds:[],orderIds:[],viewMode:'all',sortMode:'time'}), 'legacy state gains empty daily selection');
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

const timed = [
  {id:'evening', type:'step', schedule:{type:'daily',time:'20:00'}},
  {id:'morning-b', type:'step', schedule:{type:'daily',time:'07:00'}},
  {id:'any', title:'Sleep before midnight', type:'step'},
  {id:'morning-a', type:'step', schedule:{type:'daily',time:'07:00'}},
  {id:'once', type:'step', createdAt:monday.toISOString(), schedule:{type:'one-time',time:'10:20'}},
  {id:'past', type:'step', createdAt:'2026-10-01T12:00:00', schedule:{type:'one-time',time:'05:00'}},
  {id:'offday', type:'step', schedule:{type:'weekly',time:'06:00',daysOfWeek:[2]}},
];
const preferences = api.normalizeJourney({date:today,selectedIds:['any','once','past','offday','evening'], viewMode:'split',sortMode:'manual',orderIds:['evening','any','morning-a','evening','deleted']},timed,today);
const names = list => list.map(goal=>goal.id).join();
const timeOrder = 'morning-a,morning-b,once,evening,any,offday,past';
assert(names(api.orderJourneyGoals(timed, preferences, {}, monday))===timeOrder, 'chronological times, stable tie IDs, Anytime last, no invented title/other-date time');
assert(api.journeyTime(timed[4],{},monday)==='10:20', 'legacy one-time creation anchor reused');
assert(api.journeyTime({...timed[4],createdAt:'invalid'}, {}, monday)==='', 'missing/invalid one-time anchor never invents today');
assert(api.journeyTime(timed[4],{once:{day:'2026-10-06',configuredAt:monday.getTime()}},monday)==='', 'explicit one-time anchor takes precedence over creation date');
assert(names(api.orderJourneyGoals(timed,preferences,{},monday,true))==='evening,any,morning-a,morning-b,once,offday,past', 'manual IDs first; missing/new IDs appended predictably');
assert(preferences.orderIds.join()==='evening,any,morning-a', 'order drops obsolete IDs and duplicates');
const split = api.journeySections(timed,preferences,{},monday);
assert(names(split[0].goals)==='once,evening,any,offday,past' && names(split[1].goals)==='morning-a,morning-b', 'manually selected routine belongs only to Journey; split ignores custom order');
const all = api.journeySections(timed,{...preferences,viewMode:'all',sortMode:'time'},{},monday);
assert(names(all[0].goals)===timeOrder && new Set(split.flatMap(section=>section.goals.map(goal=>goal.id))).size===all[0].goals.length, 'both modes share distinct membership');
timed[3].completed=true;
assert(names(api.journeySections(timed,{...preferences,viewMode:'all',sortMode:'time'},{},monday)[0].goals)===timeOrder, 'completion does not move cards');
const rolled = api.normalizeJourney(preferences,timed,GoalSchedule.dayKey(tuesday));
assert(rolled.viewMode==='split' && rolled.sortMode==='manual' && !rolled.orderIds.length && !rolled.selectedIds.length, 'day rollover retains preferences but clears daily order and selections');
const malformed=api.normalizeJourney({date:today,viewMode:'bad',sortMode:{},orderIds:'bad'},timed,today);
assert(malformed.viewMode==='all' && malformed.sortMode==='time' && !malformed.orderIds.length, 'safe presentation defaults');
assert(JSON.stringify(api.normalizeJourney(preferences,timed,today))===JSON.stringify(preferences), 'presentation migration idempotent');
(typeof print==='function'?print:console.log)('PASS: Journey views, time relevance, deterministic ties, manual ordering, stable completion and daily preference normalization');
