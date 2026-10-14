// Run: gjs tests/journey-forecast-model.js (or node tests/journey-forecast-model.js).
const read = name => typeof require === 'function' ? require('fs').readFileSync(name, 'utf8') : new TextDecoder().decode(imports.gi.GLib.file_get_contents(name)[1]);
const Statistics = eval(read('statistics-model.js') + '\nStatistics;');
const GoalSchedule = eval(read('schedule-model.js') + '\nGoalSchedule;');
const JourneyForecast = eval(read('journey-forecast-model.js') + '\nJourneyForecast;');
const source = read('app.js');
const api = eval(source.slice(source.indexOf('// <goal-model>'), source.indexOf('// </goal-model>')) + '\n({migrateState, journeyForecastGoals, journeySummary});');
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const close = (a,b) => Math.abs(a-b)<1e-8;
for (const [xp, minutes] of [[10,5],[125,15],[0,10],[15,10],[30,10],[50,10],[100,10],[999,10]]) {
  assert(JourneyForecast.duration({type:'step',xp})===minutes, `Step ${xp} duration`);
}
for (const [xp, minutes] of [[200,105],[350,180],[500,210],[275,105],[400,180],[425,180],[600,210],[0,105],[999999,210]]) {
  assert(JourneyForecast.duration({type:'quest',xp})===minutes, `Quest ${xp} nearest preset / lower tie`);
}
assert(JourneyForecast.duration({type:'arc',xp:5000})===0,'Arc duration excluded');
for (const xp of [undefined,null,-1,1.5,Infinity,'','bad']) assert(JourneyForecast.duration({type:'step',xp})===null,'invalid XP cannot invent a duration');
const now = new Date(2026,9,12,15), today = Statistics.dayKey(now);
const make = (id,type='step',extra={}) => ({id,type,title:'Identical title',xp:type==='quest'?200:10,...extra});
const work = (goals, selectedIds=[],hiddenIds=[],focusIds=selectedIds) => JourneyForecast.workload(api.journeyForecastGoals(goals,{date:today,selectedIds,hiddenIds,focusIds},now));
assert(work([make('s')],['s']).minutes===5,'independent Step');
assert(work([make('q','quest')],['q']).minutes===105,'independent Quest');
const nested=[make('q','quest'),make('s','step',{parentGoalId:'q'}),make('c','step',{parentGoalId:'q',completed:true})];
assert(work(nested,['q','s']).minutes===105,'Quest replaces collapsed/nested Steps, including completed children');
assert(work(nested,['s']).minutes===5,'Step included independently when parent is not in plan');
nested[0].completed=true;
assert(work(nested,['q']).minutes===5,'unfinished child of completed Quest remains actual Journey work');
assert(work(nested,['q'],['s']).minutes===0,'hidden child of completed Quest excluded');
const arc=[make('arc','arc'),make('s','step',{parentGoalId:'arc'}),make('q','quest',{parentGoalId:'arc'})];
assert(work(arc,['arc','s','q']).minutes===110,'direct Step and Quest under Arc count, Arc never does');
const membership=[make('daily','step',{schedule:{type:'daily'}}),make('off','quest',{schedule:{type:'weekly',daysOfWeek:[2]}}),make('paused','step',{status:'paused',schedule:{type:'daily'}}),make('done','step',{completed:true}),make('outside'),make('hidden','step',{schedule:{type:'daily'}})];
assert(work(membership,['paused','done'],['hidden']).minutes===5,'only explicitly focused manual pause included; automatic Other, offday, hidden, completed and outside excluded');
assert(work([make('one'),make('two')],['one','two']).minutes===10,'same titles are separate IDs');
const selected={date:today,selectedIds:['one'],focusIds:['one'],hiddenIds:[]};
const plan=[make('one'),make('two','step',{schedule:{type:'daily'}})];
const baseline=JourneyForecast.workload(api.journeyForecastGoals(plan,selected,now)).minutes;
assert(JourneyForecast.workload(api.journeyForecastGoals(plan,{...selected,viewMode:'split',focusIds:['one'],collapsedSections:{focus:true,other:true,completed:true},sortMode:'manual',orderIds:['two','one']},now)).minutes===baseline,'presentation/reordering do not change membership');
const hiddenDone=[make('done','step',{completed:true,completedDay:today})];
const hiding={date:today,hiddenIds:['done']};
assert(api.journeySummary(hiddenDone,hiding,now).done===1 && JourneyForecast.workload(api.journeyForecastGoals(hiddenDone,hiding,now)).minutes===0,'hidden completed summary is not forecast work');
for (const [available,workload,expected] of [[10,10,50],[20,10,80],[5,10,20],[30,10,90],[0,10,0]]) assert(close(JourneyForecast.percentage(available,workload),expected),'smooth formula');
assert(JourneyForecast.percentage(10,0)===null && JourneyForecast.percentage(NaN,10)===null,'no workload/invalid inputs do not produce NaN');
const active={preferredEndTime:'16:00',activeDate:today};
const three=[1,2,3].map(id=>make(String(id),'step',{xp:125}));
let value=JourneyForecast.calculate(active,three,now);
assert(value.workloadMinutes===45 && value.availableMinutes===45 && value.percent===50 && value.risk==='at-risk','75% factor applied');
assert(JourneyForecast.calculate({...active,preferredEndTime:'17:00'},three,now).risk==='good','longer target updates risk');
assert(JourneyForecast.calculate(active,three,new Date(2026,9,12,15,30)).percent===20,'actual later time reduces forecast');
assert(JourneyForecast.calculate(active,three,new Date(2026,9,12,16)).phase==='expired','deadline reached expires without rollover');
assert(JourneyForecast.calculate(active,[],now).phase==='completed' && JourneyForecast.calculate(active,[],now).percent===null,'no goals hides percentage');
three[0].completed=true;assert(JourneyForecast.calculate(active,three,now).percent>50,'completion reduces workload');
three[0].completed=false;assert(JourneyForecast.calculate(active,three,now).percent===50,'undo restores workload');
assert(JourneyForecast.calculate(active,[make('bad','step',{xp:'bad'})],now).phase==='unavailable','bad imported work fails gracefully');
assert(JourneyForecast.calculate(active,three,new Date(2026,9,13,10)).phase==='inactive','new day requires new activation');
for(const invalid of [null,{},[],{preferredEndTime:'24:00',activeDate:today},{preferredEndTime:'09:15',activeDate:{}}]) {
  const normalized=JourneyForecast.normalize(invalid,today);
  assert(!normalized.activeDate && GoalSchedule.validTime(normalized.preferredEndTime),'malformed state safely inactive');
  assert(JSON.stringify(normalized)===JSON.stringify(JourneyForecast.normalize(normalized,today)),'normalization idempotent');
}
assert(JourneyForecast.normalize(active,'2026-10-13').preferredEndTime==='16:00','preferred time survives day rollover');
assert(JourneyForecast.calculate(JSON.parse(JSON.stringify(active)),three,now).percent===50,'reload restores active deadline');
const migrated=api.migrateState({updatedAt:17,skills:[{id:'s',xp:900}],goals:[],completionHistory:[{id:'old',xpAwarded:900}]});
assert(migrated.updatedAt===17 && migrated.skills[0].xp===900 && migrated.completionHistory.length===1 && !migrated.journeyForecast.activeDate,'migration preserves facts/timestamp without activation');
assert(JSON.stringify(migrated)===JSON.stringify(api.migrateState(migrated)),'full migration idempotent');
const frozen=JSON.stringify([active,three]);JourneyForecast.calculate(active,three,now);assert(JSON.stringify([active,three])===frozen,'calculations do not write settings or Goals');
const dst=new Date(2026,2,8,0,30);
assert(JourneyForecast.deadline('04:00',dst)===new Date(2026,2,8,4).getTime(),'deadline follows local Date/DST semantics');
(typeof print==='function'?print:console.log)('PASS: duration rules/ties, Journey eligibility/nesting, formula/risk, time/completion/undo, expiry, reload, rollover, invalid data and migration');

