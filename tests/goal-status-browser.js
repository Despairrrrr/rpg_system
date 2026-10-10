(async () => {
  const assert=(ok,message)=>{if(!ok)throw new Error(message);};
  const wait=()=>new Promise(resolve=>setTimeout(resolve,150));
  const get=id=>state.goals.find(g=>g.id===id);
  const root=()=>isSkillPage?'.goal-tree':'#goalsPage';
  const trigger=id=>document.querySelector(`${root()} [data-id="${id}"] .goal-menu-trigger`);
  const actions=()=>[...document.querySelectorAll('.goal-menu-item')].filter(item=>!item.hidden);
  const card=id=>document.querySelector(`#journeyList [data-id="${id}"]`);
  const choose=(id,label)=>{trigger(id).click();const item=actions().find(item=>item.textContent===label);assert(item,`missing ${label}`);item.click();};
  try {
    const today=getDayKey();
    const make=(id,type,parentGoalId='',extra={})=>({id,type,title:id,skillId:'math',parentGoalId,description:'',xp:10,completed:false,createdAt:'2026-01-01T00:00:00',...extra});
    const scheduled={schedule:{type:'daily',time:'00:00'},reminder:{enabled:true,offset:'0m'}};
    state=migrateState({updatedAt:12,profile:{name:'Test'},streak:{count:2,date:today},skills:[{id:'math',name:'Math',xp:50}],goals:[
      make('arc','arc'),make('quest','quest','arc',scheduled),make('child','step','quest',scheduled),
      make('own','step','quest',{...scheduled,status:'paused'}),make('daily','step','',scheduled),make('once','step')
    ]});
    saveState();render();
    if(!isSkillPage)document.querySelector('[data-section="goals"]').click();
    const facts=()=>JSON.stringify([state.skills,state.streak,state.completionHistory,state.goals.map(g=>[g.id,g.completed,g.completedDay,g.activeCompletionId,g.schedule,g.reminder])]);
    const before=facts();const timestamp=state.updatedAt;
    choose('arc','Pause goal');
    assert(get('arc').status==='paused' && get('quest').status==='active' && get('child').status==='active','own statuses preserved');
    assert(facts()===before && state.updatedAt>timestamp,'status ordinary save preserves rewards/completion/schedules');
    assert(!GoalSchedule.pending(state).some(e=>['quest','child','own'].includes(e.goal.id)),'inherited reminder suppression');
    trigger('quest').click();
    assert(actions().map(item=>item.textContent).join()==='Edit,Delete,Pause goal','inherited active child keeps Pause action');
    assert(trigger('quest').title.includes('ancestor'),'inherited pause accessible description');
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    assert(document.activeElement===trigger('quest'),'Escape returns focus');
    choose('arc','Resume goal');
    assert(get('own').status==='paused' && get('child').status==='active','resume keeps independent pauses');
    assert(!GoalSchedule.pending(state).some(e=>['quest','child'].includes(e.goal.id)),'no missed reminder backlog');
    assert(get('child').remindersResumeAt && facts()===before,'resume cutoff without reward mutation');
    // Browser notifications already visible must close when a Goal is paused.
    Notification.permission='granted';reminderSystem.refresh();await wait();
    const notification=window.__notifications.find(item=>item.title==='daily');
    assert(notification,'active reminder delivered: '+JSON.stringify({pending:GoalSchedule.pending(state).map(e=>e.goal.id),sent:window.__notifications.map(n=>n.title),permission:browserReminders.permission()}));
    choose('daily','Pause goal');await wait();
    assert(notification.closed && !GoalSchedule.pending(state).some(e=>e.goal.id==='daily'),'pause closes browser and in-app reminders');
    const deliveries=window.__notifications.length;
    choose('daily','Resume goal');await wait();
    assert(window.__notifications.length===deliveries,'resume does not deliver backlog');
    choose('once','Pause goal');
    const xp=state.skills[0].xp;
    document.querySelector(`${root()} [data-id="once"] input`).click();
    assert(get('once').completed && get('once').status==='paused' && state.skills[0].xp===xp+10,'paused Goal can complete');
    const completed=get('once').activeCompletionId;
    choose('once','Resume goal');choose('once','Pause goal');
    assert(get('once').activeCompletionId===completed && get('once').completed,'status preserves completed state and linkage');
    document.querySelector(`${root()} [data-id="once"] input`).click();
    assert(!get('once').completed && state.skills[0].xp===xp && !state.completionHistory.length,'paused undo works');
    // Persist/reload and receive a newer edit from another tab.
    state=migrateState(JSON.parse(localStorage.getItem(STORAGE_KEY)));render();
    assert(get('once').status==='paused','status survives reload migration');
    const remote=structuredClone(state);remote.updatedAt=state.updatedAt+100;remote.goals.find(g=>g.id==='arc').status='paused';
    localStorage.setItem(STORAGE_KEY,JSON.stringify(remote));
    window.dispatchEvent(new StorageEvent('storage',{key:STORAGE_KEY,newValue:JSON.stringify(remote)}));
    assert(get('arc').status==='paused' && !GoalSchedule.isEffectivelyActive(get('child'),state.goals),'storage event refreshes inherited status');
    // Reparenting and deletion resume effectively active descendants with no backlog.
    assert(updateGoal('quest',{parentGoalId:''}),'reparent saved');
    assert(GoalSchedule.isEffectivelyActive(get('child'),state.goals) && !GoalSchedule.pending(state).some(e=>e.goal.id==='child'),'reparent cutoff');
    updateGoal('quest',{parentGoalId:'arc'});window.confirm=()=>true;deleteGoal('arc');
    assert(!get('arc') && get('quest').parentGoalId==='' && !GoalSchedule.pending(state).some(e=>e.goal.id==='child'),'delete paused parent preserves schedule without backlog');
    // Failed writes cannot leave a locally paused Goal or changed cutoff.
    const snapshot=JSON.stringify(state);const original=Storage.prototype.setItem;
    Storage.prototype.setItem=()=>{throw new Error('QuotaExceededError');};
    try {
      assert(!setGoalStatus('quest','paused'),'save failure');
      assert(JSON.stringify(state)===snapshot,'pause rollback');
      assert(!setGoalStatus('once','active'),'resume save failure');
      assert(JSON.stringify(state)===snapshot,'resume cutoff and status roll back together');
    }
    finally {Storage.prototype.setItem=original;}saveState();
    // Shared two-item menus retain keyboard wrap and never expose Goal status.
    const skill=document.querySelector('.skill-menu-trigger');
    skill.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}));
    assert(actions().map(item=>item.textContent).join()==='Edit,Delete' && document.activeElement.textContent==='Delete','Skill menu stays two items');
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
    assert(document.activeElement.textContent==='Edit','keyboard wraps past hidden status action');
    document.getElementById('profileAvatar').click();
    assert(actions().map(item=>item.textContent).join()==='Load a photo,Delete photo','photo menu unaffected');
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}));
    assert(document.activeElement.textContent==='Load a photo','disabled photo deletion skipped');
    closeGoalMenu();
    if(!isSkillPage){
      document.querySelector('[data-section="journey"]').click();
      assert(card('quest') && !document.querySelector('#journeyList [data-goal-id="own"]'),'own paused child excluded from nested automatic presentation');
      setGoalStatus('quest','paused');
      assert(!card('quest') && !card('child'),'paused parent removes automatic descendants');
      openJourneyPicker();document.getElementById('journeySearch').value='quest';renderJourneyChoices();document.querySelector('.journey-choice').click();
      assert(card('quest') && get('quest').status==='paused','picker selects paused Quest without resuming');
      openJourneyPicker();document.getElementById('journeySearch').value='child';renderJourneyChoices();
      assert(!document.querySelector('.journey-choice').disabled,'inherited paused child still selectable');
      document.querySelector('.journey-choice').click();
      assert(!card('child'),'nested manual child not duplicated');
      card('quest').querySelector('[data-journey-expand]').click();
      document.querySelector('#journeyList [data-goal-id="child"] input').click();
      assert(get('child').completed && get('child').status==='active' && get('quest').status==='paused','manual inherited-paused completion');
      card('quest').querySelector('.journey-remove').click();
      assert(!card('quest') && card('child') && get('quest').status==='paused','× independent of own pause');
      setGoalStatus('quest','active');assert(!card('quest'),'resume respects today removal');
      changeJourneySelection('quest',true);setGoalStatus('quest','paused');
      assert(card('quest'),'explicit selection survives pause');
    }
    openGoalModal(null,'step','math');els.goalTitle.value='New active';els.goalForm.dispatchEvent(new Event('submit',{cancelable:true}));
    assert(state.goals.find(g=>g.title==='New active').status==='active','new Goal defaults active');
    assert(document.documentElement.scrollWidth<=innerWidth,'no layout overflow');
    const result=document.createElement('pre');result.id='test-result';result.hidden=true;result.textContent=`PASS: goal status on ${isSkillPage?'Skill':'dashboard'}: menus/keyboard, inheritance, reminders/browser notifications, manual completion, persistence/sync, hierarchy edits, rollback and Today`;document.body.append(result);
  }catch(error){const result=document.createElement('pre');result.id='test-result';result.textContent='FAIL: '+error.message+'\n'+error.stack;document.body.append(result);}
})();
