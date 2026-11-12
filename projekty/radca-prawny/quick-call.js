(() => {
  const quickCall = document.querySelector('.quick-call');
  const hours = document.querySelector('.contact-hours');
  if (!quickCall || !hours) return;

  const [firstDay, lastDay] = [...hours.querySelectorAll('[data-day]')].map((day) => Number(day.dataset.day));
  const [opensAt, closesAt] = [...hours.querySelectorAll('time')].map((time) => {
    const clock = time.textContent.trim();
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(clock)) return NaN;
    const [hour, minute] = clock.split(':').map(Number);
    return 60 * hour + minute;
  });
  if (![firstDay, lastDay].every((day) => Number.isInteger(day) && day >= 1 && day <= 7)
      || ![opensAt, closesAt].every(Number.isFinite)) return;

  const warsawClock = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Warsaw',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const isWorkingDay = (day) => firstDay <= lastDay
    ? day >= firstDay && day <= lastDay
    : day >= firstDay || day <= lastDay;

  function isOpen(now) {
    const parts = Object.fromEntries(warsawClock.formatToParts(now).map(({ type, value }) => [type, value]));
    const day = weekdays.indexOf(parts.weekday) + 1;
    const minute = Number(parts.hour) * 60 + Number(parts.minute);
    if (opensAt < closesAt) {
      return isWorkingDay(day) && minute >= opensAt && minute < closesAt;
    }

    // A shift can continue after midnight. 00:00–00:00 covers the whole opening day.
    const previousDay = day === 1 ? 7 : day - 1;
    return (isWorkingDay(day) && minute >= opensAt)
      || (isWorkingDay(previousDay) && minute < closesAt);
  }

  const revealAt = Date.now() + 5_000;
  let timer;

  function updateQuickCall() {
    window.clearTimeout(timer);
    const now = Date.now();
    const untilReveal = revealAt - now;
    const open = isOpen(now);
    const expanded = untilReveal <= 0 && open;
    quickCall.classList.toggle('is-open', open);
    quickCall.classList.toggle('is-expanded', expanded);
    if (expanded) quickCall.setAttribute('aria-describedby', 'quick-call-message');
    else quickCall.removeAttribute('aria-describedby');

    if (!document.hidden) {
      const untilNextMinute = 60_000 - now % 60_000;
      const delay = untilReveal > 0 ? Math.min(untilNextMinute, untilReveal) : untilNextMinute;
      timer = window.setTimeout(updateQuickCall, delay);
    }
  }

  updateQuickCall();
  document.addEventListener('visibilitychange', updateQuickCall);
  window.addEventListener('pageshow', updateQuickCall);
})();
