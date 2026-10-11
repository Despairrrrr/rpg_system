function createJourneyForecastView({ getState, getPlan, update, now = () => new Date() }) {
  const panel = document.getElementById('journeyForecast');
  if (!panel) return null;
  const $ = id => document.getElementById(id);
  const input = $('forecastEndTime');
  const error = $('forecastError');
  let previousSettings = '';
  let previousDay = '';
  const labels = { good: 'Good outlook', 'at-risk': 'At risk', 'high-risk': 'High risk' };
  function text(id, value) {
    const node = $(id);
    if (node.textContent !== value) node.textContent = value;
  }
  function render() {
    const current = now();
    const result = JourneyForecast.calculate(getState().journeyForecast, getPlan(current), current);
    const { settings, phase } = result;
    const today = Statistics.dayKey(current);
    // A fresh day exposes Calculate, even if yesterday's panel was collapsed.
    if (previousDay && previousDay !== today && phase === 'inactive') panel.open = true;
    previousDay = today;
    const signature = JSON.stringify(settings);
    // Clock/Goal updates must not overwrite a partially edited native time input.
    if (signature !== previousSettings) {
      input.value = settings.preferredEndTime;
      error.textContent = '';
      previousSettings = signature;
    }
    panel.dataset.phase = phase;
    panel.dataset.risk = result.risk;
    text('forecastPercent', phase === 'active' ? `${Math.round(result.percent)}%` : '');
    $('forecastPercent').hidden = phase !== 'active';
    text('forecastStatus', phase === 'active' ? labels[result.risk] : {
      inactive: 'Choose a target', completed: 'No remaining goals', expired: "Time’s up", unavailable: 'Check goal XP',
    }[phase]);
    text('forecastTarget', settings.activeDate ? `Target: ${settings.preferredEndTime}` : 'Finish today at your own pace');
    text('forecastPrompt', phase === 'expired' ? 'Choose a later time and calculate again.' : "When do you want to finish today's goals?");
    text('forecastDetails', phase === 'active'
      ? `About ${result.workloadMinutes} min of goals · ${Math.floor(result.availableMinutes)} min of usable time.`
      : phase === 'completed' ? 'Nothing left to estimate. The forecast will update if your plan changes.'
        : phase === 'unavailable' ? 'Some remaining goals have invalid XP. Edit them to calculate an estimate.'
          : phase === 'expired' ? 'The deadline has passed. Your XP and completed goals are unchanged.'
            : 'Start a fresh forecast for today. Your last selected time is remembered.');
    $('forecastCalculate').hidden = Boolean(settings.activeDate) && phase !== 'expired';
    text('forecastCalculate', phase === 'expired' ? 'Restart forecast' : 'Calculate');
    text('forecastEdit', phase === 'expired' ? 'Set a new time' : 'Edit target');
    $('forecastEdit').hidden = !settings.activeDate;
    return result;
  }
  function apply(activate) {
    const time = input.value;
    if (!GoalSchedule.validTime(time)) { error.textContent = 'Choose a valid time.'; return; }
    const current = now();
    if (activate && JourneyForecast.deadline(time, current) <= current.getTime()) {
      error.textContent = 'Choose a time later today.';
      return;
    }
    if (!update(time, activate)) {
      error.textContent = 'Could not save the forecast. Please try again.';
      return;
    }
    error.textContent = '';
    render();
    if (activate) {
      panel.open = false;
      $('forecastSummary').focus();
    }
  }
  input.addEventListener('change', () => apply(false));
  $('forecastForm').addEventListener('submit', event => { event.preventDefault(); apply(true); });
  $('forecastEdit').addEventListener('click', () => { panel.open = true; input.focus(); });
  return { render };
}
