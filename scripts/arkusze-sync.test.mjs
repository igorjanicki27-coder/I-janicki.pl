import test from 'node:test';
import assert from 'node:assert/strict';
import { blankWorkbook } from '../arkusze/workbook.mjs';
import { encodeWorkbook, decodeRemote, nextRemote, keepActiveTab, SyncConflict } from '../arkusze/sync-model.mjs';

test('wspólny zapis zachowuje rubryki, produkty i wersję', () => {
  const book = blankWorkbook();
  book.tabs[0].items.push({ id: 'produkt', values: { [book.tabs[0].fields[0].id]: 'Środek A' } });
  const remote = decodeRemote(nextRemote(book, 3, 3));
  assert.equal(remote.revision, 4);
  assert.deepEqual(remote.book, book);
  assert.throws(() => decodeRemote({ revision: 1, payload: '{}' }), /zapis/);
});
test('nieaktualna edycja z innego urządzenia nie nadpisuje nowszego zapisu', () => {
  const book = blankWorkbook();
  assert.throws(() => nextRemote(book, 2, 3), SyncConflict);
  assert.equal(nextRemote(book, 3, 3).revision, 4);
});
test('zmiana zakładki jest własnym widokiem urządzenia', () => {
  const book = blankWorkbook(), second = blankWorkbook().tabs[0];
  book.tabs.push(second);
  assert.equal(keepActiveTab(book, second.id).activeTabId, second.id);
  assert.equal(book.activeTabId, book.tabs[0].id);
  assert.equal(keepActiveTab(book, 'usunięta').activeTabId, book.activeTabId);
});
test('limit rozmiaru liczony w bajtach chroni zapis Firebase przed odrzuceniem', () => {
  const book = blankWorkbook();
  const field = book.tabs[0].fields[0].id;
  book.tabs[0].items = Array.from({ length: 80 }, (_, i) => ({ id: String(i), values: { [field]: 'ą'.repeat(8000) } }));
  assert.throws(() => encodeWorkbook(book), /700 kB/);
});
