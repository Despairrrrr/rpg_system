(async () => {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const card = id => document.querySelector(`#journeyList [data-id="${id}"]`);
  const section = key => document.querySelector(`[data-journey-section="${key}"]`);
  const toggle = key => section(key).querySelector('.journey-section-toggle');
  const ids = key => [...section(key).querySelectorAll('.journey-card')].map(node => node.dataset.id).join();
  const sort = mode => document.querySelector(`[data-journey-sort="${mode}"]`).click();
  const check = id => document.querySelector(`#journeyList [data-goal-id="${id}"] input`);
  const focus = id => card(id).querySelector('.journey-focus-toggle').click();
  const where = id => card(id)?.closest('[data-journey-section]').dataset.journeySection;
  const facts = () => JSON.stringify([state.goals,state.skills,state.completionHistory,state.oneTimeSchedules]);
  const choose = (title, destination = 'other') => {
    openJourneyPicker();
    document.getElementById('journeySearch').value = title;
    document.getElementById('journeyDestination').value = destination;
    document.getElementById('journeyDestination').dispatchEvent(new Event('change'));
    const choice = document.querySelector('.journey-choice');
    const text = choice.textContent;
    choice.click();
    return text;
  };
  const pass = () => {
    const result=document.createElement('pre');result.id='test-result';result.hidden=true;
    result.textContent='PASS: Focus/Other/Completed, picker, creation, section collapse, forecast invariance, completion/undo, ordering, hierarchy, hidden goals, reload, storage sync, rollback, rollover and responsive layout';document.body.append(result);
  };
  try {
    const reloaded = sessionStorage.getItem('journey-reload-check');
    if (reloaded) {
      const expected = JSON.parse(reloaded);
      assert(JSON.stringify(state.journey)===expected.journey && facts()===expected.facts,'actual reload preserves Focus, manual order, sort and all facts');
      assert(ids('focus')===expected.focus && ids('other')===expected.other,'actual reload restores sections');
      assert(toggle('completed').getAttribute('aria-expanded')==='false','new page session defaults Completed to collapsed');
      sessionStorage.removeItem('journey-reload-check');
      toggle('completed').click();
      document.getElementById('journeyForecast').open=false;
      window.scrollTo(0, 0);
      assert(!window.__browserErrors.length,'no reload browser errors');
      await wait(300); pass(); return;
    }
    const now = new Date(), day = GoalSchedule.dayKey(now), weekday = now.getDay() || 7;
    const goal = (id, extra = {}) => ({id,type:'step',title:id,description:'',skillId:'s',xp:30,parentGoalId:'',createdAt:now.toISOString(),...extra});
    state = migrateState({updatedAt:40,profile:{name:'Wayfarer'},streak:{count:0,date:''},skills:[{id:'s',name:'Learning',xp:0}],goals:[
      goal('evening',{title:'Evening exercise',schedule:{type:'daily',time:'20:00'}}),
      goal('morning-b',{title:'Read 10 pages',schedule:{type:'daily',time:'07:00'}}),
      goal('morning-a',{title:'Morning stretch',schedule:{type:'daily',time:'07:00'}}),
      goal('any',{title:'Plan tomorrow'}),
      goal('once',{title:'Meet a friend',schedule:{type:'one-time',time:'10:20'}}),
      goal('past',{title:'Review earlier notes',schedule:{type:'one-time',time:'06:00'}}),
      goal('offday',{schedule:{type:'weekly',daysOfWeek:[weekday % 7 + 1],time:'05:00'}}),
      goal('quest',{title:'Build a reading practice',type:'quest',xp:200,schedule:{type:'daily',time:'18:00'}}),
      goal('child',{title:'Choose a chapter',parentGoalId:'quest',schedule:{type:'daily'}}),
      goal('paused',{status:'paused',schedule:{type:'daily',time:'04:00'}}),
      goal('parent',{type:'arc',status:'paused'}),
      goal('inherited',{parentGoalId:'parent',schedule:{type:'daily',time:'03:00'}}),
    ],oneTimeSchedules:{past:{day:'2000-01-01',configuredAt:1}},journey:{date:day,selectedIds:['evening','any','once','past','offday'],viewMode:'split'}});
    saveState(); render();
    const expected='morning-a,morning-b,once,quest,evening,any,offday,past';
    assert(ids('other')===expected && ids('focus')==='' && ids('completed')==='','scheduled and manually selected goals default to Other regardless of legacy view');
    assert(!document.querySelector('[data-journey-view]'),'old view switch removed');
    assert(!card('paused') && !card('inherited'),'effective pause excluded');
    assert(toggle('focus').getAttribute('aria-expanded')==='true' && toggle('other').getAttribute('aria-expanded')==='true' && toggle('completed').getAttribute('aria-expanded')==='false','disclosure defaults');
    const before=facts();
    focus('evening'); assert(where('evening')==='focus','card moves to Focus');
    assert(document.activeElement===card('evening').querySelector('.journey-focus-toggle'),'move retains keyboard focus');
    focus('evening'); assert(where('evening')==='other','card moves back to Other');
    choose('Evening exercise','focus'); assert(where('evening')==='focus','picker moves already included goal to Focus');
    choose('Plan tomorrow'); assert(where('any')==='other','picker defaults Other');
    assert(facts()===before,'section changes preserve Goal, XP, Skill, schedule, parent and history');
    const summary=JSON.stringify(journeySummary(state.goals,state.journey));
    const forecast=JSON.stringify(JourneyForecast.workload(journeyForecastGoals(state.goals,state.journey)));
    const stored=localStorage.getItem(STORAGE_KEY);
    for (const key of ['focus','other','completed']) {
      const button=toggle(key); button.focus(); button.click();
      assert(button.tagName==='BUTTON' && button.type==='button','native keyboard-accessible disclosure');
      assert(document.getElementById(button.getAttribute('aria-controls')).hidden===(button.getAttribute('aria-expanded')==='false'),'aria state agrees with content');
    }
    document.querySelector('[data-section="goals"]').click(); document.querySelector('[data-section="journey"]').click();
    assert(toggle('focus').getAttribute('aria-expanded')==='false' && toggle('other').getAttribute('aria-expanded')==='false' && toggle('completed').getAttribute('aria-expanded')==='true','independent collapse survives navigation');
    assert(stored===localStorage.getItem(STORAGE_KEY) && facts()===before,'collapse causes no persistence or fact changes');
    assert(JSON.stringify(journeySummary(state.goals,state.journey))===summary && JSON.stringify(JourneyForecast.workload(journeyForecastGoals(state.goals,state.journey)))===forecast,'all sections remain counted in progress and Forecast');
    toggle('focus').click();toggle('other').click();toggle('completed').click();
    focus('once'); sort('manual');
    assert(ids('focus')==='once,evening','initial manual Focus order is chronological');
    card('evening').querySelector('[data-journey-move="-1"]').click();
    assert(ids('focus')==='evening,once','manual reorder within Focus');
    assert(card('evening').querySelector('[data-journey-move="-1"]').disabled,'cannot move above section boundary');
    const order=ids('focus'), otherOrder=ids('other'), savedOrder=state.journey.orderIds.join();
    check('evening').click();
    assert(where('evening')==='completed' && state.journey.focusIds.includes('evening') && state.skills[0].xp===30 && state.completionHistory.length===1,'Focus completion moves and awards once');
    assert(document.activeElement===toggle('completed'),'completion into collapsed section focuses its header');
    assert(!card('evening').querySelector('[data-journey-move]'),'Completed has no reorder controls');
    toggle('completed').click();check('evening').click();
    assert(ids('focus')===order && state.journey.orderIds.join()===savedOrder && state.skills[0].xp===0 && !state.completionHistory.length,'undo restores Focus order and exact XP');
    check('morning-a').click(); assert(where('morning-a')==='completed','Other completion moves');
    check('morning-a').click(); assert(ids('other')===otherOrder && state.skills[0].xp===0,'undo returns Other order');
    sort('time'); assert(ids('focus')==='once,evening','By time inside Focus');
    sort('manual'); assert(ids('focus')===order,'manual order survives sort switch');
    check('evening').click(); const doneSummary=JSON.stringify(journeySummary(state.goals,state.journey));
    card('evening').querySelector('.journey-remove').click();toggle('completed').click();toggle('completed').click();
    assert(!card('evening') && JSON.stringify(journeySummary(state.goals,state.journey))===doneSummary,'hidden completion stays hidden and counted');
    choose('Evening exercise','focus'); check('evening').click();
    assert(ids('focus')===order && state.skills[0].xp===0,'restore hidden Focus and undo retains original order');
    card('quest').querySelector('[data-journey-expand]').click();
    assert(check('child') && !card('child'),'child nested once');
    check('child').click();assert(!state.goals.find(g=>g.id==='quest').completed && ids('completed')==='','completed child stays nested without completing parent');
    const pickerText=choose('Choose a chapter','focus');
    assert(pickerText.includes('Move with Build a reading practice') && where('quest')==='focus' && !card('child'),'picker explains explicit group movement');
    check('quest').click();assert(where('quest')==='completed' && !card('child'),'completed parent retains children without duplicate top-level completion');
    check('quest').click();check('child').click();assert(state.skills[0].xp===0,'parent and child undo reverse only their own rewards');
    document.querySelector('[data-goal-id="child"] .journey-remove').click();
    assert(choose('Choose a chapter','other').includes('Move with Build a reading practice'),'hidden child destination explains parent group before restoring it');
    assert(where('quest')==='other' && !card('child'),'restored child stays nested in explicitly chosen section');
    focus('quest');
    focus('quest'); assert(where('quest')==='other' && !card('child'),'moving Quest keeps group');
    card('quest').querySelector('.journey-remove').click();assert(where('child')==='other','independently due child appears when parent hidden');
    choose('Build a reading practice');assert(!card('child') && check('child'),'restored parent reabsorbs child without duplication');
    const trigger=card('quest').querySelector('.goal-menu-trigger');trigger.focus();trigger.click();
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    assert(document.activeElement===trigger,'existing actions and keyboard dismissal retained');
    choose('paused','focus');choose('inherited');assert(where('paused')==='focus' && where('inherited')==='other','manual paused selections supported');
    openJourneyPicker();document.getElementById('journeyDestination').value='focus';document.getElementById('createJourneyGoal').click();
    els.goalTitle.value='Write a short reflection';els.goalSkill.value='s';els.goalForm.dispatchEvent(new Event('submit',{cancelable:true}));
    const created=state.goals.find(g=>g.title==='Write a short reflection');
    assert(where(created.id)==='other' && !state.journey.focusIds.includes(created.id),'creation defaults Other even after picker Focus choice');
    const beforeFailure=JSON.stringify(state), original=Storage.prototype.setItem;
    Storage.prototype.setItem=()=>{throw new Error('quota');};
    try {
      focus('evening');assert(JSON.stringify(state)===beforeFailure,'failed Focus save rolls back');
      moveJourneyGoal('evening',1);assert(JSON.stringify(state)===beforeFailure,'failed manual order save rolls back');
    } finally {Storage.prototype.setItem=original;}
    saveState();
    const remote=structuredClone(state);remote.updatedAt=state.updatedAt+100;remote.journey.focusIds=['past'];remote.journey.orderIds=['past','evening'];
    localStorage.setItem(STORAGE_KEY,JSON.stringify(remote));window.dispatchEvent(new StorageEvent('storage',{key:STORAGE_KEY,newValue:JSON.stringify(remote)}));
    assert(ids('focus')==='past' && ids('other').startsWith('evening'),'storage synchronization applies Focus and order');
    const beforeRollover=facts();state.journey.date='2000-01-01';renderedDay='2000-01-01';refreshLocalDay();
    assert(!state.journey.focusIds.length && !state.journey.orderIds.length && !state.journey.selectedIds.length && state.journey.sortMode==='manual','rollover clears daily Focus/selection/order and retains sort');
    assert(where('evening')==='other' && !card('any') && facts()===beforeRollover,'scheduled habits reappear in Other without changing facts');
    focus('quest');focus('morning-a');
    state.goals.find(g=>g.id==='morning-a').title='A longer task title that wraps naturally without clipping any words or controls';render();
    check('evening').click();
    const all=[...document.querySelectorAll('.journey-card')].map(node=>node.dataset.id);
    assert(new Set(all).size===all.length,'no duplicate top-level cards');
    await wait(900);
    assert(document.documentElement.scrollWidth<=innerWidth,'desktop/mobile no horizontal overflow');
    if(matchMedia('(prefers-reduced-motion: reduce)').matches) assert(getComputedStyle(document.querySelector('[data-journey-sort]')).transitionDuration==='0s','reduced motion respected');
    assert(!window.__browserErrors.length,'no browser errors');
    sessionStorage.setItem('journey-reload-check',JSON.stringify({journey:JSON.stringify(state.journey),facts:facts(),focus:ids('focus'),other:ids('other')}));
    location.reload();
  } catch(error) {const result=document.createElement('pre');result.id='test-result';result.textContent='FAIL: '+error.message+'\n'+error.stack;document.body.append(result);}
})();
