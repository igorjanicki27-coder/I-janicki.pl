'use strict';

const STAR_RATINGS = Object.freeze({
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
});

function normalizeResourceId(value, prefix) {
  const normalized = String(value || '').trim().replace(/^\/+|\/+$/g, '');
  if (!normalized) return '';
  return normalized.startsWith(`${prefix}/`)
    ? normalized.slice(prefix.length + 1)
    : normalized;
}

function normalizePublicUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

function mapReview(review, profileUrl) {
  const reviewer = review?.reviewer || {};
  const rating = STAR_RATINGS[review?.starRating] || 0;

  return {
    id: String(review?.reviewId || ''),
    authorName: reviewer.isAnonymous
      ? 'Użytkownik Google'
      : String(reviewer.displayName || 'Użytkownik Google'),
    authorPhotoUrl: normalizePublicUrl(reviewer.profilePhotoUrl),
    rating,
    comment: String(review?.comment || ''),
    createTime: String(review?.createTime || review?.updateTime || ''),
    updateTime: String(review?.updateTime || review?.createTime || ''),
    sourceUrl: profileUrl,
  };
}

async function readJson(response, serviceName) {
  if (!response.ok) {
    const error = new Error(`${serviceName} returned HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

async function exchangeRefreshToken({ fetchImpl, clientId, clientSecret, refreshToken }) {
  const response = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await readJson(response, 'Google OAuth');
  if (!data.access_token) throw new Error('Google OAuth response has no access token');
  return data.access_token;
}

async function fetchGoogleBusinessReviews({
  fetchImpl = fetch,
  clientId,
  clientSecret,
  refreshToken,
  accountId,
  locationId,
  profileUrl = '',
  reviewUrl = '',
  maxPages = 20,
}) {
  const account = normalizeResourceId(accountId, 'accounts');
  const location = normalizeResourceId(locationId, 'locations');
  if (!clientId || !clientSecret || !refreshToken || !account || !location) {
    throw new Error('Google Business Profile configuration is incomplete');
  }

  const accessToken = await exchangeRefreshToken({
    fetchImpl,
    clientId,
    clientSecret,
    refreshToken,
  });

  const reviews = [];
  let pageToken = '';
  let averageRating = 0;
  let totalReviewCount = 0;
  const safeProfileUrl = normalizePublicUrl(profileUrl);
  const safeReviewUrl = normalizePublicUrl(reviewUrl);

  for (let page = 0; page < maxPages; page += 1) {
    const endpoint = new URL(
      `https://mybusiness.googleapis.com/v4/accounts/${encodeURIComponent(account)}/locations/${encodeURIComponent(location)}/reviews`,
    );
    endpoint.searchParams.set('pageSize', '50');
    endpoint.searchParams.set('orderBy', 'updateTime desc');
    if (pageToken) endpoint.searchParams.set('pageToken', pageToken);

    const response = await fetchImpl(endpoint, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await readJson(response, 'Google Business Profile');

    if (page === 0) {
      averageRating = Number(data.averageRating) || 0;
      totalReviewCount = Number(data.totalReviewCount) || 0;
    }
    reviews.push(...(Array.isArray(data.reviews) ? data.reviews : []));

    pageToken = String(data.nextPageToken || '');
    if (!pageToken) break;
  }

  return {
    source: 'google_business_profile',
    averageRating,
    totalReviewCount,
    profileUrl: safeProfileUrl,
    reviewUrl: safeReviewUrl || safeProfileUrl,
    reviews: reviews.map((review) => mapReview(review, safeProfileUrl)),
    fetchedAt: new Date().toISOString(),
  };
}

module.exports = {
  STAR_RATINGS,
  fetchGoogleBusinessReviews,
  mapReview,
  normalizePublicUrl,
  normalizeResourceId,
};
