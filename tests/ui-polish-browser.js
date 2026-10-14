// Run with the isolated statistics-browser.py runner; no Firebase or real user data.
(async () => {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const $ = id => document.getElementById(id);
  const nav = name => document.querySelector(`[data-section="${name}"]`).click();
  const color = () => getComputedStyle(document.body).backgroundColor;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  try {
    state.goals = [{id:'polish',type:'step',title:'Read a chapter',skillId:'math',xp:30,completed:false,schedule:{type:'daily'},description:'Keep a few notes.'}];
    render();
    await document.fonts.ready;
    const before = JSON.stringify(state);
    const stored = localStorage.getItem(STORAGE_KEY);
    const forecast = $('forecastEndTime');
    forecast.value = '20:17';
    const header = () => {
      const r = document.querySelector('.topbar').getBoundingClientRect();
      return [r.x,r.y,r.width,r.height].join();
    };
    const originalHeader = header();
    const assertView = section => {
      assert($('statisticsPage').hidden === (section !== 'statistics'), 'Statistics visibility is immediate');
      assert($('journeyPage').hidden === (section !== 'journey'), 'Journey visibility is immediate');
      assert($('goalsPage').hidden === (section !== 'goals'), 'Goals visibility is immediate');
      assert(document.querySelector('.nav-item.active').dataset.section === section, 'selection matches latest click');
      assert(header() === originalHeader, 'header geometry is stable across views');
      assert(document.documentElement.scrollWidth <= innerWidth, 'no horizontal overflow');
    };
    assert(getComputedStyle($('journeyHeading')).fontFamily.includes('MedievalSharp'), 'display typography retained');
    assert(!getComputedStyle(document.querySelector('.journey-content h3')).fontFamily.includes('MedievalSharp'), 'goal titles use UI font');
    assert(!getComputedStyle(document.querySelector('.skill-name')).fontFamily.includes('MedievalSharp'), 'Skill names use UI font');
    nav('goals'); assertView('goals');
    assert(!reduced || !document.querySelector('.view-entering'), 'reduced motion bypasses fades');
    await wait(260);
    const light = color();
    nav('statistics'); assertView('statistics');
    const incoming = $('statisticsPage');
    assert(parseFloat(getComputedStyle(incoming).opacity) >= .39, 'incoming content never starts blank');
    await wait(80);
    const middle = color();
    await wait(200);
    const dark = color();
    assert(light !== dark, 'light and dark identities remain distinct');
    assert(reduced ? middle === dark : middle !== light && middle !== dark, 'background transition follows motion preference');
    $('previousWeek').click();
    const week = $('selectedWeek').textContent;
    nav('journey'); assertView('journey');
    for (const name of ['goals','statistics','journey','statistics','goals','journey']) {
      nav(name); assertView(name);
      assert(document.querySelectorAll('.view-entering').length <= 1, 'no stacked stale fades');
    }
    await wait(300);
    assert(getComputedStyle($('journeyPage')).opacity === '1', 'latest view settles fully visible');
    assert(!document.getAnimations().some(a => a.animationName === 'view-enter'), 'view fade finishes');
    assert(color() === light, 'rapid reversal settles on the correct background');
    assert(forecast === $('forecastEndTime') && forecast.value === '20:17', 'view changes preserve input node and draft');
    nav('statistics'); assert($('selectedWeek').textContent === week, 'selected statistics week persists');
    nav('journey'); await wait(260);
    assert(JSON.stringify(state) === before && localStorage.getItem(STORAGE_KEY) === stored, 'transitions never mutate data or persistence');
    document.querySelector('.journey-row .goal-check input').click();
    assert(state.goals[0].completed, 'completion remains usable after rapid switching');
    document.querySelector('.journey-row .goal-check input').click();
    assert(!state.goals[0].completed, 'undo remains usable');
    $('openSkillModalBtn').click();
    assert($('skillModal').open, 'sidebar control still opens form');
    $('skillModal').close();
    assert(!__browserErrors.length, 'no browser errors');
    const result=document.createElement('pre');result.id='test-result';result.hidden=true;
    result.textContent=`PASS: ${reduced?'reduced motion':'220ms fade and interpolated background'}, immediate/rapid navigation, stable header, retained week/draft/data, completion/undo, sidebar form and responsive typography`;
    document.body.append(result);
  } catch (error) {
    const result=document.createElement('pre');result.id='test-result';result.textContent='FAIL: '+error.stack;document.body.append(result);
  }
})();
