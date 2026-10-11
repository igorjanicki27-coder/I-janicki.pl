import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { blankSheet, exportCsv, parseDelimited } from '../arkusze/model.mjs';
import { createTab, createLayoutDraft, validateWorkbook, parseDate, todayInPoland, coerceValue, formatValue, visibleItems, expiry, dateExpiry, migrateLegacy, csvToTab, tabToCsvRows, migrateCompactLayout, searchWorkbook } from '../arkusze/workbook.mjs';

const seed = JSON.parse(fs.readFileSync(new URL('../arkusze/initial-data.json', import.meta.url), 'utf8'));
test('wczytane 3 wskazane tabele: 37 produktów i zachowane uwagi źródłowe', () => {
  validateWorkbook(seed);
  assert.deepEqual(seed.tabs.map(tab => tab.items.length), [15, 17, 5]);
  assert.deepEqual(seed.tabs.map(tab => tab.sourceFile), ['tabela_produktow_finalna.xlsx', 'tabela_produkty_partia_2.xlsx', 'tabela_produkty_z_etykiet.xlsx']);
  for (const tab of seed.tabs) assert.deepEqual(tab.fields.map(field => field.label), ['Nazwa', 'Nr indeksu', 'Ilość', 'Zamiennik', 'Data']);
  const batch = seed.tabs[1], rubber = seed.tabs[2];
  assert.equal(batch.items[0].values[batch.fields[1].id], 'WT1-310003P0007');
  assert.equal(batch.items[0].values[batch.fields[2].id], '18 szt.');
  assert.equal(batch.items[7].values[batch.fields[1].id], '');
  assert.equal(rubber.items[0].values[rubber.fields[1].id], 'GMN 592004P1360A');
  assert.equal(rubber.items[0].values[rubber.fields[2].id], '150 m');
  assert.equal([batch,rubber].every(tab=>tab.items.every(item=>item.values[tab.fields[4].id]==='')), true);
  assert.equal(seed.tabs[0].note.includes('oddzielnych opakowań'), true);
  assert.equal(seed.tabs.some(tab => tab.items.some(item => Object.values(item.values).some(value => value === 'SUMA ORIENTACYJNA'))), false);
});
test('daty polskie, ISO, dni przestępne i granica dnia w Polsce', () => {
  assert.equal(parseDate('1.12.2020').iso, '2020-12-01');
  assert.equal(parseDate('2024-02-29').iso, '2024-02-29');
  assert.equal(parseDate('31.02.2026'), null);
  assert.equal(parseDate('Nieczytelna'), null);
  assert.equal(todayInPoland(new Date('2026-10-09T23:30:00Z')), '2026-10-10');
});
test('sortowanie: przeterminowane najpierw, najbliższe terminy dalej, nieznane na końcu', () => {
  const tab = createTab(); const date = tab.fields.find(field => field.type === 'date');
  tab.items = ['2026-11-01', '', '2026-10-10', '2020-01-01', '2026-10-09', 'Nieczytelna'].map((value, i) => ({ id: String(i), values: { [date.id]: value } }));
  assert.deepEqual(visibleItems(tab).map(item => item.id), ['3', '4', '2', '0', '1', '5']);
  assert.equal(expiry(tab, tab.items[3], '2026-10-10').kind, 'expired');
  assert.equal(expiry(tab, tab.items[2], '2026-10-10').label, 'Termin dzisiaj');
  assert.equal(expiry(tab, tab.items[0], '2026-10-10').kind, 'soon');
  assert.equal(expiry(tab, tab.items[5], '2026-10-10').kind, 'unknown');
});
test('wybrana rubryka daty steruje sortowaniem, sortowanie nie zmienia źródła', () => {
  const tab = createTab(); const date1 = tab.fields.find(field => field.type === 'date');
  const date2 = {id:'druga-data',label:'Termin drugiej partii',type:'date'}; tab.fields.push(date2); tab.sortDateFieldId = date2.id;
  tab.items = [{id:'a',values:{[date1.id]:'2020-01-01',[date2.id]:'2030-01-01'}},{id:'b',values:{[date1.id]:'2030-01-01',[date2.id]:'2020-01-01'}}];
  assert.deepEqual(visibleItems(tab).map(item=>item.id), ['b','a']);
  assert.deepEqual(tab.items.map(item=>item.id), ['a','b']);
});
test('ceny są liczbami, daty normalizowane, brak daty nie staje się datą', () => {
  const price={label:'Cena',type:'price'}, date={label:'Termin',type:'date'};
  assert.equal(coerceValue(price,'1 234,50 zł'),1234.5);
  assert.equal(formatValue(price,1234.5).replace(/\s/g,''),'1234,50zł');
  assert.equal(coerceValue(date,'10.10.2026'),'2026-10-10');
  assert.equal(coerceValue(date,'Nieczytelna'),'Nieczytelna');
  assert.throws(()=>coerceValue(date,'31.02.2026'), /datę/);
  assert.throws(()=>coerceValue(price,'abc'), /kwotę/);
});
test('wyszukiwanie obejmuje widoczne rubryki, indeksy i polskie daty', () => {
  const tab=seed.tabs[0];
  assert.equal(visibleItems(tab,'7500').length,0);
  assert.equal(visibleItems(tab,'HAQN400004P0008A').length,2);
  const dated=createTab(); dated.items=[{id:'dated',values:{[dated.fields[4].id]:'2020-12-01'}}];
  assert.equal(visibleItems(dated,'01.12.2020').length,1);
  assert.equal(visibleItems(tab,'opak.').length > 0,true);
  assert.equal(visibleItems(tab,'nieczytelna').length > 0,true);
});
test('migracja starego arkusza zachowuje dane i oryginalne formuły', () => {
  const old=blankSheet(2,2);old.cells=[['Nazwa','Wartość'],['Produkt','=2*3']];
  const book=migrateLegacy(old);assert.equal(book.tabs[0].items.length,2);
  assert.equal(book.tabs[0].items[1].legacyRawValues[1],'=2*3');
  assert.equal(Object.values(book.tabs[0].items[1].values)[1],'6');
  assert.deepEqual(old.cells,[['Nazwa','Wartość'],['Produkt','=2*3']]);
});
test('CSV odtwarza schemat, ceny, daty i niepewne opisy', () => {
  const original=seed.tabs[0];const rows=parseDelimited(exportCsv(tabToCsvRows(original)));
  const tab=csvToTab(rows,'Import');
  assert.deepEqual(tab.fields.map(field=>field.type),original.fields.map(field=>field.type));
  assert.deepEqual(tab.items.map(item=>Object.values(item.values)), original.items.map(item=>original.fields.map(field=>item.values[field.id] ?? '')));
});
test('zakładka bez daty zachowuje kolejność, kopia przechowuje ukryte rubryki', () => {
  const tab=createTab('Indeksy'); tab.fields.pop(); tab.sortDateFieldId='';
  tab.items=[{id:'a',values:{[tab.fields[0].id]:'Zeta'}},{id:'b',values:{[tab.fields[0].id]:'Alfa'}}];
  assert.deepEqual(visibleItems(tab).map(item=>item.id),['a','b']);
  const hidden=tab.fields.pop(); tab.archivedFields=[hidden]; tab.items[0].values[hidden.id]='zachowana wartość';
  const copy=JSON.parse(JSON.stringify({version:2,activeTabId:tab.id,tabs:[tab]}));
  validateWorkbook(copy); assert.equal(copy.tabs[0].archivedFields[0].label,'Zamiennik');
  assert.equal(copy.tabs[0].items[0].values[hidden.id],'zachowana wartość');
});

