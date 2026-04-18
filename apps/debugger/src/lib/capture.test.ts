import assert from 'node:assert/strict';
import test from 'node:test';
import { captureEntriesToImportResult, matchCaptureHostFilter, type CapturedNetworkEntry } from './capture';

function entry(overrides: Partial<CapturedNetworkEntry> = {}): CapturedNetworkEntry {
  return {
    id: 'cap_1',
    startedAtMs: 1_710_000_000_000,
    finishedAtMs: 1_710_000_000_250,
    type: 'xhr',
    method: 'POST',
    url: 'https://api.example.com/v1/orders?draft=true',
    host: 'api.example.com',
    path: '/v1/orders?draft=true',
    status: 201,
    durationMs: 250,
    targetId: 'target-1',
    targetTitle: 'Checkout',
    targetUrl: 'https://app.example.com/checkout',
    requestHeaders: [{ name: 'content-type', value: 'application/json' }],
    responseHeaders: [{ name: 'content-type', value: 'application/json' }],
    requestBodyText: '{"sku":"demo"}',
    requestBodyTruncated: false,
    responseBodyText: '{"ok":true}',
    responseBodyTruncated: false,
    responseMimeType: 'application/json',
    errorText: null,
    ...overrides
  };
}

test('matchCaptureHostFilter supports exact and suffix rules', () => {
  assert.equal(matchCaptureHostFilter('api.example.com', ['api.example.com']), true);
  assert.equal(matchCaptureHostFilter('edge.api.example.com', ['.example.com']), true);
  assert.equal(matchCaptureHostFilter('example.net', ['.example.com']), false);
});

test('captureEntriesToImportResult prefixes captured folders and preserves examples', () => {
  const result = captureEntriesToImportResult([entry()]);

  assert.equal(result.detectedFormat, 'har');
  assert.equal(result.requests.length, 1);
  assert.deepEqual(result.requests[0]?.folderSegments, ['captured', 'api.example.com']);
  assert.equal(result.requests[0]?.request.examples.length, 1);
  assert.equal(result.requests[0]?.request.examples[0]?.text, '{"ok":true}');
  assert.equal(result.requests[0]?.request.body.text, '{"sku":"demo"}');
});
