// Visual fixture and layout checks; run via statistics-browser.py (isolated storage).
(async () => {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const card = id => document.querySelector(`#journeyList [data-id="${id}"]`);
  const disclosure = key => document.querySelector(`[aria-controls="journey-section-${key}"]`);
  const finish = text => {
    const result = document.createElement('pre'); result.id = 'test-result'; result.hidden = true;
    result.textContent = text; document.body.append(result);
  };
  try {
    const day = GoalSchedule.dayKey(new Date());
    const goal = (id, title, type, extra = {}) => ({id,title,type,skillId:'math',xp:type==='quest'?200:30,parentGoalId:'',status:'active',description:'',createdAt:`${day}T08:00:00`,...extra});
    state = migrateState({updatedAt:41,profile:{name:'Wayfarer'},skills:[{id:'math',name:'Learning',xp:230}],streak:{count:1,date:day},goals:[
      goal('focus-step','Read ten pages','step',{schedule:{type:'daily',time:'09:00'}}),
      goal('focus-quest','Build a reading practice','quest',{schedule:{type:'daily',time:'10:00'}}),
      goal('child','Choose a chapter / Выбрать главу','step',{parentGoalId:'focus-quest'}),
      goal('child-done','Gather the reading notes','step',{parentGoalId:'focus-quest',completed:true,completedDay:day}),
      goal('other-step','Practice vocabulary','step',{schedule:{type:'daily',time:'18:00'}}),
      goal('other-quest','Prepare the next chapter','quest',{schedule:{type:'daily',time:'19:00'}}),
      goal('long','Записать полезные мысли из прочитанной главы и выбрать один шаг на завтра','step',{description:'Keep a short reflection, with one practical idea to try tomorrow.',parentGoalId:'arc'}),
      goal('arc','A season of learning','arc'),
      goal('done-step','Review yesterday’s notes','step',{completed:true,completedDay:day}),
      goal('done-quest','Finish the introduction','quest',{completed:true,completedDay:day}),
      goal('unfinished-child','Write a follow-up note','step',{parentGoalId:'done-quest'}),
    ],journey:{date:day,selectedIds:['long','done-step','done-quest'],focusIds:['focus-step','focus-quest']}});
    saveState(); render();
    document.getElementById('journeyForecast').open = false;
    expandedJourneyQuests.add('focus-quest');expandedJourneyQuests.add('done-quest');
    collapsedJourneySections.completed = false;renderJourney();
    await document.fonts.ready;
    const snapshot = JSON.stringify(state), stored = localStorage.getItem(STORAGE_KEY);
    assert(card('focus-step').closest('[data-journey-section]').dataset.journeySection==='focus','Focus Step fixture');
    assert(card('other-quest').closest('[data-journey-section]').dataset.journeySection==='other','Other Quest fixture');
    assert(card('done-step').closest('[data-journey-section]').dataset.journeySection==='completed','Completed Step fixture');
    assert(document.querySelectorAll('[data-goal-id="child"]').length===1 && !card('child'),'nested Step appears once');
    for (const key of ['focus','other','completed']) {
      const button = disclosure(key);button.focus();button.click();
      assert(button.getAttribute('aria-expanded')==='false' && document.getElementById(button.getAttribute('aria-controls')).hidden,'section collapses');
      button.click(); assert(button.getAttribute('aria-expanded')==='true','section expands');
    }
    document.querySelector('[data-journey-sort="manual"]').click();
    assert(card('focus-step').querySelector('[data-journey-move="-1"]').disabled,'section boundary button remains disabled');
    const disabled = card('focus-step').querySelector('[data-journey-move="-1"]');
    assert(getComputedStyle(disabled).opacity < 1,'disabled reorder visibly distinct');
    const menu = card('focus-step').querySelector('.goal-menu-trigger');
    menu.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
    assert(menu.getAttribute('aria-expanded')==='true','existing menu opens by keyboard');
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    assert(document.activeElement===menu,'menu returns focus');
    document.querySelector('[data-journey-sort="time"]').click();
    // Sorting is persisted by the existing app; compare facts rather than its edit timestamp.
    const beforeFacts = JSON.parse(snapshot), afterFacts = structuredClone(state);
    delete beforeFacts.updatedAt;delete afterFacts.updatedAt;
    assert(JSON.stringify(beforeFacts)===JSON.stringify(afterFacts),'presentation checks preserve all data and final order mode');
    for (const id of ['focus-step','focus-quest','other-step','other-quest','done-step','done-quest']) {
      const root=card(id), row=root.querySelector('.journey-row'), title=row.querySelector('h3');
      const bounds=root.getBoundingClientRect(), controls=[...row.querySelectorAll('button')];
      assert(bounds.width<=document.getElementById('journeyList').getBoundingClientRect().width,'card stays within list width');
      assert(title.scrollWidth<=title.clientWidth+1,'title is not horizontally clipped');
      for(const button of controls) {
        const b=button.getBoundingClientRect();
        assert(b.left>=bounds.left && b.right<=bounds.right && b.width>=24,'actions remain inside card with compact hit targets');
      }
      assert(getComputedStyle(root).opacity==='1','completed and active cards stay readable without whole-card opacity');
    }
    const child=document.querySelector('[data-goal-id="unfinished-child"]');
    assert(getComputedStyle(child).opacity==='1' && !child.classList.contains('is-completed'),'completed Quest does not dim unfinished child');
    const metrics={};
    for(const id of ['focus-step','other-step','other-quest','done-step','long']) metrics[id]=Math.round(card(id).getBoundingClientRect().height);
    assert(metrics['focus-step']<=(innerWidth>720?70:120) && metrics['other-quest']<=(innerWidth>720?90:150),'simple cards remain compact');
    assert(document.documentElement.scrollWidth<=innerWidth,'no page overflow');
    // Expose visual-only computed values to the capture log for before/after comparison.
    metrics.width=Math.round(card('focus-step').getBoundingClientRect().width);
    metrics.heading=Math.round(disclosure('focus').getBoundingClientRect().height);
    if(matchMedia('(prefers-reduced-motion: reduce)').matches) assert(getComputedStyle(disclosure('focus')).transitionDuration==='0s','disclosures have no reduced-motion animation');
    assert(!window.__browserErrors.length,'no browser errors');
    document.activeElement?.blur();window.scrollTo(0,0);await wait(300);
    finish('PASS: Journey visual scenarios, compact dimensions, nested/long/description content, controls, keyboard, disabled states, data integrity and responsive layout; metrics '+JSON.stringify(metrics));
  } catch(error) { finish('FAIL: '+error.stack); }
})();
