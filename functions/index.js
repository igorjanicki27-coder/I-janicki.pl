'use strict';

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret, defineString } = require('firebase-functions/params');
const { logger } = require('firebase-functions');
const { fetchGoogleBusinessReviews } = require('./google-business');

const googleOauthClientId = defineSecret('GOOGLE_BUSINESS_OAUTH_CLIENT_ID');
const googleOauthClientSecret = defineSecret('GOOGLE_BUSINESS_OAUTH_CLIENT_SECRET');
const googleOauthRefreshToken = defineSecret('GOOGLE_BUSINESS_OAUTH_REFRESH_TOKEN');

const googleBusinessAccountId = defineString('GOOGLE_BUSINESS_ACCOUNT_ID');
const googleBusinessLocationId = defineString('GOOGLE_BUSINESS_LOCATION_ID');
const googleBusinessProfileUrl = defineString('GOOGLE_BUSINESS_PROFILE_URL', { default: '' });
const googleBusinessReviewUrl = defineString('GOOGLE_BUSINESS_REVIEW_URL', { default: '' });

exports.googleBusinessReviews = onRequest({
  region: 'europe-west1',
  memory: '256MiB',
  timeoutSeconds: 30,
  maxInstances: 2,
  secrets: [
    googleOauthClientId,
    googleOauthClientSecret,
    googleOauthRefreshToken,
  ],
}, async (request, response) => {
  if (request.method !== 'GET') {
    response.set('Allow', 'GET');
    response.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  try {
    const payload = await fetchGoogleBusinessReviews({
      clientId: googleOauthClientId.value(),
      clientSecret: googleOauthClientSecret.value(),
      refreshToken: googleOauthRefreshToken.value(),
      accountId: googleBusinessAccountId.value(),
      locationId: googleBusinessLocationId.value(),
      profileUrl: googleBusinessProfileUrl.value(),
      reviewUrl: googleBusinessReviewUrl.value(),
    });

    response.set('Cache-Control', 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400');
    response.set('Content-Type', 'application/json; charset=utf-8');
    response.status(200).json(payload);
  } catch (error) {
    logger.error('Google Business Profile reviews request failed', {
      message: error instanceof Error ? error.message : String(error),
      status: Number(error?.status) || null,
    });
    response.set('Cache-Control', 'no-store');
    response.status(503).json({ error: 'google_reviews_unavailable' });
  }
});
