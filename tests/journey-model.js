// Run with gjs tests/journey-model.js (or node tests/journey-model.js).
const read = name => typeof require === 'function' ? require('fs').readFileSync(name, 'utf8') : new TextDecoder().decode(imports.gi.GLib.file_get_contents(name)[1]);
const GoalSchedule = eval(read('schedule-model.js') + '\nGoalSchedule;');
const Statistics = eval(read('statistics-model.js') + '\nStatistics;');
const source = read('app.js');
const api = eval(source.slice(source.indexOf('function normalizeJourney('), source.indexOf('function migrateState(')) + '\n({ normalizeJourney, journeyGoals, journeySummary, journeyTime, orderJourneyGoals, journeySections });');
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
assert(JSON.stringify(fresh)===JSON.stringify({date:today,selectedIds:[],hiddenIds:[],orderIds:[],focusIds:[],viewMode:'all',sortMode:'time'}), 'legacy state gains empty daily selection');
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
preferences.focusIds = ['evening', 'once'];
const sections = api.journeySections(timed,preferences,{},monday);
assert(names(sections[0].goals)==='evening,once' && names(sections[1].goals)==='any,morning-a,morning-b,offday,past', 'manual order applies independently in Focus and Other');
assert(!sections[2].goals.length, 'Completed starts empty');
const byTime = api.journeySections(timed,{...preferences,sortMode:'time'},{},monday);
assert(names(byTime[0].goals)==='once,evening' && names(byTime[1].goals)==='morning-a,morning-b,any,offday,past','time grouping respects sections');
assert(new Set(sections.flatMap(section=>section.goals.map(goal=>goal.id))).size===timed.length,'no top-level duplicates');
timed[0].completed=true; timed[0].completedDay=today;
timed[3].completed=true; timed[3].completedDay=today;
const completed = api.journeySections(timed,preferences,{},monday);
assert(names(completed[0].goals)==='once' && names(completed[2].goals)==='evening,morning-a','both sections move completion to Completed');
assert(preferences.focusIds.includes('evening'),'completion retains Focus');
timed[0].completed=false; timed[3].completed=false;
assert(JSON.stringify(api.journeySections(timed,preferences,{},monday))===JSON.stringify(sections),'undo restores section and manual order');
const noFocus=api.journeySections(timed,{...preferences,focusIds:[]},{},monday);
assert(!noFocus[0].goals.length && noFocus[1].goals.length===timed.length,'no implicit priority from selection, XP, time or recurrence');
const cleaned=api.normalizeJourney({...preferences,focusIds:['once','once','deleted']},timed,today);
assert(cleaned.focusIds.join()==='once','Focus IDs are valid and unique');
const rolled = api.normalizeJourney(preferences,timed,GoalSchedule.dayKey(tuesday));
assert(rolled.viewMode==='split' && rolled.sortMode==='manual' && !rolled.orderIds.length && !rolled.selectedIds.length && !rolled.focusIds.length, 'day rollover retains preferences but clears daily order and selections');
const malformed=api.normalizeJourney({date:today,viewMode:'bad',sortMode:{},orderIds:'bad'},timed,today);
assert(malformed.viewMode==='all' && malformed.sortMode==='time' && !malformed.orderIds.length, 'safe presentation defaults');
assert(JSON.stringify(api.normalizeJourney(preferences,timed,today))===JSON.stringify(preferences), 'presentation migration idempotent');
(typeof print==='function'?print:console.log)('PASS: Journey views, time relevance, deterministic ties, manual ordering, stable completion and daily preference normalization');

const progressGoals = [
  {id:'done',type:'step',completed:true,completedDay:today,status:'paused'},
  {id:'open',type:'step',completed:false},
];
const progressSelection = {date:today,selectedIds:['done','open'],hiddenIds:[]};
const progress = (selection=progressSelection, date=monday) => api.journeySummary(progressGoals,selection,date);
assert(progress().done===1 && progress().total===2,'visible progress baseline');
progressSelection.selectedIds=['open']; progressSelection.hiddenIds=['done'];
assert(progress().done===1 && progress().total===2,'hidden completed manual/paused Goal retains both counts');
assert(api.journeyGoals(progressGoals,progressSelection,monday).length===1,'retained completion does not restore row');
progressSelection.selectedIds=[]; progressSelection.hiddenIds=['done','open'];
assert(progress().done===1 && progress().total===1,'hidden unfinished Goal excluded');
assert(progress({...progressSelection,selectedIds:['done'],hiddenIds:['open']}).total===1,'restoring completed Goal never double counts');
assert(progress(progressSelection,tuesday).total===0,'retention ends with date-scoped hiding');
progressGoals[0].completed=false;
assert(progress().done===0 && progress().total===0,'undo elsewhere removes hidden completion from both counts');
const nested=[{id:'q',type:'quest',completed:true,completedDay:today,schedule:{type:'daily'}},{id:'c',type:'step',completed:true,completedDay:today,parentGoalId:'q',schedule:{type:'daily'}}];
const nestedSelection={date:today,hiddenIds:['c']};
assert(api.journeySummary(nested,nestedSelection,monday).total===1,'hidden nested Step not counted twice');
nestedSelection.hiddenIds=['q'];
assert(api.journeySummary(nested,nestedSelection,monday).total===1,'retained Quest remains summary parent when its child becomes visible');
const snapshot=JSON.stringify([nested,nestedSelection]);
api.journeySummary(nested,nestedSelection,monday);
assert(snapshot===JSON.stringify([nested,nestedSelection]),'summary derives counts without mutation or stored totals');
(typeof print==='function'?print:console.log)('PASS: hidden completed/unfinished Goals, restore, undo, rollover and nested summary counts');

const hierarchy=[{id:'q',type:'quest',schedule:{type:'daily'}},{id:'c',type:'step',parentGoalId:'q',schedule:{type:'daily'},completed:true,completedDay:today}];
const hierarchyPlan={date:today,focusIds:['c']};
let grouped=api.journeySections(hierarchy,hierarchyPlan,{},monday);
assert(!grouped[0].goals.length && names(grouped[1].goals)==='q' && !grouped[2].goals.length,'child focus never implicitly prioritizes parent or duplicates nested completion');
hierarchyPlan.focusIds=['q'];
grouped=api.journeySections(hierarchy,hierarchyPlan,{},monday);
assert(names(grouped[0].goals)==='q' && !grouped[1].goals.length,'parent Focus keeps hierarchy together');
hierarchyPlan.hiddenIds=['q'];
assert(names(api.journeySections(hierarchy,hierarchyPlan,{},monday)[2].goals)==='c','independently due child surfaces only when parent absent');
const old=[{id:'old',type:'step',completed:true,completedDay:'2026-10-01'}, {id:'unknown',type:'step',completed:true}];
const oldPlan={date:today,selectedIds:['old','unknown']};
assert(api.journeySections(old,oldPlan,{},monday).every(s=>!s.goals.length) && api.journeySummary(old,oldPlan,monday).done===0,'historical and undated completion never fabricated as today');
(typeof print==='function'?print:console.log)('PASS: Focus membership, completion/undo, section ordering, hierarchy and historical completion exclusion');
