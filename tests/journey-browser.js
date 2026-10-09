(async () => {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const card = id => document.querySelector(`#journeyList > [data-id="${id}"]`);
  const check = id => document.querySelector(`#journeyList [data-goal-id="${id}"] input`);
  try {
    assert([...document.querySelectorAll('.nav-item')].map(node => node.dataset.section).join() === 'journey,goals,statistics', 'navigation order');
    assert(!document.getElementById('journeyPage').hidden && !document.querySelector('.dashboard').hidden, 'Today is the initial view');
    const today = GoalSchedule.dayKey(new Date());
    const weekday = new Date().getDay() || 7;
    const goal = (id, type = 'step', extra = {}) => ({ id, type, title: id, description: '', skillId: 's', xp: 30, parentGoalId: '', completed: false, createdAt: new Date().toISOString(), ...extra });
    state = migrateState({ updatedAt: 19, profile: {name:'Tester',photo:''}, streak:{count:0,date:''}, skills:[{id:'s',name:'Learning',xp:90}], goals:[
      goal('daily', 'step', {schedule:{type:'daily'}}),
      goal('quest', 'quest', {schedule:{type:'weekly',daysOfWeek:[weekday]},xp:200}),
      goal('child', 'step', {parentGoalId:'quest',schedule:{type:'daily'}}),
      goal('manual'), goal('offday', 'step', {schedule:{type:'custom',daysOfWeek:[weekday % 7 + 1]}}),
      goal('arc','arc'),
    ] });
    saveState(); render();
    assert(card('daily') && card('quest') && !card('child') && !card('manual') && !card('offday') && !card('arc'), 'scheduled inclusion and child deduplication');
    assert(document.getElementById('journeySummary').textContent.startsWith('0 of 2'), 'top-level count');
    assert(document.querySelector('.skill-row[data-id="s"]').getBoundingClientRect().width > 0, 'Skills visible');
    card('quest').querySelector('[aria-expanded="false"][data-journey-expand]').click();
    assert(!card('quest').querySelector('.journey-children').hidden, 'expand children');
    check('child').click();
    assert(state.skills[0].xp === 120 && !state.goals.find(g=>g.id==='quest').completed, 'child awards its own XP without completing Quest');
    assert(document.querySelector('.skill-level').textContent === 'Lvl. 2', 'level crossing');
    assert(document.querySelector('.skill-fill').classList.contains('is-animating'), 'Skill bar animation');
    await wait(900);
    const fill = document.querySelector('.skill-fill');
    assert(Math.abs(parseFloat(fill.style.width) - getLevelInfo(120).progress) < .01, 'correct final progress after level crossing');
    toggleGoalCompletion('child',true);
    assert(state.skills[0].xp === 120 && state.completionHistory.length===1, 'no duplicate rewards');
    check('quest').click();
    assert(state.skills[0].xp === 320 && state.completionHistory.length===2, 'Quest awards its reward');
    await wait(900);
    check('quest').click();
    assert(state.skills[0].xp === 120 && document.querySelector('.skill-fill').classList.contains('is-animating'), 'undo animates and reverses reward');
    document.querySelector('[data-section="goals"]').click();
    assert(document.querySelector('#goalsPage [data-id="child"] input').checked, 'Goals shares completion');
    document.querySelector('#goalsPage [data-id="child"] input').click();
    document.querySelector('[data-section="journey"]').click();
    assert(!check('child').checked && state.skills[0].xp===90 && !state.completionHistory.length, 'undo across views');
    const facts = JSON.stringify([state.goals,state.skills,state.completionHistory]);
    card('quest').querySelector('.journey-remove').click();
    assert(!card('quest') && card('child'), 'removing Quest removes nested presentation, due child remains independently available');
    card('daily').querySelector('.journey-remove').click();
    state = migrateState(JSON.parse(localStorage.getItem(STORAGE_KEY))); render();
    assert(!card('daily') && !card('quest'), 'hidden scheduled goals survive reload migration');
    assert(JSON.stringify([state.goals,state.skills,state.completionHistory])===facts, 'removal preserves all facts');
    openJourneyPicker();
    document.getElementById('journeySearch').value='daily'; renderJourneyChoices();
    document.querySelector('.journey-choice').click();
    assert(card('daily') && !document.getElementById('journeyPicker').open, 'picker restores habit');
    openJourneyPicker(); document.getElementById('journeySearch').value='manual'; renderJourneyChoices(); document.querySelector('.journey-choice').click();
    assert(card('manual'), 'manual selection');
    openJourneyPicker(); document.getElementById('createJourneyGoal').click();
    assert(els.goalModal.open && els.goalType.querySelector('[value="arc"]').disabled, 'existing creation form limits Today to Step/Quest');
    els.goalTitle.value='Created today'; els.goalSkill.value='s'; els.goalForm.dispatchEvent(new Event('submit',{cancelable:true}));
    const created = state.goals.find(g=>g.title==='Created today');
    assert(created && card(created.id), 'created goal immediately selected');
    openGoalModal(null,'step',null,true); els.goalModal.close(); openGoalModal(null,'arc');
    assert(!els.goalType.querySelector('[value="arc"]').disabled, 'ordinary CRUD retains Arc'); els.goalModal.close();
    changeJourneySelection('quest',true);
    card('quest').querySelector('.journey-add-step').click();
    assert(els.goalParent.value==='quest', 'child creation uses existing hierarchy');
    els.goalTitle.value='New child'; els.goalForm.dispatchEvent(new Event('submit',{cancelable:true}));
    const child = state.goals.find(g=>g.title==='New child');
    assert(child.parentGoalId==='quest' && check(child.id) && !card(child.id), 'new child nested exactly once');
    const beforeDate = JSON.stringify([state.goals,state.skills,state.completionHistory]);
    state.journey.date = '2000-01-01'; renderedDay = '2000-01-01'; refreshLocalDay();
    assert(state.journey.date===today && !state.journey.selectedIds.length && !state.journey.hiddenIds.length, 'date rollover clears selection/removals');
    assert(card('quest') && card('daily') && !card('manual'), 'recurrences return, manual goals do not carry over');
    assert(JSON.stringify([state.goals,state.skills,state.completionHistory])===beforeDate, 'rollover preserves facts');
    const beforeFailure = JSON.stringify(state);
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error('QuotaExceededError'); };
    try {
      assert(!changeJourneySelection('daily', false), 'failed selection save reports failure');
      assert(JSON.stringify(state) === beforeFailure && card('daily'), 'selection write failure rolls back');
      openGoalModal(null, 'step', 's', true);
      assert(!createGoal({title:'Failed create',description:'',type:'step',skillId:'s',xp:10}), 'failed creation');
      assert(JSON.stringify(state)===beforeFailure, 'creation and selection roll back together');
      els.goalModal.close();
    } finally { Storage.prototype.setItem = originalSetItem; }
    saveState();
    const remote = structuredClone(state); remote.updatedAt=state.updatedAt+100; remote.journey.selectedIds=['manual'];
    localStorage.setItem(STORAGE_KEY,JSON.stringify(remote)); syncStoredProgress();
    assert(card('manual'), 'newer synced state updates Today');
    document.querySelector('[data-section="statistics"]').click();
    assert(!document.getElementById('statisticsPage').hidden, 'Statistics navigation');
    document.querySelector('[data-section="journey"]').click();
    for (const item of journeyGoals(state.goals, state.journey)) toggleGoalCompletion(item.id,true);
    assert(document.getElementById('journeySummary').textContent.includes('All done'), 'completed cards retained with success summary');
    const populated = structuredClone(state);
    state.goals=[]; state.skills=[]; render();
    assert(document.querySelector('.journey-empty'), 'welcoming empty state');
    openJourneyPicker(); document.getElementById('createJourneyGoal').click();
    assert(els.skillModal.open && !els.goalModal.open && !state.goals.length, 'no Skills routes to existing Skill creation');
    els.skillModal.close(); state=populated; render();
    await wait(900);
    assert(document.documentElement.scrollWidth <= innerWidth, 'no horizontal overflow');
    assert(!window.__browserErrors.length, 'no browser errors');
    const result=document.createElement('pre'); result.id='test-result'; result.hidden=true; result.textContent='PASS: Journey navigation, scheduling, picker/creation, nesting, removal/restore, XP/undo/animation, persistence, rollover, sync and responsive layout'; document.body.append(result);
  } catch(error) { const result=document.createElement('pre');result.id='test-result';result.textContent='FAIL: '+error.message+'\n'+error.stack;document.body.append(result); }
})();
