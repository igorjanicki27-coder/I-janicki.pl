import { keepActiveTab, SyncConflict } from './sync-model.mjs?v=9';
import { columnName } from './model.mjs?v=2';
import { FIELD_TYPES, MAX_FIELDS, MAX_ITEMS, MAX_TABS, uid, blankWorkbook, createLayoutDraft, validateWorkbook, parseDate, coerceValue, formatValue, itemTitle, dateExpiry, visibleItems, migrateLegacy, searchWorkbook, todayInPoland, migrateCompactLayout } from './workbook.mjs?v=9';

const $ = id => document.getElementById(id);
const DATA_KEY = 'ijanicki_arkusze_v2';
const LEGACY_KEY = 'ijanicki_arkusze_v1';
const SESSION_KEY = 'ijanicki_arkusze_session';
const LOCK_KEY = 'ijanicki_arkusze_pin';
const digits = [...document.querySelectorAll('.pin-digits input')];
let unlockedUntil = 0;
let verifying = false;
let book = blankWorkbook();
let loading = false, cloudReady = false, writeBusy = false;
let cloud = null, cloudClosing = Promise.resolve(), cloudRevision = 0, editingRevision = 0;
let lockState = { attempts: 0, until: 0 };
let searchTimer;
let editingTabId = null, editingItemId = null, editingItemTabId = null;
let draftFields = [];
let tabEditorStep = 'details', appliedLayout = null;
let savedDay = todayInPoland();
try { const stored = JSON.parse(localStorage.getItem(LOCK_KEY)); if (stored && Number.isFinite(stored.attempts) && Number.isFinite(stored.until)) lockState = stored; } catch {}
try { unlockedUntil = Number(sessionStorage.getItem(SESSION_KEY)) || 0; } catch {}
function storeLock() { try { localStorage.setItem(LOCK_KEY, JSON.stringify(lockState)); } catch {} }
function notice(message) { $('notice').textContent = message; $('notice').hidden = !message; }
function pinStatus() {
  const remaining = lockState.until - Date.now();
  digits.forEach(input => { input.disabled = remaining > 0 || verifying; });
  if (remaining > 0) $('pin-message').textContent = `Spróbuj ponownie za ${Math.ceil(remaining / 1000)} s.`;
  else if ($('pin-message').textContent.startsWith('Spróbuj')) { $('pin-message').textContent = 'Wpisz pin, aby odblokować.'; digits[0].focus(); }
}
async function checkPin() {
  if (verifying || lockState.until > Date.now() || digits.some(input => !input.value)) return;
  verifying = true;
  pinStatus();
  try {
    const connection = await getCloud();
    const result = await connection.unlock(digits.map(input => input.value).join(''));
    if (result.ok) {
      lockState = { attempts: 0, until: 0 }; storeLock();
      unlockedUntil = result.unlockUntil;
      try { sessionStorage.setItem(SESSION_KEY, String(unlockedUntil)); } catch {}
      await openSheet();
    } else {
      lockState = { attempts: 5 - result.attemptsLeft, until: result.until }; storeLock();
      $('pin-message').textContent = `Nieprawidłowy PIN. Pozostało prób: ${result.attemptsLeft}.`;
    }
  } catch { $('pin-message').textContent = 'Nie udało się połączyć z Firebase. Sprawdź połączenie i spróbuj ponownie.'; }
  finally { verifying = false; digits.forEach(input => { input.value = ''; }); pinStatus(); if (!$('gate').hidden && lockState.until <= Date.now()) digits[0].focus(); }
}
digits.forEach((input, index) => {
  input.addEventListener('input', () => {
    const text = input.value.replace(/\D/g, '');
    if (text.length > 1) {
      digits.forEach((digit, i) => { digit.value = text[i] || ''; });
      digits[Math.min(text.length, 3)].focus();
    } else { input.value = text.slice(-1); if (input.value) digits[index + 1]?.focus(); }
    checkPin();
  });
  input.addEventListener('paste', event => {
    event.preventDefault();
    if (verifying || lockState.until > Date.now()) return;
    const code = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    digits.forEach((digit, i) => { digit.value = code[i] || ''; });
    digits[Math.min(code.length, 3)].focus(); checkPin();
  });
  input.addEventListener('keydown', event => {
    if (event.key === 'Backspace' && !input.value && index > 0) { event.preventDefault(); digits[index - 1].value = ''; digits[index - 1].focus(); }
    if (event.key === 'ArrowLeft' && index > 0) { event.preventDefault(); digits[index - 1].focus(); }
    if (event.key === 'ArrowRight' && index < 3) { event.preventDefault(); digits[index + 1].focus(); }
  });
});
$('pin-form').addEventListener('submit', event => { event.preventDefault(); checkPin(); });

