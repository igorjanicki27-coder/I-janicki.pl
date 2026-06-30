import { readFile } from 'node:fs/promises';

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

const firebaseConfig = await readJson('firebase.kalkulator.json');
const firebaseRc = await readJson('.firebaserc');
const projectId = firebaseRc.projects?.default;
const targetSites = firebaseRc.targets?.[projectId]?.hosting?.kalkulator || [];

if (firebaseConfig.hosting?.public !== 'kalkulator') {
  fail('Refusing deploy: firebase.kalkulator.json must publish only the kalkulator directory.');
}

if (firebaseConfig.hosting?.target !== 'kalkulator') {
  fail('Refusing deploy: firebase.kalkulator.json must use the kalkulator hosting target.');
}

if (!Array.isArray(targetSites) || targetSites.length === 0) {
  fail(
    [
      'Refusing deploy: missing Firebase Hosting target "kalkulator".',
      'Create a separate Firebase Hosting site first, then map it, for example:',
      'firebase hosting:sites:create i-janicki-kalkulator',
      'firebase target:apply hosting kalkulator i-janicki-kalkulator',
    ].join('\n')
  );
}

if (targetSites.includes(projectId)) {
  fail(`Refusing deploy: target "kalkulator" points to the main hosting site "${projectId}".`);
}

console.log(`Kalkulator deploy target OK: ${targetSites.join(', ')}`);
