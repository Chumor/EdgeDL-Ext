import assert from 'node:assert/strict';
import test from 'node:test';

import { EDGEDL_MESSAGE_SOURCE, isDownloadRequestMessage } from '../../src/pkg/browser/messages.ts';

test('validates download request messages with an optional explicit control flag', () => {
    const message = {
        source: EDGEDL_MESSAGE_SOURCE,
        type: 'download-request',
        url: 'https://example.com/download',
    };

    assert.equal(isDownloadRequestMessage(message), true);
    assert.equal(isDownloadRequestMessage({ ...message, explicitControl: true }), true);
    assert.equal(isDownloadRequestMessage({ ...message, explicitControl: false }), true);
});

test('rejects malformed download request messages', () => {
    const message = {
        source: EDGEDL_MESSAGE_SOURCE,
        type: 'download-request',
        url: 'https://example.com/download',
    };

    assert.equal(isDownloadRequestMessage(null), false);
    assert.equal(isDownloadRequestMessage({ ...message, source: 'page' }), false);
    assert.equal(isDownloadRequestMessage({ ...message, type: 'navigation-allowed' }), false);
    assert.equal(isDownloadRequestMessage({ ...message, url: null }), false);
    assert.equal(isDownloadRequestMessage({ ...message, explicitControl: 'true' }), false);
});
