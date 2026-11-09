import { isPostDate, postDaysBetween, postSlots } from '../firma/post-schedule.mjs';

function scanFirm(firm, today) {
  const posts = firm.posts || [];
  const sent = new Set(firm.postReminderKeys || []);
  const reminders = [];
  let next = null;
  let needsAttention = false;

  for (const tab of firm.postTabs || []) {
    if (!isPostDate(tab.startDate)) continue;
    const lastDate = posts.reduce((latest, post) => {
      const date = post.slotDate || post.publishDate;
      return post.tabId === tab.id && isPostDate(date) && date > latest ? date : latest;
    }, tab.startDate > today ? tab.startDate : today);
    const horizon = new Date(Date.parse(lastDate) + 32 * 86400000);
    const through = horizon.getUTCFullYear() > 9999 ? '9999-12-31' : horizon.toISOString().slice(0, 10);
    for (const slot of postSlots(tab, posts, tab.startDate, through)) {
      if (slot.title) continue;
      const days = postDaysBetween(today, slot.date);
      if (days >= 0 && (!next || slot.date < next.date)) next = { date: slot.date, tab };
      if (days > 14) continue;
      needsAttention = true;
      const stage = days < 0 ? 'overdue' : days <= 7 ? '7' : '14';
      const reminderKey = `post-slot:${tab.id}:${slot.date}:${stage}`;
      if (!sent.has(reminderKey)) reminders.push({ firm, tab, date: slot.date, days, reminderKey });
    }
  }
  return { firm, next, needsAttention, reminders };
}

export function getPostReminderDigest(firms, today) {
  const statuses = firms.map((firm) => scanFirm(firm, today));
  const reminders = statuses.flatMap((status) => status.reminders)
    .sort((a, b) => a.date.localeCompare(b.date));
  const reminderKey = `post-all-clear:${today}`;
  const monday = new Date(today).getUTCDay() === 1;
  const allClear = monday && firms.length > 0
    && statuses.every(({ firm, needsAttention }) => !needsAttention && !firm.postReminderKeys?.includes(reminderKey))
    ? { statuses, firm: firms[0], reminderKey }
    : null;
  return { reminders, allClear };
}
