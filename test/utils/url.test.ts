import assert from 'node:assert/strict';
import test from 'node:test';

import { extractUrlFromOnclick } from '../../src/pkg/utils/url.ts';

test('extracts http URLs embedded in onclick handlers', () => {
    assert.equal(
        extractUrlFromOnclick("download('https://example.com/files/app.apk?token=abc')"),
        'https://example.com/files/app.apk?token=abc',
    );
});

test('stops extracted URLs at quotes, parentheses, or whitespace', () => {
    assert.equal(extractUrlFromOnclick('location.href="https://example.com/file.zip"'), 'https://example.com/file.zip');
    assert.equal(extractUrlFromOnclick('open(https://example.com/file.zip)'), 'https://example.com/file.zip');
    assert.equal(extractUrlFromOnclick('go https://example.com/file.zip now'), 'https://example.com/file.zip');
});

test('returns null when onclick does not contain a web URL', () => {
    assert.equal(extractUrlFromOnclick('return false'), null);
    assert.equal(extractUrlFromOnclick(''), null);
});
