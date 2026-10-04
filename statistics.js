function createStatisticsView({ getState, save }) {
  const page = document.querySelector("#statisticsPage");
  if (!page) return null;
  const $ = id => document.getElementById(id);
  let selectedWeek = Statistics.weekStart();
  let currentWeek = selectedWeek;
  const number = value => value.toLocaleString();
  const shortDate = day => Statistics.parseDay(day).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const fullDate = day => Statistics.parseDay(day).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function svgNode(tag, attributes) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    return node;
  }
  function drawRadar(areas) {
    const svg = svgNode("svg", { viewBox: "0 0 320 320", role: "img", "aria-label": "Weekly focus by Life Area. Each axis runs from 0 to 100 percent; values are listed alongside." });
    const point = (index, fraction) => {
      const angle = index / areas.length * Math.PI * 2 - Math.PI / 2;
      return [160 + Math.cos(angle) * 122 * fraction, 160 + Math.sin(angle) * 122 * fraction];
    };
    for (const fraction of [0.25, 0.5, 0.75, 1]) {
      svg.append(svgNode("polygon", { points: areas.map((_, i) => point(i, fraction).join(",")).join(" "), class: "radar-grid" }));
    }
    areas.forEach((area, index) => {
      const [x, y] = point(index, 1);
      svg.append(svgNode("line", { x1: 160, y1: 160, x2: x, y2: y, class: "radar-grid" }));
      const [lx, ly] = point(index, 1.16);
      const label = svgNode("text", { x: lx, y: ly, "text-anchor": "middle", "dominant-baseline": "central", class: "radar-label" });
      label.textContent = index + 1;
      const title = svgNode("title", {});
      title.textContent = area.name;
      label.append(title);
      svg.append(label);
    });
    svg.append(svgNode("polygon", { points: areas.map((area, i) => point(i, area.percentage / 100).join(",")).join(" "), class: "radar-value" }));
    areas.forEach((area, index) => {
      const [cx, cy] = point(index, area.percentage / 100);
      svg.append(svgNode("circle", { cx, cy, r: 3, class: "radar-dot" }));
    });
    $("areaRadar").append(svg);
  }
  function render() {
    const state = getState();
    const nextCurrent = Statistics.weekStart();
    if (selectedWeek === currentWeek || selectedWeek > nextCurrent) selectedWeek = nextCurrent;
    currentWeek = nextCurrent;
    const end = Statistics.shiftDay(selectedWeek, 6);
    const stats = Statistics.weekly(state, selectedWeek);
    $("selectedWeek").textContent = `${shortDate(selectedWeek)} – ${fullDate(end)}`;
    $("nextWeek").disabled = selectedWeek >= currentWeek;
    const untracked = end < state.statisticsStartedOn;
    $("statisticsCoverage").textContent = untracked
      ? `This week predates activity tracking, which started on ${fullDate(state.statisticsStartedOn)}. Earlier activity is unavailable.`
      : "";

    $("activityChart").replaceChildren();
    const max = Math.max(1, ...stats.days.map(day => day.count));
    const total = stats.days.reduce((sum, day) => sum + day.count, 0);
    $("weeklyGoalCount").textContent = untracked ? "No history" : `${number(total)} ${total === 1 ? "goal" : "goals"}`;
    stats.days.forEach((day, index) => {
      const unavailable = day.date < state.statisticsStartedOn;
      const column = element("div", "activity-day");
      column.setAttribute("aria-label", `${fullDate(day.date)}: ${unavailable ? "not tracked" : `${day.count} goals completed`}`);
      column.append(element("span", "activity-value", unavailable ? "—" : number(day.count)));
      const track = element("div", "activity-track");
      const bar = element("div", "activity-bar");
      bar.style.height = `${day.count / max * 100}%`;
      track.append(bar);
      column.append(track, element("span", "activity-label", ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][index]));
      $("activityChart").append(column);
    });
    $("activityEmpty").textContent = !untracked && !total ? "No goals completed in the recorded part of this week." : "";

    $("skillProgression").replaceChildren();
    stats.skills.slice(0, 5).forEach(skill => {
      const row = element("li", "skill-progression-row");
      const header = element("div", "progression-label");
      const link = element("a", "skill-name", skill.name);
      link.href = `skill.html?id=${encodeURIComponent(skill.id)}`;
      header.append(link, element("strong", "", `+${number(skill.earned)} XP`));
      const track = element("div", "progression-track");
      const bar = element("div", "progression-bar");
      bar.style.width = `${skill.earned / stats.skills[0].earned * 100}%`;
      track.append(bar);
      row.append(header, track);
      $("skillProgression").append(row);
    });
    $("progressionEmpty").textContent = stats.skills.length ? "" : untracked ? "Skill progression wasn't recorded yet." : "Complete a goal to earn your first XP this week.";
    $("progressionEmpty").hidden = stats.skills.length > 0;
    $("areaRadar").replaceChildren();
    $("areaBreakdown").replaceChildren();
    const insufficient = stats.areas.length < 3;
    $("areaEmpty").textContent = untracked ? "Life Area activity wasn't recorded yet."
      : insufficient ? `Create at least 3 Life Areas to see a radar (${stats.areas.length} of 3). Assign an existing Skill when creating each Area.`
        : !stats.categorizedXp ? "No categorized activity this week. Assign Skills to Life Areas, then complete goals to see your weekly focus."
          : stats.areas.length > 8 ? "Your weekly focus is shown as a list so every Life Area stays visible." : "";
    $("areaEmpty").hidden = !$("areaEmpty").textContent;
    if (stats.categorizedXp && !untracked) {
      if (!insufficient && stats.areas.length <= 8) drawRadar(stats.areas);
      stats.areas.forEach((area, index) => {
        const row = element("li");
        const header = element("div", "progression-label");
        header.append(element("span", "area-name", `${index + 1}. ${area.name}`), element("strong", "", `${area.percentage.toFixed(1)}%`));
        row.append(header, element("span", "statistics-muted", `${number(area.earned)} XP`));
        const track = element("div", "progression-track");
        const bar = element("div", "progression-bar");
        bar.style.width = `${area.percentage}%`;
        track.append(bar);
        row.append(track);
        $("areaBreakdown").append(row);
      });
    }
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
  return { render };
}
