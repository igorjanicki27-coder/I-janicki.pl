import { normalizePostFrequency } from './post-frequency.mjs';

const DAY = 86400000;
const warsawDateFormat = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw' });

export function postTodayKey(now = new Date()) {
  return warsawDateFormat.format(now);
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

export function isPostDate(value) {
  if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value || '')) return false;
  const date = new Date(value);
  return Number.isFinite(+date) && dateKey(date) === value;
}

export function postDaysBetween(from, to) {
  return (Date.parse(to) - Date.parse(from)) / DAY;
}

function* scheduledDates(tab, from, through) {
  const { startDate } = tab;
  const frequency = normalizePostFrequency(tab.frequency);
  if (!isPostDate(startDate) || startDate > through || frequency === 'irregular') return;

  if (frequency !== 'monthly') {
    const step = frequency === 'weekly' ? 7 : 14;
    const firstOffset = Math.max(0, Math.ceil(postDaysBetween(startDate, from) / step)) * step;
    for (let time = Date.parse(startDate) + firstOffset * DAY; time <= Date.parse(through); time += step * DAY) {
      yield dateKey(new Date(time));
    }
    return;
  }

  const month = new Date(`${(startDate > from ? startDate : from).slice(0, 7)}-01`);
  const day = Number(startDate.slice(8));
  while (+month <= Date.parse(through)) {
    const monthKey = dateKey(month).slice(0, 7);
    month.setUTCMonth(month.getUTCMonth() + 1);
    const daysInMonth = new Date(+month - DAY).getUTCDate();
    const dueDate = `${monthKey}-${String(Math.min(day, daysInMonth)).padStart(2, '0')}`;
    if (dueDate >= from && dueDate <= through) yield dueDate;
  }
}

export function postSlots(tab, posts, from, through) {
  const months = new Map();
  const end = new Date(`${through.slice(0, 7)}-01`);
  end.setUTCMonth(end.getUTCMonth() + 1);
  const endOfMonth = dateKey(new Date(+end - DAY));
  for (const date of scheduledDates(tab, `${from.slice(0, 7)}-01`, endOfMonth)) {
    const month = date.slice(0, 7);
    if (!months.has(month)) months.set(month, []);
    months.get(month).push({ date, post: null });
  }
  const tabPosts = posts.filter((post) => post.tabId === tab.id);
  for (const post of tabPosts.filter((item) => item.slotDate)) {
    const slot = months.get(post.slotDate.slice(0, 7))?.find((item) => item.date === post.slotDate);
    if (slot && (!slot.post || String(post.updatedAt || '') > String(slot.post.updatedAt || ''))) slot.post = post;
  }
  const legacy = tabPosts.filter((post) =>
    !post.slotDate && String(post.title || '').trim() && isPostDate(post.publishDate))
    .sort((a, b) => a.publishDate.localeCompare(b.publishDate) || String(a.id).localeCompare(String(b.id)));

  // Exact matches take priority. Other historical publications fill one place in the same month.
  for (const post of legacy) {
    const slot = months.get(post.publishDate.slice(0, 7))?.find((item) => item.date === post.publishDate && !item.post);
    if (slot) slot.post = post;
  }
  for (const post of legacy) {
    const slots = months.get(post.publishDate.slice(0, 7)) || [];
    if (slots.some((slot) => slot.post === post)) continue;
    const free = slots.filter((slot) => !slot.post);
    free.sort((a, b) => Math.abs(postDaysBetween(a.date, post.publishDate)) - Math.abs(postDaysBetween(b.date, post.publishDate)));
    if (free.length) free[0].post = post;
  }
  return [...months.values()].flat().filter(({ date }) => date >= from && date <= through).map(({ date, post }) => ({
    date,
    post,
    title: String(post?.title || '').trim(),
  }));
}

export function isOpenIrregularPost(post) {
  return post.status === 'scheduled' && !String(post.title || '').trim() && isPostDate(post.publishDate);
}

export function overduePostTabs(firm, today = postTodayKey()) {
  const posts = firm.posts || [];
  return (firm.postTabs || []).filter((tab) => {
    if (normalizePostFrequency(tab.frequency) === 'irregular') {
      return posts.some((post) => post.tabId === tab.id && isOpenIrregularPost(post) && post.publishDate < today);
    }
    return isPostDate(tab.startDate) && tab.startDate < today &&
      postSlots(tab, posts, tab.startDate, today).some((slot) => slot.date < today && !slot.title);
  });
}
