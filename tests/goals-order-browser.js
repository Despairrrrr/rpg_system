// Use STATISTICS_TEST_SCRIPT=goals-order-browser.js with the isolated browser runner.
(() => {
  const assert=(ok,message)=>{if(!ok)throw new Error(message);};
  const ids=type=>[...document.querySelectorAll(`[data-list="${type}"] .goal-card`)].map(card=>card.dataset.id);
  const count=type=>document.querySelector(`[data-count="${type}"]`).textContent.trim();
  const card=id=>document.querySelector(`.goal-card[data-id="${id}"]`);
  try {
    const today=(()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;})();
    state.skills=[{id:'s',name:'Math',goal:'',xp:100}];
    state.goals=[
      {id:'s1',type:'step',title:'Step open one',skillId:'s',xp:10,completed:false},
      {id:'s2',type:'step',title:'Step done',skillId:'s',xp:10,completed:true,completedDay:today},
      {id:'s3',type:'step',title:'Step repeat done',skillId:'s',xp:10,completed:true,completedDay:today,repeatsDaily:true},
      {id:'s4',type:'step',title:'Step open two',skillId:'s',xp:10,completed:false},
      {id:'s5',type:'step',title:'Step weekly done',skillId:'s',xp:10,completed:true,completedDay:today,schedule:{type:'weekly',daysOfWeek:[1]}},
      {id:'s6',type:'step',title:'Step repeat open',skillId:'s',xp:10,completed:false,repeatsDaily:true},
      {id:'q1',type:'quest',title:'Quest open',skillId:'s',xp:10,completed:false},
      {id:'a1',type:'arc',title:'Arc done',skillId:'s',xp:10,completed:true,completedDay:today},
      {id:'a2',type:'arc',title:'Arc open',skillId:'s',xp:10,completed:false},
    ];
    render();

    assert(JSON.stringify(ids('step'))===JSON.stringify(['s1','s4','s6','s2','s3','s5']),'incomplete Steps keep order above completed, stored order untouched');
    assert(JSON.stringify(ids('arc'))===JSON.stringify(['a2','a1']),'incomplete Arcs rise above completed Arcs');
    assert(count('step')==='5 goals','STEPS counter excludes two completed non-repeating Goals but keeps the completed repeating ones');
    assert(count('quest')==='1 goal','QUESTS counter is the open total');
    assert(count('arc')==='1 goal','ARCS counter excludes its completed non-repeating Goal');

    toggleGoalCompletion('s1',true,card('s1'));
    assert(count('step')==='4 goals','completing a non-repeating Step decrements STEPS');
    assert(JSON.stringify(ids('step'))===JSON.stringify(['s4','s6','s1','s2','s3','s5']),'newly completed Step sinks below open Steps');

    toggleGoalCompletion('s6',true,card('s6'));
    assert(count('step')==='4 goals','completing a repeating Step leaves STEPS unchanged');
    assert(JSON.stringify(ids('step'))===JSON.stringify(['s4','s1','s2','s3','s5','s6']),'completed repeating Step sinks too');

    toggleGoalCompletion('s6',false,card('s6'));
    assert(count('step')==='4 goals','undoing a repeating Step leaves STEPS unchanged');

    toggleGoalCompletion('s1',false,card('s1'));
    assert(count('step')==='5 goals','undoing a non-repeating Step restores STEPS');
    assert(JSON.stringify(ids('step'))===JSON.stringify(['s1','s4','s6','s2','s3','s5']),'undone Step returns to its original position');

    const result=document.createElement('pre');result.id='test-result';result.hidden=true;result.textContent='PASS: completed Goals sort to the bottom and non-repeating completion decrements the column counter with correct undo';document.body.append(result);
  }catch(error){const result=document.createElement('pre');result.id='test-result';result.textContent='FAIL: '+error.stack;document.body.append(result);}
})();
