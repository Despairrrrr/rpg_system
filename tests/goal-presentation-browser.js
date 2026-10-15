// Run on index.html and skill.html via the isolated statistics-browser.py runner.
(async () => {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const finish = text => {
    const result = document.createElement('pre');
    result.id = 'test-result'; result.hidden = true; result.textContent = text;
    document.body.append(result);
  };
  try {
    const day = getDayKey();
    const make = (id, type, extra = {}) => ({ id, type, title: id, skillId: 'math',
      parentGoalId: '', description: '', xp: type === 'step' ? 30 : 200,
      status: 'active', completed: false, createdAt: `${day}T08:00:00`, ...extra });
    state = migrateState({ updatedAt: 20, profile: { name: 'Wayfarer' }, streak: { count: 1, date: day },
      skills: [{ id: 'math', name: 'Learning', xp: 230 }], goals: [
        make('step', 'step', { title: 'Read ten pages' }),
        make('quest', 'quest', { title: 'Prepare a reading plan' }),
        make('arc', 'arc', { title: 'A season of learning' }),
        make('nested-quest', 'quest', { title: 'Explore a new subject', parentGoalId: 'arc' }),
        make('nested-step', 'step', { title: 'Choose a chapter', parentGoalId: 'nested-quest' }),
        make('arc-reference', 'step', { title: 'Review the plan', parentGoalId: 'arc' }),
        make('long', 'step', { title: 'Записать полезные мысли из прочитанной главы и выбрать один шаг на завтра',
          description: 'Keep a thoughtful reflection and a practical next action. ' + 'LongWord'.repeat(18),
          schedule: { type: 'daily', time: '18:30' } }),
        make('done-parent', 'quest', { title: 'Completed research', completed: true, completedDay: day }),
        make('active-child', 'step', { title: 'Follow up on the research', parentGoalId: 'done-parent' }),
        make('done-step', 'step', { title: 'Gather notes', completed: true, completedDay: day }),
      ], journey: { date: day, selectedIds: ['step', 'quest', 'arc-reference'], focusIds: [] } });
    saveState(); render();
    const facts = JSON.stringify(state);
    const root = isSkillPage ? '#goalTree' : '#goalsPage';
    const card = id => document.querySelector(`${root} [data-id="${id}"]`);
    const title = id => card(id).querySelector('.goal-card-title');
    const style = (node, pseudo) => getComputedStyle(node, pseudo);
    const icon = node => style(node, '::before').getPropertyValue('mask-image') ||
      style(node, '::before').getPropertyValue('-webkit-mask-image');
    if (!isSkillPage) {
      // The actual Journey cards are the reference, not duplicated CSS expectations.
      for (const type of ['step', 'quest']) {
        const reference = document.querySelector(`#journeyList [data-id="${type}"]`);
        for (const property of ['backgroundColor', 'borderLeftColor', 'borderLeftWidth',
          'borderTopColor', 'borderTopWidth', 'borderRadius', 'padding']) {
          assert(style(card(type))[property] === style(reference)[property], `${type}: shared ${property}`);
        }
        for (const property of ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'flexBasis']) {
          assert(style(title(type))[property] === style(reference.querySelector('h3'))[property], `${type}: shared ${property}`);
        }
        assert(icon(title(type)) === icon(reference.querySelector('h3')), `${type}: unchanged Journey symbol`);
      }
      const reference = document.querySelector('#journeyList .goal-type-reference[data-goal-type="arc"]');
      assert(reference && icon(reference) === icon(title('arc')), 'Journey parent uses the Arc hexagon');
      document.querySelector('[data-section="goals"]').click();
    }
    await document.fonts.ready;
    await new Promise(resolve => setTimeout(resolve, 250));
    for (const type of ['step', 'quest', 'arc']) {
      const box = card(type).getBoundingClientRect();
      const row = card(type).querySelector('.goal-card-row').getBoundingClientRect();
      assert(style(card(type)).borderLeftWidth === '3px', `${type}: consistent accent width`);
      assert(style(card(type)).borderRadius === '7px', `${type}: compact corner radius`);
      assert(row.height < (innerWidth > 720 ? 100 : 130), `${type}: compact own row`);
      assert(style(card(type).querySelector('.goal-check span')).width === '18px', `${type}: shared checkbox size`);
      assert(icon(title(type)).includes('data:image/svg+xml'), `${type}: SVG symbol`);
      const action = card(type).querySelector('.goal-menu-trigger').getBoundingClientRect();
      assert(action.right <= box.right && action.width >= 24, `${type}: menu fits inside card`);
    }
    assert(new Set(['step', 'quest', 'arc'].map(type => icon(title(type)))).size === 3, 'three distinct type symbols');
    assert(style(card('step')).borderLeftColor === 'rgb(82, 131, 97)', 'Journey green accent');
    assert(style(card('quest')).borderLeftColor === 'rgb(173, 122, 50)', 'Journey amber accent');
    assert(style(card('arc')).borderLeftColor === 'rgb(128, 62, 73)', 'existing burgundy family');
    assert(card('step').querySelector('.goal-card-description').hidden, 'empty description takes no space');
    assert(card('long').querySelector('.goal-repeat-badge').textContent.includes('18:30'), 'schedule preserved');
    assert(style(title('done-step')).textDecorationLine.includes('line-through'), 'completed title stays distinct');
    assert(style(card('done-step').querySelector('.goal-check span')).backgroundColor === 'rgb(64, 110, 76)', 'checked fill stays readable in both themes');
    assert(style(title('active-child')).textDecorationLine === 'none', 'completed parent does not strike active child');
    assert(style(title('active-child')).color === style(title('step')).color, 'active child retains readable text');
    assert(style(card('active-child')).opacity === '1', 'active child is not dimmed');
    if (isSkillPage) {
      assert(card('nested-step').closest('.goal-tree-list').parentElement === card('nested-quest'), 'nested Step hierarchy');
      assert(card('nested-quest').closest('.goal-tree-list').parentElement === card('arc'), 'nested Quest hierarchy');
      const probe = document.createElement('canvas').getContext('2d');
      // Canvas normalizes color-mix() to RGBA for a luminance sanity check.
      probe.fillStyle = style(card('step')).backgroundColor;
      probe.fillRect(0, 0, 1, 1);
      const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
      assert(Math.max(r, g, b) < 100, 'Skill cards retain dark surfaces');
      assert(style(card('arc'), '::before').content === 'none', 'no oversized Arc inset frame');
    } else {
      assert(document.querySelectorAll('#goalsPage .goal-column').length === 3, 'three-column structure preserved');
      const reference = card('nested-quest').querySelector('.goal-type-reference');
      assert(reference.dataset.goalType === 'arc' && icon(reference) === icon(title('arc')), 'parent metadata uses parent type');
    }
    for (const node of document.querySelectorAll(`${root} .goal-card-title, ${root} .goal-card-description:not([hidden])`)) {
      assert(node.scrollWidth <= node.clientWidth + 1, 'long content wraps without clipping');
    }
    assert(document.documentElement.scrollWidth <= innerWidth, 'no horizontal overflow');
    assert(JSON.stringify(state) === facts, 'presentation does not mutate Goal data');
    // The relocated controls must still use the original handlers.
    const menu = card('step').querySelector('.goal-menu-trigger');
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    assert(menu.getAttribute('aria-expanded') === 'true', 'menu opens via keyboard');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert(document.activeElement === menu, 'menu restores focus');
    const xp = state.skills[0].xp;
    card('step').querySelector('input').click();
    assert(state.goals.find(goal => goal.id === 'step').completed && state.skills[0].xp === xp + 30, 'completion rewards preserved');
    card('step').querySelector('input').click();
    assert(!state.goals.find(goal => goal.id === 'step').completed && state.skills[0].xp === xp, 'undo rewards preserved');
    await new Promise(resolve => setTimeout(resolve, 1600));
    document.activeElement?.blur(); window.scrollTo(0, 0);
    finish(`PASS: shared Goal presentation (${isSkillPage ? 'dark Skill tree' : 'Journey/Goals'}), type icons/colours, density, nesting, wrapping, schedule, keyboard menus, completion and undo`);
  } catch (error) { finish('FAIL: ' + error.message + '\n' + error.stack); }
})();
