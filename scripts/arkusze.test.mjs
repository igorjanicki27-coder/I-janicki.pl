import test from 'node:test';
import assert from 'node:assert/strict';
import { blankSheet, validateSheet, columnName, calculate, matchingRows, parseDelimited, detectDelimiter, exportCsv, pasteCells } from '../arkusze/model.mjs';

test('formuły, polskie liczby, zakresy i zależności', () => {
  const cells = [['2,5', '3', '=A1+B1*2', '=SUMA(A1:B2)'], ['4', 'tekst', '=ŚREDNIA(A1:A2)', '=MIN(A1;A2)+MAX(B1:B2)']];
  assert.deepEqual(calculate(cells), [['2,5', '3', 8.5, 9.5], ['4', 'tekst', 3.25, 5.5]]);
});
test('błędy, cykle i brak wykonywania kodu', () => {
  const result = calculate([['=B1', '=A1', '=1/0', '=Z99', '=alert(1)', '=1+bad', '=SUMA(A1:B1)']])[0];
  assert.deepEqual(result, ['#CYKL!', '#CYKL!', '#DZIEL/0!', '#ADR!', '#FORMUŁA!', '#FORMUŁA!', '#CYKL!']);
});
test('wyszukiwanie obejmuje każdą kolumnę i wyniki, ignoruje polskie znaki', () => {
  const cells = [['Jan', 'Łódź', '10', '=C1*2'], ['Anna', 'Środa Śląska', '5', '=C2+1']];
  const values = calculate(cells);
  assert.deepEqual(matchingRows(cells, values, 'lodz'), [0]);
  assert.deepEqual(matchingRows(cells, values, 'slaska'), [1]);
  assert.deepEqual(matchingRows(cells, values, '20'), [0]);
  assert.deepEqual(matchingRows(cells, values, 'brak'), []);
  assert.deepEqual(matchingRows(cells, values, ''), [0, 1]);
});
test('CSV zachowuje cudzysłowy, delimitery, nowe linie, puste komórki i formuły', () => {
  const cells = [['Środa; Łódź', '"cytat"', 'pierwsza\ndruga', ''], ['=SUMA(A1:A2)', '', '', 'ostatnia']];
  assert.deepEqual(parseDelimited(exportCsv(cells)), cells);
  assert.equal(detectDelimiter('"a,b,c";druga\r\n1;2'), ';');
  assert.equal(detectDelimiter('a,b,c\n1,2,3'), ',');
  assert.throws(() => parseDelimited('"niedomknięty'), /cudzysłów/);
  assert.throws(() => parseDelimited('"tekst"x'), /CSV/);
});
test('wklejenie prostokąta rozszerza arkusz bez utraty danych', () => {
  const sheet = blankSheet(2, 2); sheet.cells[0][0] = 'zachowaj';
  const next = pasteCells(sheet, parseDelimited('a\tb\nc\td', '\t'), 1, 1);
  assert.deepEqual(next.cells, [['zachowaj', '', ''], ['', 'a', 'b'], ['', 'c', 'd']]);
  assert.equal(sheet.cells.length, 2);
  assert.throws(() => pasteCells(sheet, [['x']], 500, 0), /500/);
  assert.throws(() => parseDelimited(Array(27).fill('x').join(';')), /26/);
});
test('walidacja zapisu i nazwy kolumn', () => {
  assert.equal(columnName(25), 'Z'); assert.equal(columnName(26), 'AA');
  assert.throws(() => validateSheet({ version: 1, name: 'test', cells: [['a'], []] }));
  assert.throws(() => validateSheet({ version: 1, name: 'test', cells: [[{}]] }));
  assert.equal(validateSheet(blankSheet()).cells.length, 30);
});