async function getCloud() {
  await cloudClosing;
  if (!cloud) cloud = await import('./firebase-sync.mjs?v=9');
  return cloud;
}
function receiveRemote(remote) {
  if (remote.revision < cloudRevision) return;
  book = keepActiveTab(remote.book, book.activeTabId); cloudRevision = remote.revision;
  if (!$('workspace').hidden) render();
}
async function initialWorkbook() {
  const stored = localStorage.getItem(DATA_KEY);
  if (stored) return migrateCompactLayout(validateWorkbook(JSON.parse(stored)));
  const response = await fetch('./initial-data.json?v=10');
  if (!response.ok) throw new Error('Nie udało się wczytać tabel początkowych.');
  const initial = validateWorkbook(await response.json());
  const legacy = localStorage.getItem(LEGACY_KEY);
  if (legacy) {
    const previous = migrateLegacy(JSON.parse(legacy));
    if (previous.tabs[0].items.length) { initial.tabs.push(previous.tabs[0]); initial.layoutRevision = 0; }
  }
  return migrateCompactLayout(initial);
}
async function openSheet() {
  if (loading) return;
  loading = true;
  try {
    const connection = await getCloud();
    let remote = await connection.read();
    if (!remote) remote = await connection.initialize(await initialWorkbook());
    if (!unlockedUntil || Date.now() >= unlockedUntil) return;
    receiveRemote(remote); cloudReady = true;
    $('gate').hidden = true; $('workspace').hidden = false;
    connection.watch(receiveRemote, () => {
      cloudReady = false;
      notice('Utracono połączenie z Firebase. Odśwież stronę, aby ponownie połączyć arkusze.');
    });
    render(); $('search').focus();
  } catch {
    cloudReady = false; unlockedUntil = 0;
    try { sessionStorage.removeItem(SESSION_KEY); } catch {}
    $('workspace').hidden = true; $('gate').hidden = false;
    $('pin-message').textContent = 'Wpisz pin, aby odblokować.';
  } finally { loading = false; }
}
function closeSheet() {
  clearTimeout(searchTimer);
  for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
  unlockedUntil = 0; cloudReady = false;
  if (cloud) cloudClosing = cloud.close().catch(() => {});
  cloud = null; cloudRevision = 0;
  try { sessionStorage.removeItem(SESSION_KEY); } catch {}
  $('workspace').hidden = true; $('gate').hidden = false;
  $('pin-message').textContent = 'Wpisz pin, aby odblokować.';
  $('grid').replaceChildren(); $('search-results').replaceChildren(); $('tabs').replaceChildren(); $('tab-select').replaceChildren();
  $('search').value = '';
  $('item-fields').replaceChildren(); $('field-editor').replaceChildren(); $('tab-name').value = '';
  closeAddMenu(); digits[0].focus();
}
$('logout').addEventListener('click', closeSheet);
setInterval(() => {
  pinStatus();
  if (unlockedUntil && Date.now() >= unlockedUntil) closeSheet();
  const today = todayInPoland();
  if (today !== savedDay && !$('workspace').hidden) { savedDay = today; renderContent(); }
}, 1000);