test('uproszczenie istniejącego zapisu zachowuje produkty, dane i ustawienia po ponownym otwarciu', () => {
  const original = {version:2, activeTabId:'tab', tabs:[{id:'tab',name:'Moje produkty',fields:[
    {id:'name',label:'Produkt',type:'name'}, {id:'qty',label:'Pojemność / ilość',type:'other'},
    {id:'date',label:'Termin ważności',type:'date'}, {id:'price',label:'Cena',type:'price'}
  ],sortDateFieldId:'date',items:[{id:'item',values:{name:'Produkt A',qty:'2 szt.',date:'2020-01-01',price:123}}]}]};
  const migrated = migrateCompactLayout(original), tab = migrated.tabs[0];
  assert.deepEqual(tab.fields.map(field=>field.label), ['Nazwa','Nr indeksu','Ilość','Zamiennik','Data']);
  assert.equal(tab.items[0].values[tab.fields[0].id], 'Produkt A');
  assert.equal(tab.items[0].values[tab.fields[2].id], '2 szt.');
  assert.equal(tab.items[0].values[tab.fields[4].id], '2020-01-01');
  assert.equal(tab.items[0].values[tab.fields[1].id], undefined);
  assert.equal(tab.archivedFields[0].id, 'price');
  assert.equal(tab.items[0].values.price, 123);
  assert.equal(original.tabs[0].fields.length,4);
  tab.fields[0].label='Własna nazwa';
  assert.equal(migrateCompactLayout(migrated),migrated);
  assert.equal(tab.fields[0].label,'Własna nazwa');
});

