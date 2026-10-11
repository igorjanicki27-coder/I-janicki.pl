export const MAX_ROWS = 500;
export const MAX_COLS = 26;
export const MAX_CELL_LENGTH = 10000;

export function columnName(index) {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + (n - 1) % 26) + name;
  return name;
}
export function blankSheet(rows = 30, cols = 8) {
  return { version: 1, name: 'Arkusz 1', cells: Array.from({ length: rows }, () => Array(cols).fill('')) };
}
export function validateSheet(value) {
  if (value?.version !== 1 || typeof value.name !== 'string' || value.name.length > 100 || !Array.isArray(value.cells) || !value.cells.length || value.cells.length > MAX_ROWS) throw new Error('Nieprawidłowy format arkusza.');
  const width = value.cells[0]?.length;
  if (!width || width > MAX_COLS || value.cells.some(row => !Array.isArray(row) || row.length !== width || row.some(cell => typeof cell !== 'string' || cell.length > MAX_CELL_LENGTH))) throw new Error('Nieprawidłowy format komórek.');
  return value;
}
export function normalize(value) {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L').toLocaleLowerCase('pl');
}

// A small parser: formulas never execute JavaScript or HTML.
export function calculate(cells) {
  const cache = new Map();
  const visiting = new Set();
  function valueAt(row, col, depth = 0) {
    const key = `${row}:${col}`;
    if (cache.has(key)) return cache.get(key);
    if (row < 0 || col < 0 || row >= cells.length || col >= cells[0].length) throw new Error('#ADR!');
    if (visiting.has(key) || depth > 100) throw new Error('#CYKL!');
    const raw = cells[row][col];
    if (!raw.startsWith('=')) return raw;
    visiting.add(key);
    let result;
    try { result = parse(raw.slice(1), depth + 1); } catch (error) { result = error.message.startsWith('#') ? error.message : '#FORMUŁA!'; }
    visiting.delete(key);
    cache.set(key, result);
    return result;
  }
  function numeric(value) {
    if (typeof value === 'string' && value.startsWith('#')) throw new Error(value);
    if (String(value).trim() === '') return 0;
    const number = Number(String(value).replace(',', '.'));
    if (!Number.isFinite(number)) throw new Error('#WARTOŚĆ!');
    return number;
  }
  function coordinates(ref) {
    const [, letters, number] = /^([A-Z]+)([1-9]\d*)$/.exec(ref);
    let col = 0;
    for (const letter of letters) col = col * 26 + letter.charCodeAt(0) - 64;
    return [Number(number) - 1, col - 1];
  }
  function parse(source, depth) {
    const tokens = source.toUpperCase().match(/\s+|\d+(?:[.,]\d+)?|[A-ZĄĆĘŁŃÓŚŹŻ]+[1-9]\d*|[A-ZĄĆĘŁŃÓŚŹŻ]+|[+\-*/():;]/g) || [];
    if (tokens.join('') !== source.toUpperCase()) throw new Error('#FORMUŁA!');
    const list = tokens.filter(token => !/^\s+$/.test(token));
    let pos = 0;
    function atom() {
      const token = list[pos++];
      if (token === '+' || token === '-') return (token === '-' ? -1 : 1) * atom();
      if (token === '(') { const number = expression(); if (list[pos++] !== ')') throw new Error('#FORMUŁA!'); return number; }
      if (/^\d+(?:[.,]\d+)?$/.test(token || '')) return numeric(token);
      if (/^[A-Z]+[1-9]\d*$/.test(token || '')) { const [r, c] = coordinates(token); return numeric(valueAt(r, c, depth)); }
      if (['SUM', 'SUMA', 'AVERAGE', 'ŚREDNIA', 'MIN', 'MAX'].includes(token) && list[pos++] === '(') {
        const values = [];
        if (list[pos] !== ')') do {
          if (/^[A-Z]+[1-9]\d*$/.test(list[pos] || '') && list[pos + 1] === ':' && /^[A-Z]+[1-9]\d*$/.test(list[pos + 2] || '')) {
            const [r1, c1] = coordinates(list[pos]); const [r2, c2] = coordinates(list[pos + 2]); pos += 3;
            if (Math.max(r1, r2) >= cells.length || Math.max(c1, c2) >= cells[0].length) throw new Error('#ADR!');
            for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) {
              const value = valueAt(r, c, depth);
              if (String(value).startsWith('#')) throw new Error(value);
              if (String(value).trim() && Number.isFinite(Number(String(value).replace(',', '.')))) values.push(numeric(value));
            }
          } else values.push(expression());
          if (list[pos] !== ';') break;
          pos++;
        } while (true);
        if (list[pos++] !== ')') throw new Error('#FORMUŁA!');
        if (token === 'SUM' || token === 'SUMA') return values.reduce((a, b) => a + b, 0);
        if (!values.length) return 0;
        if (token === 'AVERAGE' || token === 'ŚREDNIA') return values.reduce((a, b) => a + b, 0) / values.length;
        return token === 'MIN' ? Math.min(...values) : Math.max(...values);
      }
      throw new Error('#FORMUŁA!');
    }
    function term() {
      let result = atom();
      while (list[pos] === '*' || list[pos] === '/') { const op = list[pos++]; const next = atom(); if (op === '/' && next === 0) throw new Error('#DZIEL/0!'); result = op === '*' ? result * next : result / next; }
      return result;
    }
    function expression() {
      let result = term();
      while (list[pos] === '+' || list[pos] === '-') { const op = list[pos++]; const next = term(); result = op === '+' ? result + next : result - next; }
      return result;
    }
    const result = expression();
    if (pos !== list.length || !Number.isFinite(result)) throw new Error('#FORMUŁA!');
    return Number(result.toPrecision(12));
  }
  return cells.map((row, r) => row.map((_, c) => { try { return valueAt(r, c); } catch (error) { return error.message; } }));
}

