import assert from 'node:assert/strict';
import test from 'node:test';

import { buildIntentUrl } from '../../src/pkg/core/intent/index.ts';

test('builds https Android intent URLs for a target downloader package', () => {
    assert.equal(
        buildIntentUrl('https://example.com/app.apk?token=abc#section', 'idm.internet.download.manager'),
        'intent://example.com/app.apk?token=abc#Intent;scheme=https;package=idm.internet.download.manager;type=*/*;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end',
    );
});

test('builds http Android intent URLs for non-https downloads', () => {
    assert.equal(
        buildIntentUrl('http://example.com/file.zip', 'com.dv.adm'),
        'intent://example.com/file.zip#Intent;scheme=http;package=com.dv.adm;type=*/*;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end',
    );
});
