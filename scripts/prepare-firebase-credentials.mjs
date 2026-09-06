import { promises as fs } from 'node:fs';
import path from 'node:path';

const directJson = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
const base64Json = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 || '').trim();
const expectedProjectId = String(process.env.FIREBASE_PROJECT_ID || 'i-janicki').trim();
const runnerTemp = String(process.env.RUNNER_TEMP || '').trim();
const githubEnv = String(process.env.GITHUB_ENV || '').trim();

if (!directJson && !base64Json) {
  throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 secret.');
}

if (!runnerTemp || !githubEnv) {
  throw new Error('This credentials helper must run inside GitHub Actions.');
}

let serviceAccountJson;
try {
  serviceAccountJson = directJson || Buffer.from(base64Json, 'base64').toString('utf8');
  const serviceAccount = JSON.parse(serviceAccountJson);

  if (serviceAccount.type !== 'service_account') {
    throw new Error('The supplied credentials are not a Google service account.');
  }
  if (serviceAccount.project_id !== expectedProjectId) {
    throw new Error(`Service account belongs to ${serviceAccount.project_id || 'an unknown project'}, expected ${expectedProjectId}.`);
  }
  if (!serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error('Service account JSON is missing client_email or private_key.');
  }
} catch (error) {
  throw new Error(`Invalid Firebase service account secret: ${error.message}`);
}

const credentialsPath = path.join(runnerTemp, 'i-janicki-firebase-service-account.json');
await fs.writeFile(credentialsPath, serviceAccountJson, { encoding: 'utf8', mode: 0o600 });
await fs.appendFile(
  githubEnv,
  `GOOGLE_APPLICATION_CREDENTIALS=${credentialsPath}\nGOOGLE_CLOUD_PROJECT=${expectedProjectId}\nGCLOUD_PROJECT=${expectedProjectId}\n`,
  'utf8'
);

console.log(`Firebase credentials prepared for project ${expectedProjectId}.`);
