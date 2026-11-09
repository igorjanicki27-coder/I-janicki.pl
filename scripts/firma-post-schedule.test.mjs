import assert from 'node:assert/strict';
import test from 'node:test';
import { overduePostTabs, postSlots, postTodayKey } from '../firma/post-schedule.mjs';
import { getPostReminderDigest } from './firma-post-reminders.mjs';

const monthly = { id: 'google', name: 'Google', frequency: 'monthly', startDate: '2026-01-31' };
const firm = (tab, posts = []) => ({ id: 'firma', postTabs: [tab], posts });
const publication = (id, publishDate, title, extra = {}) => ({
  id, tabId: 'google', status: 'published', publishDate, title, ...extra,
});

test('a monthly schedule keeps the start day after short months', () => {
  const dates = postSlots(monthly, [], '2026-01-01', '2026-04-30').map(({ date }) => date);
  assert.deepEqual(dates, ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  assert.equal(postTodayKey(new Date('2026-10-31T23:30:00Z')), '2026-11-01');
});

test('existing titles fill one slot per article and a cleared slot stays empty', () => {
  const weekly = { ...monthly, frequency: 'weekly', startDate: '2026-01-03' };
  const posts = [
    publication('early', '2026-01-08', 'Opublikowano wcześniej'),
    publication('exact', '2026-01-10', 'Na czas'),
    publication('draft', '2026-01-17', 'Szkic', { status: 'scheduled' }),
    publication('cleared', '2026-01-24', '', { slotDate: '2026-01-24' }),
  ];
  const slots = postSlots(weekly, posts, '2026-01-01', '2026-01-31');
  assert.deepEqual(slots.map(({ title }) => title), ['Opublikowano wcześniej', 'Na czas', 'Szkic', '', '']);
  assert.deepEqual(postSlots(weekly, posts, '2026-01-17', '2026-01-31'), slots.slice(2));
  assert.equal(overduePostTabs(firm(weekly, posts), '2026-01-18').length, 0);
});

test('missing titles trigger at 14 and 7 days, once per stage, with catch-up', () => {
  const client = firm({ ...monthly, startDate: '2026-11-23' });
  const scan = (today) => getPostReminderDigest([client], today).reminders;
  assert.equal(scan('2026-11-08').length, 0);
  assert.equal(scan('2026-11-09')[0].days, 14);
  client.postReminderKeys = [scan('2026-11-10')[0].reminderKey];
  assert.equal(scan('2026-11-11').length, 0);
  assert.equal(scan('2026-11-16')[0].days, 7);
  client.posts.push(publication('filled', '2026-11-12', 'Gotowe', { slotDate: '2026-11-23' }));
  assert.equal(scan('2026-11-16').length, 0);
});

test('Monday summary gives the next empty slot for every firm, and excludes overdue schedules', () => {
  const client = firm({ ...monthly, startDate: '2026-11-23' }, [
    publication('first', '2026-11-01', 'Gotowe', { slotDate: '2026-11-23' }),
  ]);
  const other = { id: 'inna', postTabs: [{ ...monthly, frequency: 'irregular' }] };
  const scan = (today) => getPostReminderDigest([client, other], today);
  const today = '2026-11-09';
  const { allClear } = scan(today);
  assert.deepEqual(allClear.statuses.map(({ next }) => next?.date), ['2026-12-23', undefined]);
  assert.equal(scan('2026-11-10').allClear, null);
  client.postReminderKeys = [allClear.reminderKey];
  assert.equal(scan(today).allClear, null);
  client.posts = [];
  assert.equal(scan('2026-11-30').allClear, null);
  assert.equal(scan('2026-11-30').reminders[0].days, -7);
});

test('dated irregular entries with no title use the same reminder windows', () => {
  const tab = { ...monthly, frequency: 'irregular', startDate: '2026-12-01' };
  const dateOnly = (id) => publication(id, '2026-11-23', '', { status: 'scheduled' });
  const client = firm(tab, [dateOnly('one'), dateOnly('two'), publication('filled', '2026-11-23', 'Gotowe')]);
  const scan = (today) => getPostReminderDigest([client], today);
  assert.equal(scan('2026-11-02').allClear.statuses[0].next.date, '2026-11-23');
  const first = scan('2026-11-09');
  assert.equal(first.allClear, null);
  assert.deepEqual(first.reminders.map(({ days }) => days), [14, 14]);
  assert.notEqual(first.reminders[0].reminderKey, first.reminders[1].reminderKey);
  client.postReminderKeys = first.reminders.map(({ reminderKey }) => reminderKey);
  assert.equal(scan('2026-11-10').reminders.length, 0);
  assert.deepEqual(scan('2026-11-16').reminders.map(({ days }) => days), [7, 7]);
  assert.equal(overduePostTabs(client, '2026-11-24').length, 1);
  client.posts[0].title = 'Uzupełniono';
  client.posts[1].publishDate = '';
  assert.equal(scan('2026-11-16').reminders.length, 0);
  assert.equal(overduePostTabs(client, '2026-11-24').length, 0);
});
