// Calendar dates and persisted facts. No DOM or stored aggregates.
const Statistics = (() => {
  function dayKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }
  function parseDay(day) {
    const [year, month, date] = day.split("-").map(Number);
    return new Date(year, month - 1, date, 12);
  }
  function validDay(day) {
    return typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day) && dayKey(parseDay(day)) === day;
  }
  function shiftDay(day, amount) {
    const date = parseDay(day);
    date.setDate(date.getDate() + amount);
    return dayKey(date);
  }
  function weekStart(day = dayKey()) {
    return shiftDay(day, -((parseDay(day).getDay() + 6) % 7));
  }
  function normalize(loaded, today = dayKey()) {
    const lifeAreas = Array.isArray(loaded.lifeAreas) ? loaded.lifeAreas : [];
    const areaIds = new Set(lifeAreas.map(area => area.id));
    return {
      ...loaded,
      updatedAt: Number(loaded.updatedAt) || 0,
      lifeAreas,
      completionHistory: Array.isArray(loaded.completionHistory) ? loaded.completionHistory : [],
      statisticsStartedOn: validDay(loaded.statisticsStartedOn) ? loaded.statisticsStartedOn : today,
      skills: (Array.isArray(loaded.skills) ? loaded.skills : []).map(skill => ({
        ...skill, lifeAreaId: areaIds.has(skill.lifeAreaId) ? skill.lifeAreaId : "",
      })),
      goals: (Array.isArray(loaded.goals) ? loaded.goals : []).map(goal => ({
        ...goal, activeCompletionId: goal.activeCompletionId || "",
      })),
    };
  }
  function weekly(state, start) {
    const end = shiftDay(start, 7);
    const days = Array.from({ length: 7 }, (_, index) => ({ date: shiftDay(start, index), count: 0 }));
    const counts = new Map(days.map(day => [day.date, day]));
    const totals = new Map();
    for (const record of state.completionHistory) {
      if (!validDay(record.completionDate) || record.completionDate < start || record.completionDate >= end) continue;
      counts.get(record.completionDate).count++;
      totals.set(record.skillId, (totals.get(record.skillId) || 0) + Math.max(0, Number(record.xpAwarded) || 0));
    }
    const skills = state.skills.map(skill => ({ ...skill, earned: totals.get(skill.id) || 0 }))
      .filter(skill => skill.earned > 0)
      .sort((a, b) => b.earned - a.earned || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    const areas = state.lifeAreas.map(area => ({ ...area, earned: 0, percentage: 0 }));
    const byArea = new Map(areas.map(area => [area.id, area]));
    for (const skill of skills) {
      const area = byArea.get(skill.lifeAreaId);
      if (area) area.earned += skill.earned;
    }
    const categorizedXp = areas.reduce((sum, area) => sum + area.earned, 0);
    for (const area of areas) area.percentage = categorizedXp ? area.earned / categorizedXp * 100 : 0;
    return { days, skills, areas, categorizedXp };
  }
  // Validate before mutating, so a failed creation never leaves an empty Area.
  function createArea(state, id, name, skillIds) {
    const selected = [...new Set(skillIds)];
    name = name.trim();
    if (!name || name.length > 50) throw new Error("Enter a name (up to 50 characters).");
    if (state.lifeAreas.some(area => area.id === id)) throw new Error("This Life Area already exists.");
    if (!selected.length || selected.some(skillId => !state.skills.some(skill => skill.id === skillId))) {
      throw new Error("Select at least one existing Skill.");
    }
    state.lifeAreas.push({ id, name });
    for (const skill of state.skills) if (selected.includes(skill.id)) skill.lifeAreaId = id;
  }
  function assignArea(state, skillId, areaId) {
    const skill = state.skills.find(item => item.id === skillId);
    if (!skill || (areaId && !state.lifeAreas.some(area => area.id === areaId))) throw new Error("Select an existing Skill and Life Area.");
    skill.lifeAreaId = areaId;
  }
  function deleteArea(state, id) {
    state.lifeAreas = state.lifeAreas.filter(area => area.id !== id);
    for (const skill of state.skills) if (skill.lifeAreaId === id) skill.lifeAreaId = "";
  }
  return { dayKey, parseDay, validDay, shiftDay, weekStart, normalize, weekly, createArea, assignArea, deleteArea };
})();