export function matchingRows(cells, values, query) {
  const needle = normalize(query.trim());
  return cells.flatMap((row, r) => !needle || row.some((value, c) => normalize(value).includes(needle) || normalize(values[r][c]).includes(needle)) ? [r] : []);
}

export function parseDelimited(text, delimiter = ';', { maxRows = MAX_ROWS, maxCols = MAX_COLS } = {}) {
  const rows = []; let row = []; let field = ''; let quoted = false; let closed = false;
  text = text.replace(/^\uFEFF/, '');
  const pushField = () => { if (field.length > MAX_CELL_LENGTH || row.length >= maxCols) throw new Error(`Plik przekracza limit ${maxCols} kolumn lub długość komórki.`); row.push(field); field = ''; closed = false; };
  const pushRow = () => { pushField(); rows.push(row); row = []; if (rows.length > maxRows) throw new Error(`Maksymalnie ${maxRows} wierszy.`); };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') { quoted = false; closed = true; }
      else field += ch;
    } else if (ch === '"' && !field && !closed) quoted = true;
    else if (ch === delimiter) pushField();
    else if (ch === '\r' || ch === '\n') { if (ch === '\r' && text[i + 1] === '\n') i++; pushRow(); }
    else { if (closed) throw new Error('Nieprawidłowy format CSV.'); field += ch; }
  }
  if (quoted) throw new Error('Niedomknięty cudzysłów w CSV.');
  if (field || row.length || closed) pushRow();
  if (!rows.length) rows.push(['']);
  const width = Math.max(...rows.map(item => item.length));
  return rows.map(item => [...item, ...Array(width - item.length).fill('')]);
}
export function detectDelimiter(text) {
  let quoted = false;
  const counts = { ';': 0, ',': 0, '\t': 0 };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') i++;
      else quoted = !quoted;
    } else if (!quoted) {
      if (char === '\n' || char === '\r') break;
      if (Object.hasOwn(counts, char)) counts[char]++;
    }
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}
export function exportCsv(cells) {
  return '\uFEFF' + cells.map(row => row.map(cell => '"' + cell.replaceAll('"', '""') + '"').join(';')).join('\r\n');
}
export function pasteCells(sheet, data, row, col) {
  const height = Math.max(sheet.cells.length, row + data.length);
  const width = Math.max(sheet.cells[0].length, col + data[0].length);
  if (height > MAX_ROWS || width > MAX_COLS) throw new Error('Arkusz może mieć maksymalnie 500 wierszy i 26 kolumn.');
  const cells = Array.from({ length: height }, (_, r) => Array.from({ length: width }, (_, c) => sheet.cells[r]?.[c] ?? ''));
  data.forEach((line, r) => line.forEach((value, c) => { cells[row + r][col + c] = value; }));
  return validateSheet({ ...sheet, cells });
}
