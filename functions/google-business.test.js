'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  fetchGoogleBusinessReviews,
  mapReview,
  normalizeResourceId,
} = require('./google-business');

test('normalizeResourceId accepts plain and resource-form IDs', () => {
  assert.equal(normalizeResourceId('123', 'accounts'), '123');
  assert.equal(normalizeResourceId('accounts/123', 'accounts'), '123');
  assert.equal(normalizeResourceId('/locations/456/', 'locations'), '456');
});

test('mapReview converts Google rating and anonymous author safely', () => {
  assert.deepEqual(mapReview({
    reviewId: 'review-1',
    reviewer: { isAnonymous: true, displayName: 'Hidden' },
    starRating: 'FIVE',
    comment: 'Polecam',
    createTime: '2026-10-01T10:00:00Z',
  }, 'https://example.com/profile'), {
    id: 'review-1',
    authorName: 'Użytkownik Google',
    authorPhotoUrl: '',
    rating: 5,
    comment: 'Polecam',
    createTime: '2026-10-01T10:00:00Z',
    updateTime: '2026-10-01T10:00:00Z',
    sourceUrl: 'https://example.com/profile',
  });
});

test('fetchGoogleBusinessReviews refreshes OAuth and joins paginated reviews', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('oauth2.googleapis.com')) {
      return new Response(JSON.stringify({ access_token: 'access-token' }), { status: 200 });
    }
    const secondPage = String(url).includes('pageToken=next');
    return new Response(JSON.stringify(secondPage ? {
      reviews: [{ reviewId: '2', starRating: 'FOUR', reviewer: { displayName: 'B' } }],
    } : {
      averageRating: 4.5,
      totalReviewCount: 2,
      nextPageToken: 'next',
      reviews: [{ reviewId: '1', starRating: 'FIVE', reviewer: { displayName: 'A' } }],
    }), { status: 200 });
  };

  const result = await fetchGoogleBusinessReviews({
    fetchImpl,
    clientId: 'client-id',
    clientSecret: 'client-secret',
    refreshToken: 'refresh-token',
    accountId: 'accounts/123',
    locationId: 'locations/456',
    profileUrl: 'https://example.com/profile',
  });

  assert.equal(result.averageRating, 4.5);
  assert.equal(result.totalReviewCount, 2);
  assert.deepEqual(result.reviews.map((review) => review.rating), [5, 4]);
  assert.equal(calls.length, 3);
  assert.match(calls[1].url, /accounts\/123\/locations\/456\/reviews/);
  assert.equal(calls[1].options.headers.Authorization, 'Bearer access-token');
});