test('wyszukiwanie przeszukuje wszystkie zakładki i zachowuje źródło wyniku', () => {
  const book = {...seed, activeTabId:seed.tabs[2].id};
  const groups = searchWorkbook(book,'640');
  assert.deepEqual(groups.map(group=>group.tab.id),[seed.tabs[0].id]);
  assert.deepEqual(groups.map(group=>group.items.length),[1]);
  assert.equal(groups[0].items[0],seed.tabs[0].items[1]);
  assert.deepEqual(searchWorkbook(book,'WT1-').map(group=>group.tab.id),[seed.tabs[1].id]);
  assert.deepEqual(searchWorkbook(book,'GMN').map(group=>group.tab.id),[seed.tabs[2].id]);
  assert.equal(searchWorkbook(book,'haqn400004p0008a')[0].items.length,2);
  assert.deepEqual(searchWorkbook(book,'produkt nieistniejący'),[]);
  assert.equal(book.activeTabId,seed.tabs[2].id);
});

test('pusty układ ma jedną nienazwaną kolumnę, a kopia zachowuje układ bez danych źródła', () => {
  const empty = createLayoutDraft();
  assert.equal(empty.fields.length, 1);
  assert.equal(empty.fields[0].label, '');
  assert.equal(empty.sortDateFieldId, '');
  const source = createTab('Źródło');
  source.fields.push({ id: 'druga-data', label: 'Drugi termin', type: 'date' });
  source.sortDateFieldId = 'druga-data';
  source.items.push({ id: 'produkt', values: { [source.fields[0].id]: 'Nie kopiować' } });
  source.archivedFields = [{ id: 'archiwum', label: 'Ukryta', type: 'other' }];
  const before = structuredClone(source), copy = createLayoutDraft(source);
  assert.deepEqual(copy.fields.map(({ label, type }) => ({ label, type })), source.fields.map(({ label, type }) => ({ label, type })));
  assert.equal(copy.fields.some(field => source.fields.some(original => original.id === field.id)), false);
  assert.equal(copy.sortDateFieldId, copy.fields.at(-1).id);
  copy.fields[0].label = 'Zmieniona';
  assert.deepEqual(source, before);
  const newTab = { id: 'nowa', name: 'Kopia', ...copy, items: [] };
  validateWorkbook({ version: 2, activeTabId: newTab.id, tabs: [source, newTab] });
  assert.equal(newTab.items.length, 0);
  assert.equal(newTab.archivedFields, undefined);
});

test('ocena każdej daty: po terminie, dziś i do 30 dni, dalszy termin bez ostrzeżenia', () => {
  const today = '2026-10-10';
  assert.equal(dateExpiry('2026-10-09', today).kind, 'expired');
  assert.equal(dateExpiry('2026-10-10', today).kind, 'soon');
  assert.equal(dateExpiry('2026-11-09', today).kind, 'soon');
  assert.equal(dateExpiry('2026-11-10', today).kind, 'valid');
  assert.equal(dateExpiry('', today).kind, 'unknown');
  assert.equal(dateExpiry('Nieczytelna', today).kind, 'unknown');
});