assert(work(membership,[],[],[]).minutes===0,'automatic habits never become forecast Focus');
assert(work(membership,[],[],['daily']).minutes===5,'explicitly focused scheduled habit contributes');
assert(work([make('manual')],['manual'],[],[]).minutes===0,'manually selected Other Task excluded');
assert(work([make('outside')],[],[],['outside']).minutes===0,'Focus IDs alone never add absent goals to plan');
const hierarchy=[make('q','quest'),make('s','step',{parentGoalId:'q'})];
assert(work(hierarchy,['q','s'],[],['s']).minutes===0,'dormant child Focus never prioritizes its visible Other Quest');
assert(work(hierarchy,['s'],[],['s']).minutes===5,'independent focused child contributes without visible parent');
assert(work(hierarchy,['q'],[],['q']).minutes===105,'focused Quest includes children without double workload');
hierarchy[0].completed=true;
assert(work(hierarchy,['q'],[],['q']).minutes===5,'unfinished nested child remains work after focused parent completion');
const prefs=JourneyForecast.normalize({...active,showIndicator:false,expanded:true},today);
assert(!prefs.showIndicator && prefs.expanded,'visibility and disclosure preferences normalized');
const rolled=JourneyForecast.normalize(prefs,'2026-10-13');
assert(!rolled.activeDate && rolled.preferredEndTime==='16:00' && !rolled.showIndicator && rolled.expanded,'day reset preserves remembered time and UI preferences only');
const defaults=JourneyForecast.normalize(null,today);
assert(defaults.showIndicator && !defaults.expanded && !defaults.activeDate,'safe defaults: shown indicator, collapsed, inactive');
assert(JourneyForecast.normalize({expanded:'yes',showIndicator:'no'},today).showIndicator && !JourneyForecast.normalize({expanded:'yes'},today).expanded,'malformed UI preferences use boolean defaults');
assert(!api.journeyForecastGoals(plan,{...selected,date:'2026-10-11'},now).length,'daily reset clears Focus workload without inferring new priority');
(typeof print==='function'?print:console.log)('PASS: Focus-only workload, hierarchy, explicit daily activation and persistent UI preferences');
