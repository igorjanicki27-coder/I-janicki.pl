import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fetchGoogleBusinessReviews,
  mapReview,
  normalizeResourceId,
} from './google-business-reviews.mjs';

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

test('fetchGoogleBusinessReviews requests and returns only five newest reviews', async () => {
  const calls = [];
  const reviews = Array.from({ length: 8 }, (_, index) => ({
    reviewId: String(index + 1),
    starRating: index === 0 ? 'FIVE' : 'FOUR',
    reviewer: { displayName: `Klient ${index + 1}` },
    updateTime: `2026-10-0${Math.min(index + 1, 9)}T10:00:00Z`,
  }));
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('oauth2.googleapis.com')) {
      return new Response(JSON.stringify({ access_token: 'access-token' }), { status: 200 });
    }
    return new Response(JSON.stringify({
      averageRating: 4.8,
      totalReviewCount: 28,
      reviews,
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
    reviewUrl: 'https://g.page/r/example/review',
    maxReviews: 5,
  });

  assert.equal(result.averageRating, 4.8);
  assert.equal(result.totalReviewCount, 28);
  assert.equal(result.reviews.length, 5);
  assert.equal(calls.length, 2);
  assert.match(calls[1].url, /accounts\/123\/locations\/456\/reviews/);
  assert.match(calls[1].url, /pageSize=5/);
  assert.match(calls[1].url, /orderBy=updateTime\+desc/);
  assert.equal(calls[1].options.headers.Authorization, 'Bearer access-token');
});
