(async () => {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const card = id => document.querySelector(`#journeyList [data-id="${id}"]`);
  const ids = (root = document) => [...root.querySelectorAll('.journey-card')].map(node => node.dataset.id).join();
  const view = mode => document.querySelector(`[data-journey-view="${mode}"]`).click();
  const sort = mode => document.querySelector(`[data-journey-sort="${mode}"]`).click();
  const check = id => document.querySelector(`#journeyList [data-goal-id="${id}"] input`);
  const pass = () => {
    const result=document.createElement('pre');result.id='test-result';result.hidden=true;result.textContent='PASS: Journey views, compact rows, time/Anytime, ordering, refresh, sync, rollback, nested removal, pauses, XP/undo, keyboard focus, rollover and responsive/reduced motion';document.body.append(result);
  };
  try {
    const reloaded = sessionStorage.getItem('journey-reload-check');
    if (reloaded) {
      const expected = JSON.parse(reloaded);
      assert(JSON.stringify(state.journey) === expected.journey, 'actual browser refresh preserves preferences and order');
      assert(JSON.stringify([state.goals,state.skills,state.completionHistory]) === expected.facts, 'refresh preserves all facts');
      assert(document.querySelector('[data-journey-view="split"]').getAttribute('aria-pressed') === 'true', 'refresh restores selected view');
      view('all'); assert(ids() === expected.order, 'refresh restores manual sequence');
      assert(!window.__browserErrors.length, 'no reload browser errors');
      sessionStorage.removeItem('journey-reload-check');
      view('split');
      pass(); return;
    }
    const now = new Date();
    const day = GoalSchedule.dayKey(now);
    const weekday = now.getDay() || 7;
    const goal = (id, extra = {}) => ({id, type:'step', title:id, description:'', skillId:'s', xp:30, parentGoalId:'', createdAt:now.toISOString(), ...extra});
    state = migrateState({updatedAt:40, profile:{name:'Tester'}, streak:{count:0,date:''}, skills:[{id:'s',name:'Learning',xp:0}], goals:[
      goal('evening',{title:'Evening exercise',schedule:{type:'daily',time:'20:00'}}),
      goal('morning-b',{title:'Read 10 pages',schedule:{type:'daily',time:'07:00'}}),
      goal('morning-a',{title:'Morning stretch',schedule:{type:'daily',time:'07:00'}}),
      goal('any',{title:'Sleep before midnight'}),
      goal('once',{title:'Meet a friend',schedule:{type:'one-time',time:'10:20'}}),
      goal('past',{title:'Review earlier notes',schedule:{type:'one-time',time:'06:00'}}),
      goal('offday',{schedule:{type:'weekly',daysOfWeek:[weekday % 7 + 1],time:'05:00'}}),
      goal('quest',{title:'Build a reading practice',type:'quest',xp:200,schedule:{type:'daily',time:'18:00'}}),
      goal('child',{title:'Choose a chapter',parentGoalId:'quest'}),
      goal('paused',{status:'paused',schedule:{type:'daily',time:'04:00'}}),
      goal('parent',{type:'arc',status:'paused'}),
      goal('inherited',{parentGoalId:'parent',schedule:{type:'daily',time:'03:00'}}),
    ], oneTimeSchedules:{past:{day:'2000-01-01',configuredAt:1}}, journey:{date:day,selectedIds:['evening','any','once','past','offday'],hiddenIds:[]} });
    saveState(); render();
    const expected='morning-a,morning-b,once,quest,evening,any,offday,past';
    assert(ids()===expected, 'time order, deterministic ties and Anytime');
    assert(ids(document.querySelector('[data-journey-group="anytime"]'))==='any,offday,past', 'no times inferred from title or another date');
    assert(!card('paused') && !card('inherited'), 'effective pause excluded');
    const summary=document.getElementById('journeySummary').textContent;
    const facts=JSON.stringify([state.goals,state.skills,state.completionHistory,state.oneTimeSchedules]);
    view('split');
    assert(ids(document.querySelector('[data-journey-section="journey"]'))==='once,evening,any,offday,past', 'manual recurring goal only in Journey');
    assert(ids(document.querySelector('[data-journey-section="routine"]'))==='morning-a,morning-b,quest', 'automatic routines sorted');
    assert(document.getElementById('journeySort').hidden, 'sort control only in unified view');
    assert(document.getElementById('journeySummary').textContent===summary, 'mode does not change summary');
    assert(JSON.stringify([state.goals,state.skills,state.completionHistory,state.oneTimeSchedules])===facts, 'switching changes no facts');
    state=loadState();render();
    assert(document.querySelector('[data-journey-view="split"]').getAttribute('aria-pressed')==='true', 'preference survives ordinary load');
    view('all'); sort('manual');
    assert(ids()===expected, 'initial manual sequence follows time order');
    let up=card('evening').querySelector('[data-journey-move="-1"]');
    up.focus(); up.click();
    assert(ids()==='morning-a,morning-b,once,evening,quest,any,offday,past', 'move changes only sequence');
    assert(document.activeElement.closest('[data-goal-id]').dataset.goalId==='evening', 'move retains keyboard focus');
    assert(document.getElementById('journeyOrderStatus').textContent.includes('position 4'), 'movement announced');
    const order=ids();
    sort('time'); assert(ids()===expected,'By time restored');
    sort('manual'); assert(ids()===order,'custom order retained');
    view('split'); view('all'); assert(ids()===order,'view changes retain order');
    state=loadState();render(); assert(ids()===order && state.journey.sortMode==='manual','manual order survives reload');
    check('evening').click();
    assert(state.skills[0].xp===30 && state.completionHistory.length===1 && ids()===order,'completion awards once and does not move row');
    view('split'); assert(check('evening').checked,'shared completion in split view');
    check('evening').click(); assert(state.skills[0].xp===0 && !state.completionHistory.length,'undo shares reward path');
    card('evening').querySelector('.journey-remove').click();
    view('all'); assert(!card('evening'),'split removal hides unified goal');
    openJourneyPicker(); document.getElementById('journeySearch').value='Evening exercise';renderJourneyChoices(); document.querySelector('.journey-choice').click();
    assert(card('evening') && ids()===order,'picker restores routine at custom position');
    card('morning-a').querySelector('.journey-remove').click(); view('split'); assert(!card('morning-a'),'unified removal hides split goal');
    changeJourneySelection('morning-a',true);
    changeJourneySelection('paused',true); changeJourneySelection('inherited',true);
    assert(card('paused') && card('inherited'),'manual pause overrides in split view');
    card('quest').querySelector('[data-journey-expand]').click();
    assert(check('child') && !card('child'),'nested child not counted top-level');
    check('child').click(); assert(state.skills[0].xp===30 && !state.goals.find(g=>g.id==='quest').completed,'child does not complete parent');
    document.querySelector('[data-goal-id="child"] .journey-remove').click();
    assert(!check('child'),'nested child removable');
    openJourneyPicker();document.getElementById('journeySearch').value='Choose a chapter';renderJourneyChoices();document.querySelector('.journey-choice').click();
    assert(check('child').checked,'nested child restoration preserves completion');
    const trigger=card('quest').querySelector('.goal-menu-trigger');trigger.focus();trigger.click();
    assert(document.querySelector('[role="menu"] [role="menuitem"]'),'shared menu opens');
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    assert(document.activeElement===trigger,'menu Escape returns focus');
    view('all'); sort('manual');
    const beforeFailure=JSON.stringify(state);
    const original=Storage.prototype.setItem;
    Storage.prototype.setItem=()=>{throw new Error('quota');};
    try {
      view('split'); assert(JSON.stringify(state)===beforeFailure,'failed preference write rolls back');
      moveJourneyGoal('evening',-1); assert(JSON.stringify(state)===beforeFailure,'failed order write rolls back');
    }
    finally {Storage.prototype.setItem=original;}
    saveState();
    const remote=structuredClone(state);remote.updatedAt=state.updatedAt+100;remote.journey.viewMode='split';remote.journey.orderIds=['past','evening'];
    localStorage.setItem(STORAGE_KEY,JSON.stringify(remote));window.dispatchEvent(new StorageEvent('storage',{key:STORAGE_KEY,newValue:JSON.stringify(remote)}));
    assert(state.journey.viewMode==='split' && document.getElementById('journeySort').hidden,'storage event applies synchronized preference');
    view('all');assert(ids().startsWith('past,evening'),'synchronized order applies');
    state.journey.date='2000-01-01';renderedDay='2000-01-01';refreshLocalDay();
    assert(!state.journey.orderIds.length && !state.journey.selectedIds.length && state.journey.sortMode==='manual','rollover clears daily order but retains preference');
    view('split');assert(document.querySelector('[data-journey-section="journey"] .journey-section-empty'),'sensible empty Journey');
    view('all');sort('time');
    const height=card('morning-a').getBoundingClientRect().height;
    assert(height>=44 && height<=64,`compact simple Step height: ${height}`);
    state.goals.find(g=>g.id==='morning-a').title='A longer task title that wraps naturally without clipping any of the words or controls';
    render();await wait(900);
    assert(document.documentElement.scrollWidth<=innerWidth,'narrow layout has no horizontal overflow');
    if(matchMedia('(prefers-reduced-motion: reduce)').matches) assert(getComputedStyle(document.querySelector('[data-journey-view]')).transitionDuration==='0s','reduced motion disables switch transitions');
    assert(!window.__browserErrors.length,'no browser errors');
    sort('manual');moveJourneyGoal('evening',-1);
    const reloadOrder=ids();view('split');
    sessionStorage.setItem('journey-reload-check',JSON.stringify({journey:JSON.stringify(state.journey),facts:JSON.stringify([state.goals,state.skills,state.completionHistory]),order:reloadOrder}));
    location.reload();
  } catch(error) {const result=document.createElement('pre');result.id='test-result';result.textContent='FAIL: '+error.message+'\n'+error.stack;document.body.append(result);}
})();
