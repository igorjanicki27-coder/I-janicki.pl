import { normalize, validateSheet, calculate } from './model.mjs?v=2';

export const FIELD_TYPES = { name: 'Nazwa', price: 'Cena', date: 'Data', other: 'Inne' };
export const MAX_FIELDS = 32;
export const MAX_ITEMS = 2000;
export const MAX_TABS = 30;
export const uid = () => crypto.randomUUID();
export const COMPACT_FIELDS = [['Nazwa', 'name'], ['Nr indeksu', 'other'], ['Ilość', 'other'], ['Zamiennik', 'other'], ['Data', 'date']];
export const TEMPLATES = { blank: { label: 'Czysty arkusz', fields: COMPACT_FIELDS } };
// Apply the requested layout once, including already saved browser workbooks.
export function migrateCompactLayout(book) {
  validateWorkbook(book);
  if (book.layoutRevision === 1) return book;
  const tabs = book.tabs.map(tab => {
    const used = new Set();
    const fields = COMPACT_FIELDS.map(([label, type], index) => {
      const matches = field => index === 0 ? field.type === 'name' || /nazwa|produkt/i.test(field.label)
        : index === 1 ? /indeks/i.test(field.label)
        : index === 2 ? /ilość|ilosc|pojemność|pojemnosc/i.test(field.label)
        : index === 3 ? /zamiennik/i.test(field.label)
        : field.type === 'date' || /data|termin|sled/i.test(field.label);
      const previous = tab.fields.find(field => !used.has(field.id) && matches(field));
      const id = previous?.id || uid(); used.add(id);
      return { id, label, type };
    });
    const archivedFields = [...tab.fields, ...(tab.archivedFields || [])].filter(field => !used.has(field.id));
    return { ...tab, fields, archivedFields, sortDateFieldId: fields[4].id };
  });
  return validateWorkbook({ ...book, tabs, layoutRevision: 1 });
}
export function createTab(name = 'Arkusz 1', template = 'blank') {
  const fields = TEMPLATES[template].fields.map(([label, type]) => ({ id: uid(), label, type }));
  return { id: uid(), name, fields, items: [], sortDateFieldId: fields.find(field => field.type === 'date')?.id || '' };
}
export function createLayoutDraft(source = null) {
  if (!source) return { fields: [{ id: uid(), label: '', type: 'other' }], sortDateFieldId: '' };
  const fields = source.fields.map(field => ({ ...field, id: uid() }));
  const sortIndex = source.fields.findIndex(field => field.id === source.sortDateFieldId && field.type === 'date');
  return { fields, sortDateFieldId: fields[sortIndex]?.id || fields.find(field => field.type === 'date')?.id || '' };
}
export function blankWorkbook() {
  const tab = createTab();
  return { version: 2, activeTabId: tab.id, tabs: [tab] };
}
export function validateWorkbook(book) {
  const fail = () => { throw new Error('Nieprawidłowy zapis zakładek lub pozycji.'); };
  const text = (value, limit) => typeof value === 'string' && value.length <= limit;
  const unique = list => new Set(list.map(value => value.id)).size === list.length;
  if (book?.version !== 2 || !Array.isArray(book.tabs) || !book.tabs.length || book.tabs.length > MAX_TABS) fail();
  for (const tab of book.tabs) {
    if (!text(tab.id, 100) || !text(tab.name, 100) || !tab.name.trim() || !Array.isArray(tab.fields) || !tab.fields.length || tab.fields.length > MAX_FIELDS || !Array.isArray(tab.items) || tab.items.length > MAX_ITEMS) fail();
    if (tab.archivedFields && (!Array.isArray(tab.archivedFields) || tab.archivedFields.length > MAX_FIELDS)) fail();
    const allFields = [...tab.fields, ...(tab.archivedFields || [])];
    if (!unique(allFields) || !unique(tab.items)) fail();
    for (const field of allFields) if (!text(field.id, 100) || !text(field.label, 100) || !field.label.trim() || !Object.hasOwn(FIELD_TYPES, field.type)) fail();
    if (tab.note !== undefined && !text(tab.note, 10000) || tab.sourceFile !== undefined && !text(tab.sourceFile, 200)) fail();
    if (tab.sortDateFieldId && !tab.fields.some(field => field.id === tab.sortDateFieldId && field.type === 'date')) fail();
    for (const item of tab.items) {
      if (!text(item.id, 100) || !item.values || typeof item.values !== 'object' || Array.isArray(item.values)) fail();
      for (const [id, value] of Object.entries(item.values)) if (!text(id, 100) || !(text(value, 10000) || typeof value === 'number' && Number.isFinite(value))) fail();
    }
  }
  if (!unique(book.tabs) || !book.tabs.some(tab => tab.id === book.activeTabId)) fail();
  return book;
}
export function parseDate(value) {
  const text = String(value ?? '').trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const polish = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(text);
  if (!iso && !polish) return null;
  const [, year, month, day] = iso || [polish[0], polish[3], polish[2], polish[1]];
  const y = Number(year), m = Number(month), d = Number(day);
  if (y < 1900 || y > 9999) return null;
  const timestamp = Date.UTC(y, m - 1, d);
  const date = new Date(timestamp);
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return { iso: `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, timestamp };
}
export function todayInPoland(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export function coerceValue(field, input) {
  const value = String(input).trim();
  if (value.length > 10000) throw new Error(`${field.label}: maksymalnie 10000 znaków.`);
  if (field.type === 'price' && value) {
    const normalized = value.replace(/\s/g, '').replace(/(?:zł|PLN)$/i, '').replace(',', '.');
    if (!/^-?\d+(?:\.\d+)?$/.test(normalized) || !Number.isFinite(Number(normalized))) throw new Error(`${field.label}: wpisz kwotę, np. 123,50.`);
    return Number(normalized);
  }
  if (field.type === 'date' && value) {
    const parsed = parseDate(value);
    if (parsed) return parsed.iso;
    if (/^[\d\s./-]+$/.test(value)) throw new Error(`${field.label}: wpisz poprawną datę DD.MM.RRRR.`);
  }
  return value;
}
export function formatValue(field, value) {
  if (value === '' || value === undefined) return '—';
  if (field.type === 'price' && typeof value === 'number') return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(value);
  const date = field.type === 'date' ? parseDate(value) : null;
  if (date) return date.iso.split('-').reverse().join('.');
  return String(value);
}
export function itemTitle(tab, item) {
  const field = tab.fields.find(field => field.type === 'name') || tab.fields[0];
  return String(item.values[field.id] || 'Pozycja bez nazwy');
}
export function expiry(tab, item, today = todayInPoland()) {
  const field = tab.fields.find(field => field.id === tab.sortDateFieldId) || tab.fields.find(field => field.type === 'date');
  if (!field) return null;
  return dateExpiry(item.values[field.id], today);
}
export function dateExpiry(value, today = todayInPoland()) {
  const date = parseDate(value);
  if (!date) return { kind: 'unknown', label: 'Termin nieznany' };
  const days = Math.round((date.timestamp - parseDate(today).timestamp) / 86400000);
  if (days < 0) return { kind: 'expired', label: 'Przeterminowane', days };
  if (days === 0) return { kind: 'soon', label: 'Termin dzisiaj', days };
  if (days <= 30) return { kind: 'soon', label: `Ważne jeszcze ${days} ${days === 1 ? 'dzień' : 'dni'}`, days };
  return { kind: 'valid', label: 'W terminie', days };
}
export function visibleItems(tab, query = '', sort = 'date') {
  const needle = normalize(query.trim());
  const filtered = tab.items.filter(item => !needle || tab.fields.some(field => normalize(item.values[field.id] ?? '').includes(needle) || normalize(formatValue(field, item.values[field.id])).includes(needle)));
  const dateField = tab.fields.find(field => field.id === tab.sortDateFieldId) || tab.fields.find(field => field.type === 'date');
  if (sort === 'name') return [...filtered].sort((a, b) => itemTitle(tab, a).localeCompare(itemTitle(tab, b), 'pl'));
  if (sort !== 'date' || !dateField) return filtered;
  return [...filtered].sort((a, b) => (parseDate(a.values[dateField.id])?.timestamp ?? Infinity) - (parseDate(b.values[dateField.id])?.timestamp ?? Infinity));
}
export function searchWorkbook(book, query) {
  return book.tabs.map(tab => ({ tab, items: visibleItems(tab, query) })).filter(group => group.items.length);
}
export function migrateLegacy(legacy) {
  validateSheet(legacy);
  const tab = createTab(legacy.name || 'Arkusz 1');
  const calculated = calculate(legacy.cells);
  tab.fields = legacy.cells[0].map((_, c) => ({ id: uid(), label: `Kolumna ${c + 1}`, type: c === 0 ? 'name' : 'other' }));
  tab.items = legacy.cells.flatMap((row, r) => row.some(value => value.trim()) ? [{ id: uid(), values: Object.fromEntries(tab.fields.map((field, c) => [field.id, String(calculated[r][c])])), legacyRawValues: [...row] }] : []);
  tab.sortDateFieldId = '';
  return validateWorkbook({ version: 2, activeTabId: tab.id, tabs: [tab] });
}
export function csvToTab(rows, name) {
  const headers = rows[0];
  const fields = headers.map((label, c) => {
    let type = /cena|wartość|kwota/i.test(label) ? 'price' : /data|termin|sled/i.test(label) ? 'date' : /nazwa|produkt/i.test(label) ? 'name' : 'other';
    if (!headers.some(header => /nazwa|produkt/i.test(header)) && c === 0) type = 'name';
    return { id: uid(), label: label.trim() || `Kolumna ${c + 1}`, type };
  });
  if (fields.length > MAX_FIELDS || rows.length - 1 > MAX_ITEMS) throw new Error('Przekroczono limit kolumn lub wierszy.');
  const items = rows.slice(1).filter(row => row.some(value => value.trim())).map(row => ({ id: uid(), values: Object.fromEntries(fields.map((field, c) => {
    let value = row[c] ?? '';
    try { value = coerceValue(field, value); } catch { /* Preserve uncertain source values. */ }
    return [field.id, value];
  })) }));
  return { id: uid(), name: name.slice(0, 100) || 'Import', fields, items, sortDateFieldId: fields.find(field => field.type === 'date')?.id || '' };
}
export function tabToCsvRows(tab) {
  return [tab.fields.map(field => field.label), ...tab.items.map(item => tab.fields.map(field => String(item.values[field.id] ?? '')))];
}
