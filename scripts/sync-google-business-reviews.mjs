import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fetchGoogleBusinessReviews } from './google-business-reviews.mjs';

const requiredEnvironment = [
  'GOOGLE_BUSINESS_OAUTH_CLIENT_ID',
  'GOOGLE_BUSINESS_OAUTH_CLIENT_SECRET',
  'GOOGLE_BUSINESS_OAUTH_REFRESH_TOKEN',
  'GOOGLE_BUSINESS_ACCOUNT_ID',
  'GOOGLE_BUSINESS_LOCATION_ID',
  'GOOGLE_REVIEWS_OUTPUT_PATH',
];

const missing = requiredEnvironment.filter((name) => !String(process.env[name] || '').trim());
if (missing.length) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

const outputPath = path.resolve(process.env.GOOGLE_REVIEWS_OUTPUT_PATH);
const payload = await fetchGoogleBusinessReviews({
  clientId: process.env.GOOGLE_BUSINESS_OAUTH_CLIENT_ID,
  clientSecret: process.env.GOOGLE_BUSINESS_OAUTH_CLIENT_SECRET,
  refreshToken: process.env.GOOGLE_BUSINESS_OAUTH_REFRESH_TOKEN,
  accountId: process.env.GOOGLE_BUSINESS_ACCOUNT_ID,
  locationId: process.env.GOOGLE_BUSINESS_LOCATION_ID,
  profileUrl: process.env.GOOGLE_BUSINESS_PROFILE_URL,
  reviewUrl: process.env.GOOGLE_BUSINESS_REVIEW_URL,
  maxReviews: 5,
});

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, {
  encoding: 'utf8',
  mode: 0o600,
});

console.log(`Prepared ${payload.reviews.length} Google review(s) for Firebase.`);
