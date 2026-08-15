import assert from 'node:assert/strict';
import test from 'node:test';

import {
    EDGEDL_MESSAGE_SOURCE,
    isAria2RuntimeMessage,
    isDownloadRequestMessage,
} from '../../src/pkg/browser/messages.ts';

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

test('validates aria2 runtime messages', () => {
    assert.equal(
        isAria2RuntimeMessage({
            referer: 'https://example.com/page',
            source: EDGEDL_MESSAGE_SOURCE,
            type: 'aria2-add-uri',
            url: 'https://example.com/file.zip',
        }),
        true,
    );
    assert.equal(isAria2RuntimeMessage({ source: EDGEDL_MESSAGE_SOURCE, type: 'aria2-test-connection' }), true);
    assert.equal(isAria2RuntimeMessage({ source: EDGEDL_MESSAGE_SOURCE, type: 'aria2-add-uri', url: null }), false);
    assert.equal(isAria2RuntimeMessage({ source: 'page', type: 'aria2-test-connection' }), false);
    assert.equal(
        isAria2RuntimeMessage({
            referer: 123,
            source: EDGEDL_MESSAGE_SOURCE,
            type: 'aria2-add-uri',
            url: 'https://example.com/file.zip',
        }),
        false,
    );
    assert.equal(
        isAria2RuntimeMessage({
            referer: { href: 'https://example.com/page' },
            source: EDGEDL_MESSAGE_SOURCE,
            type: 'aria2-add-uri',
            url: 'https://example.com/file.zip',
        }),
        false,
    );
    assert.equal(isAria2RuntimeMessage({ source: EDGEDL_MESSAGE_SOURCE, type: 'aria2-add-uri' }), false);
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
