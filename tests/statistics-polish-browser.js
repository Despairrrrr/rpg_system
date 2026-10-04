// Isolated fixture scenarios: STATISTICS_TEST_SCRIPT=statistics-polish-browser.js.
(async () => {
  const $ = id => document.getElementById(id);
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const bars = () => [...document.querySelectorAll('#activityChart .activity-bar')];
  const height = node => node.getBoundingClientRect().height;
  const shape = () => document.querySelector('.radar-value')?.getAttribute('points');
  const collapsed = () => shape()?.split(' ').every(point => point === '220,175');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  try {
    const start = Statistics.weekStart();
    state.statisticsStartedOn = Statistics.shiftDay(start, -14);
    state.lifeAreas = ['Learning', 'Career', 'Health'].map((name, i) => ({ id: `area${i}`, name }));
    state.skills = ['Math', 'Engineering', 'Fitness', 'Reading', 'Writing', 'English'].map((name, i) => ({ id: `skill${i}`, name, xp: 10000, lifeAreaId: i < 3 ? `area${i}` : '' }));
    const records = (week, values) => values.map((xpAwarded, i) => ({ id: `${week}-${i}`, goalId: `g${i}`, skillId: `skill${i}`, xpAwarded, completionDate: Statistics.shiftDay(week, i % 3) }));
    state.completionHistory = [...records(start, [500,300,200,900,100,50]), ...records(Statistics.shiftDay(start,-7), [100,500,400,200])];
    const before = JSON.stringify(state);
    render();
    document.querySelector('[data-section="statistics"]').click();
    assert($('summaryGoals').textContent === '6' && $('summaryXp').textContent === (2050).toLocaleString(), 'summary includes all rewards, including outside top five');
    assert($('weekSummary').children.length === 2 && !/active skills/i.test($('statisticsPage').textContent), 'only two summary metrics');
    assert(!$('skillProgression').querySelector('svg, img, .area-color'), 'no Skill icons');
    assert($('skillProgression').children.length === 5, 'top five limit');
    assert([...document.querySelectorAll('.radar-name')].map(node => node.textContent).join() === 'Learning,Career,Health', 'actual Area labels');
    assert([...$('skillProgression').children].every(row => getComputedStyle(row).opacity === '1'), 'Skill labels never fade');
    if (!reduced) {
      assert(height(bars()[0]) < 2 && collapsed(), 'entry starts at zero');
      await wait(200);
      assert(height(bars()[0]) > 2 && !collapsed(), 'entry progresses');
    } else {
      assert(height(bars()[0]) > 50 && !collapsed(), 'reduced motion immediately renders final values');
      assert(!pageAnimations(), 'no CSS motion when reduced');
    }
    await wait(900);
    const oldShape = shape();
    const oldHeights = bars().map(height);
    const widths = new Map([...$('skillProgression').children].map(row => [row.dataset.skillId, row.querySelector('.progression-bar').getBoundingClientRect().width]));
    $('previousWeek').click();
    assert($('summaryGoals').textContent === '4' && $('summaryXp').textContent === (1200).toLocaleString(), 'summary changes with week');
    if (!reduced) {
      assert(shape() === oldShape && Math.abs(height(bars()[1])-oldHeights[1]) < 2, 'direct old-to-new geometry');
      for (const row of $('skillProgression').children) assert(Math.abs(row.querySelector('.progression-bar').getBoundingClientRect().width-widths.get(row.dataset.skillId)) < 2, 'rank changes match by Skill identity');
      await wait(130);
      const mid = shape(), midHeight = height(bars()[1]);
      $('nextWeek').click();
      assert(shape() === mid && Math.abs(height(bars()[1])-midHeight) < 2, 'rapid reversal retains displayed geometry');
      await wait(850);
      const polygon = document.querySelector('.radar-value');
      statisticsView.render();
      assert(document.querySelector('.radar-value') === polygon, 'unchanged render does not restart charts');
      $('previousWeek').click();
    }
    $('previousWeek').click();
    assert($('activityEmpty').textContent.startsWith('No activity this week.') && $('progressionEmpty').textContent.startsWith('No skill progress this week.'), 'tracked empty states');
    assert(!shape() && $('areaEmpty').textContent.startsWith('No Life Area activity'), 'no zero radar');
    $('previousWeek').click();
    assert($('weekSummary').hidden && !$('summaryUnavailable').hidden && $('statisticsCoverage').textContent.includes('Earlier statistics are unavailable'), 'untracked summary distinct from zeros');
    assert([...document.querySelectorAll('.activity-value')].every(node => node.textContent === '—'), 'untracked days use dashes');
    $('nextWeek').click(); $('nextWeek').click(); $('nextWeek').click();
    assert($('nextWeek').disabled && JSON.stringify(state) === before, 'no future weeks or state mutations');
    const history = state.completionHistory;
    state.completionHistory = records(start,[0,0,0,900]); render();
    assert($('summaryGoals').textContent === '4' && $('summaryXp').textContent === '900' && $('skillProgression').textContent.includes('Reading') && !shape(), 'uncategorized XP is in summary/Skills, not radar');
    state.completionHistory = history;
    const areas = state.lifeAreas;
    state.lifeAreas = areas.slice(0,2); render();
    assert(!shape() && $('areaEmpty').textContent.includes('at least 3 Life Areas'), 'two Areas show setup');
    $('manageLifeAreas').click();
    assert($('lifeAreasModal').open && $('createLifeArea').disabled, 'setup action preserves mandatory Skill selection');
    $('lifeAreasModal').close();
    for (const count of [3,4,6,8,9]) {
      state.lifeAreas = [...areas, ...Array.from({length:count-3},(_,i)=>({id:`extra${i}`,name:'WWWW 健康 lifelong learning '+i}))];
      render();
      assert($('areaBreakdown').children.length === count, 'all user-created Areas are listed');
      assert(Boolean(shape()) === (count <= 8), 'radar count is dynamic with readable list fallback');
      if (count <= 8) {
        const svg = document.querySelector('#areaRadar svg').getBoundingClientRect();
        const boxes = [...document.querySelectorAll('.radar-label')].map(node=>node.getBoundingClientRect());
        assert(boxes.every(box=>box.left>=svg.left && box.right<=svg.right), 'labels stay within radar');
        assert(boxes.every((a,i)=>boxes.slice(i+1).every(b=>a.right<=b.left || b.right<=a.left || a.bottom<=b.top || b.bottom<=a.top)), 'labels never overlap');
      }
    }
    // Finish with a six-Area example for visual inspection, not production defaults.
    state.lifeAreas = [...areas, ...['Finance','Creativity','Relationships'].map((name,i)=>({id:`extra${i}`,name}))];
    for(let i=3;i<6;i++) state.skills[i].lifeAreaId=`extra${i-3}`;
    render(); await wait(950);
    assert(document.documentElement.scrollWidth<=innerWidth, 'no horizontal overflow');
    const result = document.createElement('pre'); result.id='test-result'; result.hidden=true;
    result.textContent=`PASS: ${reduced?'reduced motion':'entry/morph/rapid switches'}, two-metric summary, no Skill icons, empty states, 3/4/6/8/9 Areas, long labels, unchanged data`;
    document.body.append(result);
  } catch(error) {
    const result=document.createElement('pre');result.id='test-result';result.textContent='FAIL: '+error.stack;document.body.append(result);
  }
  function pageAnimations(){return document.querySelector('#statisticsPage .is-animating');}
})();
