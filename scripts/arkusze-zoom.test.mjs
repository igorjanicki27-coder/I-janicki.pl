import test from 'node:test';
import assert from 'node:assert/strict';
import {clampZoom, fitZoom, readZoomPreferences, tabZoom, rememberTabZoom} from '../arkusze/zoom.mjs';

test('skala ma bezpieczne granice i obsługuje brak zapisanego ustawienia', () => {
  assert.equal(clampZoom(0),25);
  assert.equal(clampZoom(350),300);
  assert.equal(clampZoom(undefined),100);
  assert.equal(clampZoom(82.4),82);
});
test('dopasowanie mieści najszerszy arkusz i zaokrągla w dół', () => {
  assert.equal(fitZoom(368,[900,500,700]),40);
  assert.equal(fitZoom(1000,[700,1500]),66);
  assert.equal(fitZoom(1000,[500]),200);
  assert.equal(fitZoom(1500,[600]),250);
  assert.equal(fitZoom(1500,[100]),300);
});
test('puste wyniki i ukryty widok nie generują nieprawidłowej skali', () => {
  assert.equal(fitZoom(368,[]),100);
  assert.equal(fitZoom(0,[900]),100);
  assert.equal(fitZoom(368,[NaN,0]),100);
  assert.equal(fitZoom(368,[10000]),25);
});

test('osobne skale zakładek przetrwają zapis i ponowny odczyt przeglądarki', () => {
  let preferences = readZoomPreferences(null);
  preferences = rememberTabZoom(preferences, 'a', 'manual', 70);
  preferences = rememberTabZoom(preferences, 'b', 'manual', 130);
  const restored = readZoomPreferences(JSON.stringify(preferences));
  assert.deepEqual(tabZoom(restored, 'a'), {mode:'manual',percent:70});
  assert.deepEqual(tabZoom(restored, 'b'), {mode:'manual',percent:130});
  assert.deepEqual(tabZoom(restored, 'c'), {mode:'fit',percent:100});
  const reset = rememberTabZoom(restored, 'a', 'manual', 100);
  assert.deepEqual(tabZoom(reset, 'b'), {mode:'manual',percent:130});
});
test('tryb Dopasuj jest niezależny i nie nadpisuje ręcznej skali innej zakładki', () => {
  let preferences = rememberTabZoom(readZoomPreferences(null), 'a', 'manual', 80);
  preferences = rememberTabZoom(preferences, 'b', 'fit', 56);
  const restored = readZoomPreferences(JSON.stringify(preferences));
  assert.deepEqual(tabZoom(restored, 'a'), {mode:'manual',percent:80});
  assert.deepEqual(tabZoom(restored, 'b'), {mode:'fit',percent:56});
});
test('stare wspólne ustawienie migruje do jednej zakładki; błędny zapis ma domyślną skalę', () => {
  const legacy = readZoomPreferences('{"mode":"manual","percent":90}');
  assert.deepEqual(legacy.legacy,{mode:'manual',percent:90});
  const migrated = rememberTabZoom(legacy, 'a', legacy.legacy.mode, legacy.legacy.percent);
  assert.equal(migrated.legacy, undefined);
  assert.deepEqual(tabZoom(readZoomPreferences(JSON.stringify(migrated)), 'a'), {mode:'manual',percent:90});
  assert.deepEqual(tabZoom(migrated, 'b'), {mode:'fit',percent:100});
  assert.deepEqual(tabZoom(readZoomPreferences('broken'), 'a'), {mode:'fit',percent:100});
  assert.deepEqual(tabZoom(readZoomPreferences('{"version":2,"tabs":{"a":{"mode":"invalid","percent":70}}}'), 'a'), {mode:'fit',percent:100});
});
