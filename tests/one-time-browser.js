// Isolated browser fixture; the Notification API is stubbed by the runner.
(async () => {
  const NativeDate = Date;
  let clock = new NativeDate(2026, 9, 1, 9).getTime();
  window.Date = class extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [clock])); }
    static now() { return clock; }
  };
  const $ = id => document.getElementById(id);
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const change = (id, value) => { $(id).value = value; $(id).dispatchEvent(new Event('change', { bubbles: true })); };
  const pause = () => new Promise(resolve => setTimeout(resolve, 40));
  const until = async predicate => {
    const deadline = NativeDate.now() + 3000;
    while (!predicate() && NativeDate.now() < deadline) await pause();
    assert(predicate(), 'asynchronous notification/action finished');
  };
  const advance = (day, hour, minute = 0) => { clock = new NativeDate(2026, 9, day, hour, minute).getTime(); reminderSystem.refresh(); };
  const add = (title, time = '', remind = false, role = 'step') => {
    openGoalModal(null, role, 'math'); change('goalTitle', title); change('goalTime', time);
    if (remind) $('goalReminder').click();
    $('goalForm').requestSubmit();
    assert(!$('goalModal').open, 'valid one-time form saved');
    return state.goals[state.goals.length - 1];
  };
  const pending = goal => GoalSchedule.pending(state).find(entry => entry.goal.id === goal.id);
  const notices = goal => __notifications.filter(item => item.title === goal.title);
  const result = document.createElement('pre'); result.id = 'test-result';
  try {
    Notification.permission = 'granted';
    const old = add('Old untimed Goal');
    const originalCreation = old.createdAt;
    assert(!old.schedule && !old.reminder, 'untimed one-time unchanged');
    advance(9, 15);
    openGoalModal(old); change('goalTime', '18:00'); $('goalReminder').click(); $('goalForm').requestSubmit();
    assert(old.createdAt === originalCreation && state.oneTimeSchedules[old.id].day === '2026-10-09', 'adding time anchors today without changing creation history');
    const timeOnly = add('Time only Quest', '18:00', false, 'quest');
    assert(timeOnly.schedule.time === '18:00' && !timeOnly.reminder.enabled && !pending(timeOnly), 'time without reminder');
    const missed = add('Missed one-time', '10:00', true);
    assert(pending(missed)?.missed && pending(missed)?.silent, 'past time shown as missed immediately');
    await pause(); assert(notices(missed).length === 0, 'past-created reminder never pops up');
    const early = add('Completed early', '18:00', true, 'quest');
    advance(9, 17); toggleGoalCompletion(early.id, true);
    advance(9, 17, 54); assert(!pending(old), 'one-time not due before offset');
    advance(9, 17, 55); await until(() => notices(old).length === 1);
    assert(!notices(early).length && !pending(early), 'early completion cancels reminder');
    assert(notices(old)[0].options.body.includes('18:00'), 'one-time notification has scheduled time');
    $('reminderBell').click();
    const mark = [...$('reminderList').querySelectorAll('[data-action="complete"]')].find(button => button.dataset.key.startsWith(old.id + '/'));
    const previousXp = state.skills[0].xp;
    mark.click(); await until(() => old.completed);
    assert(state.skills[0].xp === previousXp + old.xp && !pending(old), 'one-time panel completion awards once');
    $('reminderClose').click();
    const receipt = pending(missed).key;
    reminderSystem.skip(pending(missed));
    advance(10, 18); await pause();
    assert(old.completed && early.completed && notices(old).length === 1 && !notices(early).length, 'next day does not reset or re-notify one-time Goals');
    assert(!pending(missed) && loadState().reminderReceipts[missed.id].key === receipt, 'one-time Skip survives next day and reload');
    assert(loadState().oneTimeSchedules[old.id].day === '2026-10-09', 'assigned date persists');

    const edit = add('Edit one-time', '23:00', true);
    const anchor = JSON.stringify(state.oneTimeSchedules[edit.id]);
    openGoalModal(edit); change('goalTime', '22:00'); $('goalModal').querySelector('[data-close="goalModal"]').click();
    assert(edit.schedule.time === '23:00' && JSON.stringify(state.oneTimeSchedules[edit.id]) === anchor, 'Cancel preserves time and date');
    openGoalModal(edit); change('goalTime', '');
    assert($('goalSave').disabled && $('goalReminderHint').textContent === 'Set a time to enable reminders', 'missing time blocks save');
    $('goalReminder').click(); $('goalForm').requestSubmit();
    assert(!edit.schedule && !edit.reminder && !state.oneTimeSchedules[edit.id], 'removing time clears reminder and date');
    advance(11, 23); await pause(); assert(!notices(edit).length, 'removed reminder never fires');
    const repeated = add('Change to repeating', '23:30', true);
    openGoalModal(repeated); $('goalRepeat').click(); $('goalForm').requestSubmit();
    assert(repeated.repeatsDaily && !state.oneTimeSchedules[repeated.id], 'changing to daily clears one-time anchor');
    assert(!__browserErrors.length, 'no browser console errors or warnings');
    openGoalModal(timeOnly);
    assert(!$('goalScheduleFields').hidden && $('goalFrequencyField').hidden && $('goalTime').value === '18:00', 'same time picker on one-time edit');
    assert(document.documentElement.scrollWidth <= innerWidth && $('goalModal').scrollWidth <= $('goalModal').clientWidth, 'no horizontal overflow');
    result.hidden = true;
    result.textContent = 'PASS: one-time timing, old Goal editing, silent missed, early completion, Mark done, Skip, reload, cancellation and removal on ' + (isSkillPage ? 'Skill' : 'dashboard');
  } catch (error) { result.textContent = 'FAIL: ' + error.message + '\n' + error.stack; }
  finally { reminderSystem.stop(); clearTimeout(dayRefreshTimer); window.Date = NativeDate; }
  document.body.append(result);
})();
