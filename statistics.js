function createStatisticsView({ getState, save }) {
  const page = document.querySelector('#statisticsPage');
  if (!page) return null;
  const $ = id => document.getElementById(id);
  let selectedWeek = Statistics.weekStart();
  let currentWeek = selectedWeek;
  let wasVisible = false;
  let lastData = '';
  let radarFrame = 0;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const number = value => value.toLocaleString();
  const percent = value => `${Number(value.toFixed(1))}%`;
  const shortDate = day => Statistics.parseDay(day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const fullDate = day => Statistics.parseDay(day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function svgNode(tag, attributes) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    return node;
  }
  // Stable identity-based accents, using only the existing neon theme tokens.
  function areaColor(id) {
    const colors = ['var(--blue)', 'var(--green)', 'var(--goal-quest)', 'var(--goal-step)', 'var(--orange)', 'var(--yellow)'];
    let hash = 0;
    for (const char of id) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
    return colors[hash % colors.length];
  }
  function sampleBar(node, dimension) {
    const track = node.parentElement.getBoundingClientRect()[dimension];
    return track ? node.getBoundingClientRect()[dimension] / track * 100 : 0;
  }
  const activityTypes = [['step', 'Steps'], ['quest', 'Quests'], ['arc', 'Arcs'], ['unclassified', 'Unclassified']];
  function geometry() {
    const polygon = $('areaRadar').querySelector('.radar-value');
    return {
      bars: [...$('activityChart').querySelectorAll('.activity-bar')].map(node => sampleBar(node, 'height')),
      segments: [...$('activityChart').querySelectorAll('.activity-bar')].map(bar => [...bar.children].map(node => sampleBar(node, 'height'))),
      skills: new Map([...$('skillProgression').children].map(row => [row.dataset.skillId, sampleBar(row.querySelector('.progression-bar'), 'width')])),
      areas: new Map([...$('areaBreakdown').children].map(row => [row.dataset.areaId, sampleBar(row.querySelector('.progression-bar'), 'width')])),
      radar: polygon ? { ids: polygon.dataset.ids, points: polygon.getAttribute('points').split(' ').map(pair => pair.split(',').map(Number)) } : null,
    };
  }
  function playBars(changes, entering) {
    const animate = !page.hidden && !motion.matches;
    for (const change of changes) {
      change.node.style[change.property] = `${animate ? change.from : change.to}%`;
      if (animate && Math.abs(change.from - change.to) > 0.05) {
        change.node.classList.add('is-animating');
        change.node.style.transitionDelay = `${entering ? change.index * 35 : 0}ms`;
      }
    }
    if (animate) void page.offsetWidth;
    for (const change of changes) change.node.style[change.property] = `${change.to}%`;
  }
  function drawRadar(areas, previous) {
    const ids = JSON.stringify(areas.map(area => area.id));
    const svg = svgNode('svg', { viewBox: '0 0 440 350', role: 'img', 'aria-label': 'Share of weekly focus. Axes run from 0 to 100 percent; full names and values are listed alongside.' });
    const point = (i, fraction) => {
      const angle = i / areas.length * Math.PI * 2 - Math.PI / 2;
      return [220 + Math.cos(angle) * 108 * fraction, 175 + Math.sin(angle) * 108 * fraction];
    };
    for (const fraction of [.25, .5, .75, 1]) {
      svg.append(svgNode('polygon', { points: areas.map((_, i) => point(i, fraction).join(',')).join(' '), class: 'radar-grid' }));
    }
    areas.forEach((area, i) => {
      const [x, y] = point(i, 1);
      svg.append(svgNode('line', { x1: 220, y1: 175, x2: x, y2: y, class: 'radar-grid' }));
      const [lx, ly] = point(i, 1.25);
      const centered = Math.abs(lx - 220) < 1;
      const label = svgNode('text', { x: lx, y: ly - 5, 'text-anchor': centered ? 'middle' : lx > 220 ? 'start' : 'end', class: 'radar-label', 'aria-label': `${area.name}: ${percent(area.percentage)}` });
      label.dataset.maxWidth = centered ? 310 : Math.min(lx, 440 - lx) - 8;
      const name = svgNode('tspan', { x: lx, class: 'radar-name' });
      name.textContent = area.name;
      const value = svgNode('tspan', { x: lx, dy: 17, class: 'radar-percentage' });
      value.textContent = percent(area.percentage);
      const title = svgNode('title', {});
      title.textContent = area.name;
      label.append(name, value, title);
      svg.append(label);
    });
    const target = areas.map((area, i) => point(i, area.percentage / 100));
    const from = previous?.ids === ids ? previous.points : areas.map((_, i) => point(i, 0));
    const polygon = svgNode('polygon', { class: 'radar-value' });
    polygon.dataset.ids = ids;
    const dots = areas.map(area => {
      const dot = svgNode('circle', { r: 3.2, class: 'radar-dot' });
      dot.style.fill = areaColor(area.id);
      return dot;
    });
    svg.append(polygon, ...dots);
    $('areaRadar').append(svg);
    for (const label of svg.querySelectorAll('.radar-label')) {
      const name = label.querySelector('.radar-name');
      let chars = Array.from(name.textContent);
      const maxWidth = Number(label.dataset.maxWidth);
      const approximateLimit = Math.floor(maxWidth / 7);
      if (chars.length > approximateLimit) name.textContent = chars.slice(0, approximateLimit - 1).join('') + '…';
      chars = Array.from(name.textContent);
      while (name.getComputedTextLength() > maxWidth && chars.length > 2) {
        chars = chars.slice(0, -2).concat('…');
        name.textContent = chars.join('');
      }
    }
    const write = coordinates => {
      polygon.setAttribute('points', coordinates.map(pair => pair.join(',')).join(' '));
      dots.forEach((dot, i) => { dot.setAttribute('cx', coordinates[i][0]); dot.setAttribute('cy', coordinates[i][1]); });
    };
    if (page.hidden || motion.matches) { write(target); return; }
    write(from);
    if (JSON.stringify(from) === JSON.stringify(target)) return;
    const duration = parseFloat(getComputedStyle(page).getPropertyValue('--motion-stats-radar')) || 580;
    const started = performance.now();
    const step = now => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - (1 - progress) ** 3;
      write(target.map(([x, y], i) => [from[i][0] + (x - from[i][0]) * eased, from[i][1] + (y - from[i][1]) * eased]));
      radarFrame = progress < 1 ? requestAnimationFrame(step) : 0;
    };
    radarFrame = requestAnimationFrame(step);
  }
  function render() {
    const state = getState();
    const nextCurrent = Statistics.weekStart();
    if (selectedWeek === currentWeek || selectedWeek > nextCurrent) selectedWeek = nextCurrent;
    currentWeek = nextCurrent;
    const end = Statistics.shiftDay(selectedWeek, 6);
    const stats = Statistics.weekly(state, selectedWeek);
    const visible = !page.hidden;
    const signature = JSON.stringify([selectedWeek, state.statisticsStartedOn, motion.matches, stats.days, stats.earned,
      stats.skills.map(({ id, name, earned }) => [id, name, earned]), stats.areas]);
    if (signature === lastData && visible === wasVisible) return;
    const entering = visible && !wasVisible;
    const previous = visible && wasVisible ? geometry() : null;
    cancelAnimationFrame(radarFrame);
    radarFrame = 0;
    wasVisible = visible;
    lastData = signature;
    const changes = [];
    const untracked = end < state.statisticsStartedOn;
    const total = stats.days.reduce((sum, day) => sum + day.count, 0);
    const earned = stats.earned;
    $('selectedWeek').textContent = `${shortDate(selectedWeek)} – ${fullDate(end)}`;
    $('nextWeek').disabled = selectedWeek >= currentWeek;
    $('weekSummary').hidden = untracked;
    $('summaryGoals').textContent = number(total);
    $('summaryXp').textContent = number(earned);
    $('summaryUnavailable').hidden = !untracked;
    $('statisticsCoverage').textContent = untracked
      ? `Activity tracking started on ${fullDate(state.statisticsStartedOn)}. Earlier statistics are unavailable.`
      : selectedWeek <= state.statisticsStartedOn ? `Tracking started on ${fullDate(state.statisticsStartedOn)}. This week's totals cover recorded activity only.` : '';
    $('statisticsCoverage').hidden = !$('statisticsCoverage').textContent;
    $('weeklyGoalCount').textContent = untracked ? 'No history' : `${number(total)} ${total === 1 ? 'goal' : 'goals'}`;
    $('activityLegend').replaceChildren();
    const hasUnclassified = stats.days.some(day => day.types.unclassified > 0);
    for (const [type, label] of activityTypes) {
      if (type === 'unclassified' && !hasUnclassified) continue;
      const item = element('span', 'activity-legend-item', label);
      item.prepend(element('i', `activity-swatch activity-${type}`));
      $('activityLegend').append(item);
    }
    $('activityClassification').hidden = !hasUnclassified;
    $('activityChart').replaceChildren();
    $('activityScale').replaceChildren();
    // A readable integer axis is presentation only; completion counts stay unchanged.
    const tick = Math.max(1, Math.ceil(Math.max(...stats.days.map(day => day.count)) / 4));
    const maximum = tick * 4;
    for (let i = 4; i >= 0; i--) $('activityScale').append(element('span', '', untracked ? '—' : number(i * tick)));
    stats.days.forEach((day, index) => {
      const unavailable = day.date < state.statisticsStartedOn;
      const column = element('div', 'activity-day');
      const detail = `${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][index]}, ${fullDate(day.date)}\n${unavailable ? 'Not tracked' : activityTypes.map(([type, label]) => `${label}: ${number(day.types[type])}`).join('\n') + `\nTotal completions: ${number(day.count)}`}`;
      column.tabIndex = 0;
      column.setAttribute('role', 'group');
      column.setAttribute('aria-label', detail);
      const tooltip = element('div', 'activity-tooltip', detail);
      tooltip.setAttribute('role', 'tooltip');
      tooltip.id = `activity-tooltip-${index}`;
      column.setAttribute('aria-describedby', tooltip.id);
      column.append(tooltip);
      column.addEventListener('focus', () => column.classList.add('has-focus'));
      column.addEventListener('blur', () => column.classList.remove('has-focus'));
      column.addEventListener('keydown', event => {
        if (event.key === 'Escape') column.classList.add('tooltip-dismissed');
      });
      for (const event of ['mouseenter', 'focus']) column.addEventListener(event, () => column.classList.remove('tooltip-dismissed'));
      const track = element('div', 'activity-track');
      const bar = element('div', 'activity-bar');
      activityTypes.forEach(([type], typeIndex) => {
        const segment = element('div', `activity-segment activity-${type}`);
        segment.dataset.type = type;
        segment.dataset.count = day.types[type];
        bar.append(segment);
        const to = day.count ? day.types[type] / day.count * 100 : 0;
        changes.push({ node: segment, property: 'height', index,
          from: previous?.segments[index]?.[typeIndex] ?? to, to });
      });
      track.append(bar);
      // Keep count labels still while the bar below them grows.
      column.append(element('span', 'activity-value', unavailable ? '—' : number(day.count)), track,
        element('span', 'activity-label', ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][index]));
      $('activityChart').append(column);
      const to = day.count / maximum * 100;
      column.style.setProperty('--count-height', `${to * 1.8}px`);
      changes.push({ node: bar, property: 'height', index, from: previous?.bars[index] ?? (entering ? 0 : to), to });
    });
    $('activityEmpty').textContent = !untracked && !total ? 'No activity this week. Complete a goal to start tracking your progress.' : '';
    $('activityEmpty').hidden = !$('activityEmpty').textContent;
    $('skillProgression').replaceChildren();
    stats.skills.slice(0, 5).forEach((skill, index) => {
      const row = element('li', 'skill-progression-row');
      row.dataset.skillId = skill.id;
      const header = element('div', 'progression-label');
      const link = element('a', 'skill-name', skill.name);
      link.href = `skill.html?id=${encodeURIComponent(skill.id)}`;
      header.append(link, element('strong', '', `+${number(skill.earned)} XP`));
      const track = element('div', 'progression-track');
      const bar = element('div', 'progression-bar');
      track.append(bar);
      row.append(header, track);
      $('skillProgression').append(row);
      changes.push({ node: bar, property: 'width', index, from: previous?.skills.get(skill.id) ?? 0, to: skill.earned / stats.skills[0].earned * 100 });
    });
    $('progressionEmpty').textContent = untracked ? 'Skill progression is unavailable before tracking started.' : 'No skill progress this week. Earn XP by completing goals.';
    $('progressionEmpty').hidden = stats.skills.length > 0;
    $('areaRadar').replaceChildren();
    $('areaBreakdown').replaceChildren();
    const insufficient = stats.areas.length < 3;
    $('areaEmpty').textContent = untracked ? 'Life Area statistics are unavailable before tracking started.'
      : insufficient ? `Create at least 3 Life Areas to see your weekly focus profile (${stats.areas.length} of 3). Use Manage Life Areas to assign existing Skills.`
        : !stats.categorizedXp ? 'No Life Area activity this week. Only XP earned by categorized Skills contributes here.'
          : stats.areas.length > 8 ? 'All your Life Areas are shown in the breakdown for readability.' : '';
    $('areaEmpty').hidden = !$('areaEmpty').textContent;
    if (stats.categorizedXp && !untracked) {
      if (!insufficient && stats.areas.length <= 8) drawRadar(stats.areas, previous?.radar);
      stats.areas.forEach((area, index) => {
        const row = element('li', 'area-breakdown-row');
        row.dataset.areaId = area.id;
        row.style.setProperty('--area-accent', areaColor(area.id));
        const name = element('span', 'area-name');
        const dot = element('span', 'area-color');
        dot.setAttribute('aria-hidden', 'true');
        name.append(dot, document.createTextNode(area.name));
        const track = element('div', 'progression-track');
        const bar = element('div', 'progression-bar');
        track.append(bar);
        row.append(name, track, element('strong', 'area-share', percent(area.percentage)), element('span', 'area-xp', `${number(area.earned)} XP`));
        $('areaBreakdown').append(row);
        changes.push({ node: bar, property: 'width', index, from: previous?.areas.get(area.id) ?? (entering ? 0 : area.percentage), to: area.percentage });
      });
    }
    playBars(changes, entering);
  }
  function renderManager() {
    const state = getState();
    $("lifeAreaSkills").replaceChildren();
    $("skillAreaAssignments").replaceChildren();
    $("existingLifeAreas").replaceChildren();
    $("createLifeArea").disabled = true;
    if (!state.skills.length) $("lifeAreaSkills").append(element("p", "statistics-muted", "Create a Skill first. Life Areas cannot be created empty."));
    if (!state.lifeAreas.length) $("existingLifeAreas").append(element("p", "statistics-muted", "Your Life Areas will appear here."));
    state.skills.forEach(skill => {
      const label = element("label", "area-skill-option");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = skill.id;
      const area = state.lifeAreas.find(item => item.id === skill.lifeAreaId);
      label.append(checkbox, element("span", "", skill.name + (area ? ` · ${area.name}` : " · Uncategorized")));
      $("lifeAreaSkills").append(label);
      const assignment = element("label", "skill-area-assignment");
      assignment.append(element("span", "", skill.name));
      const select = document.createElement("select");
      const none = element("option", "", "Uncategorized");
      none.value = "";
      select.append(none);
      state.lifeAreas.forEach(item => {
        const option = element("option", "", item.name);
        option.value = item.id;
        select.append(option);
      });
      select.value = skill.lifeAreaId;
      select.addEventListener("change", () => {
        Statistics.assignArea(getState(), skill.id, select.value);
        save();
        renderManager();
      });
      assignment.append(select);
      $("skillAreaAssignments").append(assignment);
    });
    state.lifeAreas.forEach(area => {
      const row = element("form", "area-edit-row");
      const input = document.createElement("input");
      input.value = area.name;
      input.required = true;
      input.maxLength = 50;
      input.setAttribute("aria-label", `Name of ${area.name}`);
      const rename = element("button", "secondary-btn", "Save name");
      rename.type = "submit";
      const remove = element("button", "mini-btn danger", "Delete");
      remove.type = "button";
      row.append(input, rename, remove);
      row.addEventListener("submit", event => {
        event.preventDefault();
        if (!input.value.trim()) { input.setCustomValidity("Enter a name."); input.reportValidity(); return; }
        const current = getState().lifeAreas.find(item => item.id === area.id);
        if (!current) return;
        current.name = input.value.trim();
        save();
        renderManager();
      });
      input.addEventListener("input", () => input.setCustomValidity(""));
      remove.addEventListener("click", () => {
        if (!confirm(`Delete "${area.name}"? Its Skills will become uncategorized. XP and history will be kept.`)) return;
        Statistics.deleteArea(getState(), area.id);
        save();
        renderManager();
      });
      $("existingLifeAreas").append(row);
    });
  }
  $("previousWeek").addEventListener("click", () => { selectedWeek = Statistics.shiftDay(selectedWeek, -7); render(); });
  $("nextWeek").addEventListener("click", () => {
    const next = Statistics.shiftDay(selectedWeek, 7);
    if (next <= Statistics.weekStart()) selectedWeek = next;
    render();
  });
  $("manageLifeAreas").addEventListener("click", () => {
    $("createLifeAreaForm").reset();
    $("lifeAreaError").textContent = "";
    renderManager();
    $("lifeAreasModal").showModal();
  });
  $("lifeAreaSkills").addEventListener("change", () => {
    $("createLifeArea").disabled = !$("lifeAreaSkills").querySelector("input:checked");
  });
  $("createLifeAreaForm").addEventListener("submit", event => {
    event.preventDefault();
    try {
      Statistics.createArea(getState(), crypto.randomUUID(), $("lifeAreaName").value,
        [...$("lifeAreaSkills").querySelectorAll("input:checked")].map(input => input.value));
      save();
      event.target.reset();
      $("lifeAreaError").textContent = "";
      renderManager();
      $("lifeAreaName").focus();
    } catch (error) { $("lifeAreaError").textContent = error.message; }
  });
  motion.addEventListener("change", render);
  return { render };
}
