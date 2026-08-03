const FREQUENCIES = {
  weekly: { days: 7 },
  biweekly: { days: 14 },
  monthly: { months: 1 },
  quarterly: { months: 3 },
  semiannual: { months: 6 },
  annual: { months: 12 },
};

export const COMPENSATION_FREQUENCY_OPTIONS = [
  { value: 'weekly', label: 'Co tydzień' },
  { value: 'biweekly', label: 'Co 2 tygodnie' },
  { value: 'monthly', label: 'Co miesiąc' },
  { value: 'quarterly', label: 'Co kwartał' },
  { value: 'semiannual', label: 'Co pół roku' },
  { value: 'annual', label: 'Co rok' },
];

function parseDateKey(value) {
  const key = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const date = new Date(`${key}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== key ? null : date;
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function addMonthsFromStart(startDate, monthsToAdd) {
  const start = parseDateKey(startDate);
  if (!start) return '';
  const targetMonth = start.getUTCMonth() + Number(monthsToAdd || 0);
  const targetYear = start.getUTCFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  const day = Math.min(start.getUTCDate(), lastDay);
  return dateKey(new Date(Date.UTC(targetYear, normalizedMonth, day)));
}

function addDaysFromStart(startDate, daysToAdd) {
  const start = parseDateKey(startDate);
  if (!start) return '';
  start.setUTCDate(start.getUTCDate() + Number(daysToAdd || 0));
  return dateKey(start);
}

function daysBetween(fromValue, toValue) {
  const from = parseDateKey(fromValue);
  const to = parseDateKey(toValue);
  if (!from || !to) return null;
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

function entryPeriod(entry) {
  return String(entry?.period || entry?.date || '').slice(0, 7);
}

export function warsawDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function compensationFrequencyLabel(value) {
  return COMPENSATION_FREQUENCY_OPTIONS.find((option) => option.value === value)?.label || 'Co miesiąc';
}

export function normalizeCompensationReminder(value) {
  const frequency = Object.hasOwn(FREQUENCIES, value?.frequency) ? value.frequency : 'monthly';
  return {
    enabled: value?.enabled === true,
    frequency,
    startDate: parseDateKey(value?.startDate) ? String(value.startDate).slice(0, 10) : '',
  };
}

export function getCompensationReminderStatus(firm, todayKey = warsawDateKey()) {
  const settings = normalizeCompensationReminder(firm?.compensationReminder);
  if (!settings.enabled || !settings.startDate || !parseDateKey(todayKey)) {
    return { settings, overdueItems: [], hasAlert: false };
  }

  const recurrence = FREQUENCIES[settings.frequency] || FREQUENCIES.monthly;
  const paidPeriodCounts = new Map();
  for (const entry of firm?.compensationEntries || []) {
    const period = entryPeriod(entry);
    if (!period) continue;
    paidPeriodCounts.set(period, (paidPeriodCounts.get(period) || 0) + 1);
  }
  const usedPeriodCounts = new Map();
  const overdueItems = [];

  for (let index = 0; index < 600; index += 1) {
    const dueDate = recurrence.days
      ? addDaysFromStart(settings.startDate, index * recurrence.days)
      : addMonthsFromStart(settings.startDate, index * recurrence.months);
    if (!dueDate || dueDate > todayKey) break;
    const period = dueDate.slice(0, 7);
    const usedInPeriod = usedPeriodCounts.get(period) || 0;
    const paidInPeriod = paidPeriodCounts.get(period) || 0;
    if (usedInPeriod < paidInPeriod) {
      usedPeriodCounts.set(period, usedInPeriod + 1);
    } else {
      const daysOverdue = daysBetween(dueDate, todayKey);
      overdueItems.push({
        dueDate,
        period,
        daysOverdue,
        shouldSendToday: daysOverdue >= 0 && daysOverdue % 7 === 0,
      });
    }
  }

  return {
    settings,
    overdueItems,
    hasAlert: overdueItems.length > 0,
  };
}
