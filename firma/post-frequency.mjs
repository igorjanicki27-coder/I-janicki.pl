const FREQUENCY_ALIASES = new Map([
  ['weekly', 'weekly'],
  ['raz w tygodniu', 'weekly'],
  ['co tydzien', 'weekly'],
  ['biweekly', 'biweekly'],
  ['raz na 2 tygodnie', 'biweekly'],
  ['co 2 tygodnie', 'biweekly'],
  ['monthly', 'monthly'],
  ['raz w miesiacu', 'monthly'],
  ['co miesiac', 'monthly'],
  ['irregular', 'irregular'],
  ['irregularly', 'irregular'],
  ['nieregularnie', 'irregular'],
  ['nieregularna', 'irregular'],
  ['nieregularny', 'irregular'],
  ['brak', 'irregular'],
  ['wylaczone', 'irregular'],
]);

function frequencyKey(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('pl-PL')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

export function normalizePostFrequency(value, fallback = 'monthly') {
  return FREQUENCY_ALIASES.get(frequencyKey(value)) || fallback;
}

export function isIrregularPostFrequency(value) {
  return normalizePostFrequency(value) === 'irregular';
}