async function update(next, expectedRevision = editingRevision) {
  validateWorkbook(next);
  if (!cloudReady) throw new Error('Brak połączenia z Firebase. Odśwież stronę przed zapisaniem zmian.');
  if (writeBusy) throw new Error('Poczekaj na zakończenie poprzedniego zapisu.');
  writeBusy = true;
  const buttons = [...document.querySelectorAll('dialog button[type="submit"]')];
  buttons.forEach(button => { button.disabled = true; });
  try {
    receiveRemote(await cloud.write(next, expectedRevision));
  } catch (error) {
    if (error instanceof SyncConflict) {
      try { receiveRemote(await cloud.read()); } catch {}
      throw error;
    }
    throw new Error('Nie zapisano zmian w Firebase. Sprawdź połączenie i spróbuj ponownie.');
  } finally { writeBusy = false; buttons.forEach(button => { button.disabled = false; }); }
}
function activeTab() { return book.tabs.find(tab => tab.id === book.activeTabId); }
async function updateTab(tab) { await update({ ...book, tabs: book.tabs.map(current => current.id === tab.id ? tab : current) }); }
function node(tag, className, text) {
  const element = document.createElement(tag); if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
function button(text, className, action, label) {
  const element = node('button', className, text); element.type = 'button';
  if (label) element.setAttribute('aria-label', label);
  element.addEventListener('click', action); return element;
}
function option(value, text) { const element = node('option', '', text); element.value = value; return element; }
function setActive(id) {
  book = { ...book, activeTabId: id }; $('search').value = ''; closeAddMenu(); render();
}
function render() {
  const tabs = $('tabs'), select = $('tab-select'); tabs.replaceChildren(); select.replaceChildren();
  for (const tab of book.tabs) {
    const tabButton = button(tab.name, tab.id === book.activeTabId ? 'tab active' : 'tab', () => setActive(tab.id));
    tabButton.setAttribute('aria-current', tab.id === book.activeTabId ? 'page' : 'false'); tabs.append(tabButton);
    select.append(option(tab.id, tab.name));
  }
  select.value = book.activeTabId;
  $('new-tab').disabled = book.tabs.length >= MAX_TABS;
  $('new-item').disabled = activeTab().items.length >= MAX_ITEMS;
  renderContent();
}
function editButton(tab, item) {
  return button('✎', 'edit-icon', () => openItem(item.id, tab.id), `Edytuj pozycję: ${itemTitle(tab, item)}`);
}
function renderTable(table, tab, items) {
  table.setAttribute('aria-label', `Arkusz: ${tab.name}`);
  const today = todayInPoland();
  const cols = node('colgroup');
  const widths = ['--number-width', ...tab.fields.map(() => null), '--action-width'];
  for (const width of widths) {
    const col = node('col');
    if (width) col.style.width = `var(${width})`;
    cols.append(col);
  }
  const head = node('thead'), header = node('tr');
  const corner = node('th', 'row-number', '#'); corner.scope = 'col'; header.append(corner);
  tab.fields.forEach((field, c) => {
    const th = node('th'); th.scope = 'col'; th.append(node('span', 'column-letter', columnName(c)), node('span', 'column-label', field.label)); header.append(th);
  });
  const actionsHead = node('th', 'action-column'); actionsHead.scope = 'col';
  const fieldsEdit = button('✎', 'edit-icon', () => openTabEditor(false, tab.id), `Edytuj kolumny: ${tab.name}`); fieldsEdit.title = 'Edytuj kolumny';
  actionsHead.append(fieldsEdit); header.append(actionsHead); head.append(header);
  const body = node('tbody');
  items.forEach((item, index) => {
    const row = node('tr');
    const number = node('th', 'row-number', String(index + 1)); number.scope = 'row'; row.append(number);
    tab.fields.forEach(field => {
      const cell = node('td', `type-${field.type}`);
      cell.append(node('span', 'cell-value', formatValue(field, item.values[field.id])));
      if (field.type === 'date') {
        const status = dateExpiry(item.values[field.id], today);
        if (status.kind === 'expired' || status.kind === 'soon') cell.classList.add(`date-${status.kind}`);
        if (status.kind === 'expired') row.classList.add('item-expired');
        cell.title = status.label;
      }
      row.append(cell);
    });
    const editCell = node('td', 'action-column'); editCell.append(editButton(tab, item)); row.append(editCell); body.append(row);
  });
  table.replaceChildren(cols, head, body);
}
function renderContent() {
  const query = $('search').value, searching = !!query.trim();
  const groups = searching ? searchWorkbook(book, query) : [{ tab: activeTab(), items: visibleItems(activeTab()) }];
  const results = $('search-results'); results.replaceChildren(); results.hidden = !searching;
  $('clear-search').hidden = !query;
  $('table-wrapper').hidden = searching;
  if (searching) {
    $('grid').replaceChildren();
    for (const { tab, items } of groups) {
      const section = node('section', 'search-result'); section.dataset.tabId = tab.id;
      const heading = node('h2'); heading.append(button(tab.name, 'quiet', () => setActive(tab.id), `Otwórz zakładkę: ${tab.name}`));
      const wrapper = node('div', 'table-wrapper'); wrapper.tabIndex = 0; wrapper.setAttribute('role', 'region'); wrapper.setAttribute('aria-label', `Wyniki w zakładce: ${tab.name}`);
      const table = node('table'); renderTable(table, tab, items); wrapper.append(table); section.append(heading, wrapper); results.append(section);
    }
  } else renderTable($('grid'), groups[0].tab, groups[0].items);
  const hasItems = groups.some(group => group.items.length);
  $('empty-state').hidden = hasItems;
  $('empty-title').textContent = searching ? 'Brak pasujących pozycji' : 'Twój arkusz jest gotowy';
  $('empty-text').textContent = searching ? 'Nie znaleziono pozycji w żadnej zakładce.' : 'Dodaj pierwszą pozycję przyciskiem +.';
  $('empty-add').hidden = searching;
}
$('tab-select').addEventListener('change', () => setActive($('tab-select').value));
$('search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(renderContent, 100); });
$('clear-search').addEventListener('click', () => { clearTimeout(searchTimer); $('search').value = ''; renderContent(); $('search').focus(); });
function closeAddMenu() { $('add-menu').hidden = true; $('floating-add').setAttribute('aria-expanded', 'false'); }
$('floating-add').addEventListener('click', () => {
  const open = $('add-menu').hidden; $('add-menu').hidden = !open; $('floating-add').setAttribute('aria-expanded', String(open));
  if (open) $('new-item').focus();
});
document.addEventListener('click', event => { if (!event.target.closest('#add-menu, #floating-add')) closeAddMenu(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeAddMenu(); });
$('new-tab').addEventListener('click', () => openTabEditor(true));
$('new-item').addEventListener('click', () => openItem());
$('empty-add').addEventListener('click', () => openItem());
for (const close of document.querySelectorAll('.close-dialog')) close.addEventListener('click', () => close.closest('dialog').close());

function readDraftFields() {
  for (const row of $('field-editor').children) {
    const field = draftFields.find(field => field.id === row.dataset.id);
    if (field) { field.label = row.querySelector('input').value; field.type = row.querySelector('select').value; }
  }
}
function renderDateChoice() {
  const select = $('sort-date-field'), previous = select.value;
  const dates = draftFields.slice(0, Number($('field-count').value)).filter(field => field.type === 'date');
  select.replaceChildren(...dates.map(field => option(field.id, field.label || 'Data')));
  select.value = dates.some(field => field.id === previous) ? previous : dates[0]?.id || '';
  $('sort-date-choice').hidden = dates.length < 2;
}
function renderFields() {
  const count = Math.max(1, Math.min(MAX_FIELDS, Number($('field-count').value) || 1));
  $('field-count').value = count;
  while (draftFields.length < count) draftFields.push({ id: uid(), label: `Kolumna ${columnName(draftFields.length)}`, type: 'other' });
  const list = $('field-editor'); list.replaceChildren();
  draftFields.slice(0, count).forEach((field, i) => {
    const row = node('div', 'field-row'); row.dataset.id = field.id;
    const number = node('span', 'field-index', columnName(i));
    const label = node('label', '', 'Nazwa kolumny'); const input = node('input'); input.value = field.label; input.required = true; input.maxLength = 100; input.placeholder = 'Np. Nazwa'; input.setAttribute('aria-label', `Nazwa kolumny ${columnName(i)}`); label.append(input);
    const typeLabel = node('label', '', 'Rodzaj'); const select = node('select'); select.setAttribute('aria-label', `Rodzaj kolumny ${columnName(i)}`);
    for (const [value, text] of Object.entries(FIELD_TYPES)) select.append(option(value, text)); select.value = field.type; typeLabel.append(select);
    input.addEventListener('input', () => { field.label = input.value; renderDateChoice(); });
    select.addEventListener('change', () => { field.type = select.value; renderDateChoice(); });
    row.append(number, label, typeLabel); list.append(row);
  });
  $('schema-warning').hidden = !editingTabId || count >= book.tabs.find(tab => tab.id === editingTabId).fields.length;
  renderDateChoice();
}
function showTabStep(step) {
  tabEditorStep = step;
  const choosing = step === 'layout';
  $('layout-step').hidden = !choosing;
  $('tab-details').hidden = choosing; $('tab-details').disabled = choosing;
  $('layout-next').hidden = !choosing;
  $('layout-back').hidden = !!editingTabId || choosing;
  $('tab-save').hidden = choosing;
  $('tab-step').hidden = !!editingTabId;
  $('tab-step').textContent = choosing ? 'Krok 1 z 2 · Wybierz układ kolumn' : 'Krok 2 z 2 · Nazwij zakładkę i dopasuj kolumny';
  $('tab-error').hidden = true;
}
function openTabEditor(isNew = false, tabId = book.activeTabId) {
  closeAddMenu();
  if (isNew && book.tabs.length >= MAX_TABS) { notice('Możesz utworzyć maksymalnie 30 zakładek.'); return; }
  editingRevision = cloudRevision;
  editingTabId = isNew ? null : tabId;
  appliedLayout = null;
  $('tab-dialog-title').textContent = isNew ? 'Nowa zakładka' : 'Edytuj zakładkę i kolumny';
  if (isNew) {
    $('template').replaceChildren(option('blank', 'Pusty'), ...book.tabs.map(tab => option(tab.id, tab.name)));
    $('tab-name').value = `Arkusz ${book.tabs.length + 1}`;
    draftFields = []; $('field-editor').replaceChildren(); $('field-count').value = 1;
    $('sort-date-field').replaceChildren();
    showTabStep('layout');
  } else {
    const tab = book.tabs.find(tab => tab.id === tabId);
    $('tab-name').value = tab.name;
    draftFields = [...tab.fields, ...(tab.archivedFields || [])].map(field => ({ ...field })); $('field-count').value = tab.fields.length;
    renderFields(); $('sort-date-field').value = tab.sortDateFieldId || $('sort-date-field').value;
    showTabStep('details');
  }
  $('tab-dialog').showModal();
  (isNew ? $('template') : $('tab-name')).focus();
}
function advanceLayout() {
  const selected = $('template').value;
  const source = selected === 'blank' ? null : book.tabs.find(tab => tab.id === selected);
  if (selected !== 'blank' && !source) {
    $('tab-error').textContent = 'Wybrana zakładka już nie istnieje. Wybierz inny układ.'; $('tab-error').hidden = false; return;
  }
  if (selected !== appliedLayout) {
    const layout = createLayoutDraft(source);
    draftFields = layout.fields; $('field-count').value = layout.fields.length;
    renderFields(); $('sort-date-field').value = layout.sortDateFieldId;
    appliedLayout = selected;
  }
  showTabStep('details'); $('tab-name').focus();
}
$('layout-next').addEventListener('click', advanceLayout);
$('layout-back').addEventListener('click', () => { readDraftFields(); showTabStep('layout'); $('template').focus(); });
$('field-count').addEventListener('change', () => { readDraftFields(); renderFields(); });
$('field-count').addEventListener('input', () => {
  const count = Number($('field-count').value);
  if (!$('field-count').value || !Number.isInteger(count) || count < 1 || count > MAX_FIELDS) return;
  readDraftFields(); renderFields();
});
$('tab-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (tabEditorStep === 'layout') { advanceLayout(); return; }
  readDraftFields();
  const count = Number($('field-count').value);
  if (!Number.isInteger(count) || count < 1 || count > MAX_FIELDS) return;
  if (draftFields.length < count) { renderFields(); return; }
  const fields = draftFields.slice(0, count).map(field => ({ ...field, label: field.label.trim() }));
  const name = $('tab-name').value.trim();
  if (!name || fields.some(field => !field.label)) { $('tab-error').textContent = 'Podaj nazwę zakładki i każdej kolumny.'; $('tab-error').hidden = false; return; }
  const chosenDate = fields.find(field => field.type === 'date' && field.id === $('sort-date-field').value);
  const sortDateFieldId = chosenDate?.id || fields.find(field => field.type === 'date')?.id || '';
  try {
    if (editingRevision !== cloudRevision) throw new SyncConflict();
    if (editingTabId) {
      const tab = book.tabs.find(tab => tab.id === editingTabId);
      const fieldIds = new Set(fields.map(field => field.id));
      const archivedFields = [...tab.fields, ...(tab.archivedFields || [])].filter(field => !fieldIds.has(field.id));
      const items = tab.items.map(item => {
        const values = { ...item.values };
        for (const field of fields) {
          try { values[field.id] = coerceValue(field, values[field.id] ?? ''); } catch {}
        }
        return { ...item, values };
      });
      await updateTab({ ...tab, name, fields, sortDateFieldId, archivedFields, items });
    }
    else {
      const tab = { id: uid(), name, fields, sortDateFieldId, items: [] };
      $('search').value = '';
      await update({ ...book, activeTabId: tab.id, tabs: [...book.tabs, tab] });
      book.activeTabId = tab.id; render();
    }
    $('tab-dialog').close();
  } catch (error) { $('tab-error').textContent = error.message; $('tab-error').hidden = false; }
});
function openItem(id = null, tabId = book.activeTabId) {
  closeAddMenu(); const tab = book.tabs.find(tab => tab.id === tabId);
  editingRevision = cloudRevision;
  editingItemTabId = tab.id;
  if (!id && tab.items.length >= MAX_ITEMS) { notice('Maksymalnie 2000 pozycji w zakładce.'); return; }
  editingItemId = id; const item = tab.items.find(item => item.id === id);
  $('item-dialog-title').textContent = item ? 'Edytuj pozycję' : 'Nowa pozycja';
  $('item-error').hidden = true; const list = $('item-fields'); list.replaceChildren();
  for (const field of tab.fields) {
    const label = node('label', 'item-field', field.label);
    const input = node(field.type === 'other' ? 'textarea' : 'input');
    input.name = field.id; input.maxLength = 10000; input.autocomplete = 'off';
    const raw = item?.values[field.id] ?? '';
    input.value = field.type === 'date' && parseDate(raw) ? formatValue(field, raw) : String(raw);
    if (field.type === 'name') { input.required = true; input.placeholder = 'Nazwa produktu'; }
    if (field.type === 'price') { input.inputMode = 'decimal'; input.placeholder = '0,00'; }
    if (field.type === 'date') { input.placeholder = 'DD.MM.RRRR lub opis, np. Nieczytelna'; label.append(node('span', 'form-hint', 'Data ważności albo opis, jeśli termin jest nieznany.')); }
    input.setAttribute('aria-label', field.label); label.append(input); list.append(label);
  }
  $('item-dialog').showModal(); list.querySelector('input,textarea')?.focus();
}
$('item-form').addEventListener('submit', async event => {
  event.preventDefault(); const tab = book.tabs.find(tab => tab.id === editingItemTabId), previous = tab.items.find(item => item.id === editingItemId);
  const values = { ...previous?.values };
  try {
    if (editingRevision !== cloudRevision) throw new SyncConflict();
    for (const field of tab.fields) {
      const raw = $('item-fields').querySelector(`[name="${CSS.escape(field.id)}"]`).value;
      // Imported uncertain values remain unchanged when another field is edited.
      const old = previous?.values[field.id];
      const oldDisplay = field.type === 'date' && parseDate(old) ? formatValue(field, old) : String(old ?? '');
      values[field.id] = previous && raw === oldDisplay ? old ?? '' : coerceValue(field, raw);
    }
    if (!Object.values(values).some(value => String(value).trim())) throw new Error('Uzupełnij przynajmniej jedną kolumnę.');
    const item = { ...previous, id: editingItemId || uid(), values };
    const items = previous ? tab.items.map(current => current.id === item.id ? item : current) : [...tab.items, item];
    await updateTab({ ...tab, items }); $('item-dialog').close();
    if (!previous && $('search').value.trim()) { $('search').value = ''; renderContent(); }
    notice(previous ? 'Zapisano zmiany pozycji.' : 'Dodano pozycję.');
  } catch (error) { $('item-error').textContent = error.message; $('item-error').hidden = false; }
});
if (unlockedUntil > Date.now()) openSheet(); else { unlockedUntil = 0; pinStatus(); digits[0].focus(); }
