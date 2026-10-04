// Use STATISTICS_TEST_SCRIPT=goals-ui-browser.js with the isolated browser runner.
(() => {
  const assert=(ok,message)=>{if(!ok)throw new Error(message);};
  try {
    state.skills = [{id:'s',name:'Research and lifelong learning with a long skill name',goal:'',xp:125},{id:'unused',name:'Fitness',goal:'',xp:30}];
    state.goals = [
      {id:'arc',type:'arc',title:'Find a graduate programme and prepare the complete application',skillId:'s',parentGoalId:'',xp:1000,description:'Build a long-term direction.',completed:false},
      {id:'quest',type:'quest',title:'Compare universities',skillId:'s',parentGoalId:'arc',xp:200,description:'Choose three suitable programmes.',completed:false},
      {id:'step',type:'step',title:'Read admission requirements',skillId:'s',parentGoalId:'quest',xp:30,description:'',completed:false},
      {id:'done',type:'step',title:'Collect the initial list',skillId:'s',parentGoalId:'quest',xp:10,description:'Finished yesterday.',completed:true},
    ];
    render();
    const before=JSON.stringify(state);
    const card=document.querySelector('.goal-card[data-id="step"]');
    assert(card.querySelector('.goal-description').hidden,'empty description adds no height');
    assert(card.querySelector('.goal-metadata').textContent.includes('Compare universities'),'compact metadata preserves parent');
    assert(card.querySelector('.goal-metadata').textContent.includes('Research'),'compact metadata preserves Skill');
    const row=document.querySelector('.skill-row[data-id="s"]');
    assert(!row.querySelector('.edit-skill,.delete-skill'),'no permanent Skill buttons');
    const trigger=row.querySelector('.skill-menu-trigger');
    trigger.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
    assert(trigger.getAttribute('aria-expanded')==='true','Skill menu opens with keyboard');
    document.querySelectorAll('.goal-menu-item')[0].click();
    assert(document.getElementById('skillModal').open && document.getElementById('skillId').value==='s','menu edits correct Skill');
    document.getElementById('skillModal').close();
    const goalTrigger=card.querySelector('.goal-menu-trigger');
    trigger.click(); goalTrigger.click();
    assert(trigger.getAttribute('aria-expanded')==='false','opening Goal menu closes Skill trigger');
    document.querySelectorAll('.goal-menu-item')[0].click();
    assert(document.getElementById('goalModal').open && document.getElementById('goalId').value==='step','Goal menu still edits correct Goal');
    document.getElementById('goalModal').close();
    let requested=false;window.confirm=()=>{requested=true;return false;};
    const unused=document.querySelector('.skill-row[data-id="unused"] .skill-menu-trigger');unused.click();
    document.querySelectorAll('.goal-menu-item')[1].click();assert(requested,'Skill delete retains confirmation');
    unused.click();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    assert(document.activeElement===unused,'Escape restores keyboard focus');
    const steps=getComputedStyle(card.querySelector('h3'));
    const arcs=getComputedStyle(document.querySelector('.goal-card[data-id="arc"] h3'));
    assert(parseFloat(arcs.fontSize)>parseFloat(steps.fontSize),'Arc is subtly larger than Step');
    assert(getComputedStyle(document.querySelector('.goal-card.completed')).boxShadow==='none','completed card does not glow');
    assert(JSON.stringify(state)===before,'UI actions do not mutate progress');
    assert(document.documentElement.scrollWidth<=innerWidth,'no horizontal overflow');
    const result=document.createElement('pre');result.id='test-result';result.hidden=true;result.textContent='PASS: Goal hierarchy, metadata, Skill menus, keyboard focus, delete confirmation, no data changes or overflow';document.body.append(result);
  }catch(error){const result=document.createElement('pre');result.id='test-result';result.textContent='FAIL: '+error.stack;document.body.append(result);}
})();
