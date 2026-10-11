import { validateWorkbook } from './workbook.mjs?v=9';

export const MAX_SYNC_BYTES = 700000;
export class SyncConflict extends Error {
  constructor() {
    super('Arkusz zmieniono na innym urządzeniu. Zamknij edycję i otwórz ją ponownie, aby pracować na aktualnych danych.');
    this.name = 'SyncConflict';
  }
}
export function encodeWorkbook(book) {
  validateWorkbook(book);
  const payload = JSON.stringify(book);
  if (new TextEncoder().encode(payload).length > MAX_SYNC_BYTES) throw new Error('Arkusze przekraczają limit wielkości wspólnego zapisu (700 kB).');
  return payload;
}
export function decodeRemote(data) {
  if (!data || !Number.isSafeInteger(data.revision) || data.revision < 1 || typeof data.payload !== 'string') throw new Error('Nieprawidłowy zapis arkuszy w Firebase.');
  return { revision: data.revision, book: validateWorkbook(JSON.parse(data.payload)) };
}
export function nextRemote(book, expectedRevision, currentRevision) {
  if (expectedRevision !== currentRevision) throw new SyncConflict();
  return { revision: currentRevision + 1, payload: encodeWorkbook(book) };
}
export function keepActiveTab(incoming, activeId) {
  return { ...incoming, activeTabId: incoming.tabs.some(tab => tab.id === activeId) ? activeId : incoming.activeTabId };
}
