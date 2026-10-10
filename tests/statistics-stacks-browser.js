(async () => {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const $ = id => document.getElementById(id);
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const result = document.createElement('pre'); result.id = 'test-result'; result.hidden = true;
  try {
    const start = Statistics.weekStart();
    state.statisticsStartedOn = Statistics.shiftDay(start, -7);
    state.skills = [{id:'s',name:'Skill',xp:9999}]; state.lifeAreas = []; state.goals = [];
    state.completionHistory = ['step','step','quest','arc',undefined].map((goalType,i)=>({id:String(i),goalId:'repeat',skillId:'s',goalType,xpAwarded:i+1,completionDate:start}));
    state.completionHistory.push({id:'next',goalId:'repeat',skillId:'s',goalType:'step',xpAwarded:7,completionDate:Statistics.shiftDay(start,1)});
    document.querySelector('[data-section="statistics"]').click(); render(); await wait(850);
    const days = [...$('activityChart').children];
    const segments = [...days[0].querySelectorAll('.activity-segment')];
    assert(segments.map(s=>s.dataset.count).join() === '2,1,1,1', 'typed stack counts');
    const heights = segments.map(s=>s.getBoundingClientRect().height);
    assert(Math.abs(heights[0]-2*heights[1])<1 && heights.every(h=>h>0), 'stack proportions');
    assert($('summaryGoals').textContent === '6' && $('summaryXp').textContent === '22', 'event and XP summary');
    assert(!$('activityClassification').hidden && $('activityLegend').textContent.includes('Unclassified'), 'unknown events explicit');
    for (const day of days) {
      day.focus();
      const tip = day.querySelector('[role="tooltip"]');
      assert(getComputedStyle(tip).display !== 'none', `keyboard tooltip visible: active=${document.activeElement === day}, matches=${day.matches(':focus')}, connected=${day.isConnected}`);
      const box = tip.getBoundingClientRect();
      assert(box.left >= 0 && box.right <= innerWidth, 'tooltip fits viewport');
    }
    days[0].focus();
    assert(days[0].getAttribute('aria-label').includes('Steps: 2') && days[0].textContent.includes('Total completions: 5'), 'accessible breakdown');
    days[0].dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));
    assert(getComputedStyle(days[0].querySelector('.activity-tooltip')).display === 'none', 'Escape dismisses tooltip');
    $('previousWeek').click(); assert(!$('activityEmpty').hidden && !$('weekSummary').hidden, 'tracked empty week');
    $('previousWeek').click(); assert(!$('summaryUnavailable').hidden && $('activityChart').textContent.includes('Not tracked'), 'untracked history');
    $('nextWeek').click(); $('nextWeek').click(); assert($('nextWeek').disabled && $('summaryGoals').textContent==='6', 'week navigation restores events');
    assert(window.__browserErrors.length===0,'no browser errors');
    result.textContent='PASS: stacked proportions, recurring events, XP, keyboard tooltips, viewport bounds, Escape, empty/untracked weeks, navigation';
  } catch(error) { result.textContent='FAIL: '+error.message+'\n'+error.stack; result.hidden=false; }
  document.body.append(result);
})();
