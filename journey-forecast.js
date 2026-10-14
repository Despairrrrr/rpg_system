function createJourneyForecastView({ getState, getPlan, update, updatePreferences, now = () => new Date() }) {
  const panel = document.getElementById('journeyForecast');
  if (!panel) return null;
  const $ = id => document.getElementById(id);
  const input = $('forecastEndTime');
  const error = $('forecastError');
  let previousTime = '';
  let previousActivation = null;
  let previousExpanded = null;
  const labels = { good: 'Good outlook', 'at-risk': 'At risk', 'high-risk': 'High risk' };
  function text(id, value) {
    const node = $(id);
    if (node.textContent !== value) node.textContent = value;
  }
  function render() {
    const current = now();
    const plan = getPlan(current);
    const result = JourneyForecast.calculate(getState().journeyForecast, plan, current);
    const { settings } = result;
    // Empty Focus is distinct from completed Focus, regardless of target activation.
    const phase = plan.length ? result.phase : 'empty';
    const risk = phase === 'expired' ? 'high-risk' : result.risk;
    // Minute ticks and disclosure/visibility saves never overwrite an input draft.
    if (settings.preferredEndTime !== previousTime || settings.activeDate !== previousActivation) {
      input.value = settings.preferredEndTime;
      previousTime = settings.preferredEndTime;
      previousActivation = settings.activeDate;
      error.textContent = '';
    }
    if (settings.expanded !== previousExpanded) {
      previousExpanded = settings.expanded;
      panel.open = settings.expanded;
    }
    $('forecastUseToday').checked = Boolean(settings.activeDate);
    $('forecastShowIndicator').checked = settings.showIndicator;
    panel.dataset.phase = phase;
    panel.dataset.risk = risk;
    $('forecastIndicator').hidden = !settings.showIndicator || !risk;
    const status = phase === 'active' ? labels[risk] : {
      empty: 'No Focus goals', inactive: 'Choose a target for today', completed: 'Focus complete',
      expired: 'Time’s up', unavailable: 'Forecast unavailable',
    }[phase];
    text('forecastStatus', status);
    text('forecastTarget', settings.activeDate ? settings.preferredEndTime : 'Set target');
    $('forecastTarget').title = settings.activeDate ? `Today's target: ${settings.preferredEndTime}` : `Remembered time: ${settings.preferredEndTime} · Not active today`;
    text('forecastDetails', phase === 'active' ? '' : {
      empty: 'Choose goals for Today’s Focus to see an outlook.',
      inactive: 'Change the time or use your remembered target today to see a Focus outlook.',
      completed: 'Your Focus work is complete. Undo or add a Focus goal to update the outlook.',
      expired: 'The target time has passed. Choose a later time to update your Focus outlook.',
      unavailable: 'Check the XP of your remaining Focus goals to restore the outlook.',
    }[phase]);
    return { ...result, phase, risk };
  }
  function apply(activate) {
    const time = input.value;
    if (!GoalSchedule.validTime(time)) {
      error.textContent = 'Choose a valid time.';
      $('forecastUseToday').checked = Boolean(JourneyForecast.normalize(getState().journeyForecast).activeDate);
      return;
    }
    if (activate && JourneyForecast.deadline(time, now()) <= now().getTime()) {
      error.textContent = 'Choose a time later today.';
      $('forecastUseToday').checked = Boolean(JourneyForecast.normalize(getState().journeyForecast).activeDate);
      return;
    }
    if (!update(time, activate)) {
      render();
      error.textContent = 'Could not save the target. Please try again.';
      return;
    }
    error.textContent = '';
    render();
  }
  input.addEventListener('change', () => apply(true));
  $('forecastUseToday').addEventListener('change', event => apply(event.target.checked));
  $('forecastForm').addEventListener('submit', event => { event.preventDefault(); apply(true); });
  $('forecastShowIndicator').addEventListener('change', event => {
    const saved = updatePreferences({ showIndicator: event.target.checked });
    render();
    if (!saved) error.textContent = 'Could not save the indicator preference. Please try again.';
  });
  panel.addEventListener('toggle', () => {
    const settings = JourneyForecast.normalize(getState().journeyForecast);
    if (panel.open === settings.expanded) return;
    if (!updatePreferences({ expanded: panel.open })) {
      panel.open = settings.expanded;
      error.textContent = 'Could not save the panel preference. Please try again.';
      return;
    }
    render();
  });
  return { render };
}
