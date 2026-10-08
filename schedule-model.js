// Optional scheduling data. Local wall-clock times are never serialized as UTC.
const GoalSchedule = (() => {
  const types = ['one-time', 'daily', 'weekly', 'custom'];
  const offsets = ['0m', '5m', '15m', '30m'];
  const validTime = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

  function read(goal) {
    const value = goal?.schedule;
    if (!value || !types.includes(value.type)) return null;
    if (value.type === 'one-time') return { type: 'one-time' };
    if (!['step', 'quest'].includes(goal.type)) return null;
    if (value.time !== undefined && value.time !== '' && !validTime(value.time)) return null;
    const schedule = { type: value.type };
    if (value.time) schedule.time = value.time;
    if (['weekly', 'custom'].includes(value.type)) {
      if (!Array.isArray(value.daysOfWeek) || !value.daysOfWeek.length ||
          value.daysOfWeek.some(day => !Number.isInteger(day) || day < 1 || day > 7)) return null;
      schedule.daysOfWeek = [...new Set(value.daysOfWeek)].sort((a, b) => a - b);
    }
    return schedule;
  }

  function reminder(goal) {
    const value = goal?.reminder;
    return {
      enabled: value?.enabled === true && offsets.includes(value?.offset),
      offset: offsets.includes(value?.offset) ? value.offset : '5m',
    };
  }

  function validate(schedule, reminderValue, role) {
    if (!schedule || schedule.type === 'one-time') return { schedule: undefined, reminder: undefined, repeatsDaily: false };
    if (!types.includes(schedule.type)) throw new Error('Choose a valid frequency.');
    if (!['step', 'quest'].includes(role)) throw new Error('Only Steps and Quests can repeat.');
    if (['weekly', 'custom'].includes(schedule.type) &&
        (!Array.isArray(schedule.daysOfWeek) || !schedule.daysOfWeek.length)) throw new Error('Select at least one day');
    if (schedule.time !== undefined && schedule.time !== '' && !validTime(schedule.time)) throw new Error('Please enter a valid time (HH:MM)');
    const normalized = read({ type: role, schedule });
    if (!normalized) throw new Error('Choose valid days (Monday–Sunday).');
    if (reminderValue && (typeof reminderValue.enabled !== 'boolean' || !offsets.includes(reminderValue.offset))) {
      throw new Error('Choose a valid reminder offset.');
    }
    const configured = reminder({ reminder: reminderValue });
    if (!normalized.time) configured.enabled = false;
    return { schedule: normalized, reminder: configured, repeatsDaily: normalized.type === 'daily' };
  }

  function effective(goal) {
    return read(goal) || (goal?.repeatsDaily ? { type: 'daily' } : null);
  }

  function dayKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function occursOn(schedule, date) {
    return schedule?.type === 'daily' ||
      (['weekly', 'custom'].includes(schedule?.type) && schedule.daysOfWeek.includes(date.getDay() || 7));
  }

  function shouldReset(goal, now = new Date()) {
    if (!goal.completed) return false;
    const schedule = effective(goal);
    if (!schedule || schedule.type === 'one-time') return false;
    const completedDay = [goal.completedScheduleDay, goal.completedDay].filter(Boolean).sort().pop();
    if (schedule.type === 'daily') {
      if (goal.completedScheduleDay > goal.completedDay && goal.completedScheduleDay >= dayKey(now)) return false;
      return goal.completedDay !== dayKey(now);
    }
    if (!completedDay) return true;
    for (let offset = 0; offset > -7; offset--) {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, 12);
      if (occursOn(schedule, date)) return dayKey(date) > completedDay;
    }
    return false;
  }

  function label(goal) {
    const schedule = effective(goal);
    if (!schedule || schedule.type === 'one-time') return '';
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const frequency = schedule.type === 'daily' ? 'Daily' :
      `${schedule.type === 'weekly' ? 'Weekly' : 'Custom'} · ${schedule.daysOfWeek.map(day => days[day - 1]).join(', ')}`;
    return `↻ ${frequency} · ${schedule.time || 'Any time'}`;
  }

  // One latest due occurrence per goal. Check tomorrow too: a reminder for
  // 00:05 may be due at 23:35 on the preceding local day.
  function latestDue(goal, now = new Date()) {
    const schedule = read(goal);
    const configured = reminder(goal);
    if (!schedule?.time || schedule.type === 'one-time' || !configured.enabled) return null;
    const [hours, minutes] = schedule.time.split(':').map(Number);
    const created = new Date(goal.createdAt);
    const createdDay = Number.isFinite(created.getTime()) ? dayKey(created) : '';
    for (let offset = 1; offset >= -7; offset--) {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, hours, minutes);
      const day = dayKey(date);
      if (!occursOn(schedule, date) || (createdDay && day < createdDay)) continue;
      const due = date.getTime() - parseInt(configured.offset, 10) * 60_000;
      if (due > now.getTime()) continue;
      const signature = [schedule.type, schedule.time, ...(schedule.daysOfWeek || [])].join('/');
      return { key: `${goal.id}/${signature}/${day}`, goal, day, time: schedule.time,
        scheduledAt: date.getTime(), dueAt: due, missed: now.getTime() > date.getTime() };
    }
    return null;
  }

  function pending(state, now = new Date()) {
    return (state.goals || []).flatMap(goal => {
      const entry = latestDue(goal, now);
      if (!entry || (goal.completed && !shouldReset(goal, now))) return [];
      const receipt = state.reminderReceipts?.[goal.id];
      if (receipt?.key === entry.key && ['done', 'skipped'].includes(receipt.status)) return [];
      // A completion before the reminder on the same occurrence day also
      // suppresses that reminder after the next daily reset.
      if ((state.completionHistory || []).some(record => record.goalId === goal.id &&
          (record.occurrenceKey === entry.key || (!record.occurrenceKey && record.completionDate === entry.day)))) return [];
      return [entry];
    }).sort((a, b) => b.scheduledAt - a.scheduledAt || a.key.localeCompare(b.key));
  }

  return { types, offsets, validTime, read, reminder, validate, effective, dayKey, occursOn, shouldReset, label, latestDue, pending };
})();
