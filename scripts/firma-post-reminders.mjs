import { isIrregularPostFrequency } from '../firma/post-frequency.mjs';
import { isOpenIrregularPost, isPostDate, postDaysBetween, postSlots } from '../firma/post-schedule.mjs';

function getOpenSlots(tab, posts, today) {
  if (isIrregularPostFrequency(tab.frequency)) {
    return posts.filter((post) => post.tabId === tab.id && isOpenIrregularPost(post))
      .map((post) => ({ date: post.publishDate, key: `post-irregular:${tab.id}:${post.id}:${post.publishDate}` }));
  }
  if (!isPostDate(tab.startDate)) return [];
  const lastDate = posts.reduce((latest, post) => {
    const date = post.slotDate || post.publishDate;
    return post.tabId === tab.id && isPostDate(date) && date > latest ? date : latest;
  }, tab.startDate > today ? tab.startDate : today);
  const horizon = new Date(Date.parse(lastDate) + 32 * 86400000);
  const through = horizon.getUTCFullYear() > 9999 ? '9999-12-31' : horizon.toISOString().slice(0, 10);
  return postSlots(tab, posts, tab.startDate, through)
    .filter((slot) => !slot.title)
    .map(({ date }) => ({ date, key: `post-slot:${tab.id}:${date}` }));
}

function scanFirm(firm, today) {
  const posts = firm.posts || [];
  const sent = new Set(firm.postReminderKeys || []);
  const reminders = [];
  let next = null;
  let needsAttention = false;

  for (const tab of firm.postTabs || []) {
    for (const slot of getOpenSlots(tab, posts, today)) {
      const days = postDaysBetween(today, slot.date);
      if (days >= 0 && (!next || slot.date < next.date)) next = { date: slot.date, tab };
      if (days > 14) continue;
      needsAttention = true;
      const stage = days < 0 ? 'overdue' : days <= 7 ? '7' : '14';
      const reminderKey = `${slot.key}:${stage}`;
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
