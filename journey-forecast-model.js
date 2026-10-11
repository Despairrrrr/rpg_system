// A planning heuristic, not a calibrated probability. No state writes or timers.
const JourneyForecast = (() => {
  const AVAILABLE_TIME_FACTOR = 0.75;
  const DEFAULT_END_TIME = '21:00';
  const QUEST_PRESETS = [[200, 105], [350, 180], [500, 210]];

  function normalize(value, today = Statistics.dayKey()) {
    const valid = GoalSchedule.validTime(value?.preferredEndTime);
    return {
      preferredEndTime: valid ? value.preferredEndTime : DEFAULT_END_TIME,
      activeDate: valid && value?.activeDate === today ? today : '',
    };
  }
  function duration(goal) {
    if (!['step', 'quest'].includes(goal.type)) return 0;
    if (!['number', 'string'].includes(typeof goal.xp) || String(goal.xp).trim() === '') return null;
    const xp = Number(goal.xp);
    if (!Number.isFinite(xp) || !Number.isInteger(xp) || xp < 0) return null;
    if (goal.type === 'step') return xp === 10 ? 5 : xp === 125 ? 15 : 10;
    // Ascending presets and strict comparison break exact ties toward the lower XP.
    return QUEST_PRESETS.reduce((best, preset) => Math.abs(preset[0] - xp) < Math.abs(best[0] - xp) ? preset : best)[1];
  }
  function workload(plan) {
    const unfinished = [...new Map(plan.filter(goal => !goal.completed && ['step', 'quest'].includes(goal.type))
      .map(goal => [goal.id, goal])).values()];
    const quests = new Set(unfinished.filter(goal => goal.type === 'quest').map(goal => goal.id));
    const goals = unfinished.filter(goal => goal.type !== 'step' || !quests.has(goal.parentGoalId));
    const durations = goals.map(duration);
    return { goals, minutes: durations.includes(null) ? null : durations.reduce((sum, minutes) => sum + minutes, 0) };
  }
  function deadline(time, now = new Date()) {
    if (!GoalSchedule.validTime(time) || !Number.isFinite(now.getTime())) return null;
    const [hours, minutes] = time.split(':').map(Number);
    // Native local calendar semantics, matching the schedule model (including DST).
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes).getTime();
  }
  function percentage(available, work) {
    if (!Number.isFinite(available) || !Number.isFinite(work) || work <= 0) return null;
    if (available <= 0) return 0;
    // Equivalent to 100*T²/(T²+W²), avoiding overflow when squaring large inputs.
    const ratio = work / available;
    return Math.max(0, Math.min(100, 100 / (1 + ratio * ratio)));
  }
  function calculate(value, plan, now = new Date()) {
    const settings = normalize(value, Statistics.dayKey(now));
    const work = workload(plan);
    const due = deadline(settings.preferredEndTime, now);
    const remainingMinutes = due === null ? 0 : Math.max(0, (due - now.getTime()) / 60000);
    const availableMinutes = remainingMinutes * AVAILABLE_TIME_FACTOR;
    const base = { settings, workloadMinutes: work.minutes, remainingCount: work.goals.length,
      remainingMinutes, availableMinutes, percent: null, risk: '' };
    if (!settings.activeDate) return { ...base, phase: 'inactive' };
    if (!work.goals.length) return { ...base, phase: 'completed' };
    if (due === null || work.minutes === null) return { ...base, phase: 'unavailable' };
    if (due <= now.getTime()) return { ...base, phase: 'expired' };
    const percent = percentage(availableMinutes, work.minutes);
    // Labels follow the displayed integer, so a visible 75% always means Good outlook.
    const display = Math.round(percent);
    return { ...base, phase: 'active', percent,
      risk: display >= 75 ? 'good' : display >= 40 ? 'at-risk' : 'high-risk' };
  }
  return { AVAILABLE_TIME_FACTOR, DEFAULT_END_TIME, normalize, duration, workload, deadline, percentage, calculate };
})();
