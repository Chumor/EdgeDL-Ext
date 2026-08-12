import assert from 'node:assert/strict';
import test from 'node:test';

import {
    DOWNLOAD_CLICK_TARGET_SELECTOR,
    DOWNLOAD_CONTROL_SELECTOR,
    DOWNLOAD_CONTROL_URL_ATTRIBUTES,
    DOWNLOAD_CONTROL_VALUE_ATTRIBUTES,
    getDownloadUrlFromElement,
    isDownloadCandidate,
    isDownloadControl,
    isDownloadLink,
} from '../../src/pkg/core/detector/index.ts';

function createElement(attributes: Record<string, string> = {}, href = '') {
    return {
        getAttribute: (name: string) => attributes[name] ?? null,
        hasAttribute: (name: string) => Object.hasOwn(attributes, name),
        href,
    };
}

test('detects explicit download controls from supported attributes', () => {
    assert.equal(isDownloadControl(createElement({ download: '' })), true);

    DOWNLOAD_CONTROL_VALUE_ATTRIBUTES.forEach((name, index) => {
        const value = index % 2 === 0 ? 'download' : 'DoWnLoAd';
        assert.equal(isDownloadControl(createElement({ [name]: value })), true, name);
    });

    DOWNLOAD_CONTROL_URL_ATTRIBUTES.forEach((name) => {
        assert.equal(isDownloadControl(createElement({ [name]: '/binding' })), true, name);
    });
});

test('rejects controls whose attributes do not express a download', () => {
    assert.equal(isDownloadControl(null), false);
    assert.equal(isDownloadControl(createElement({ href: '/binding' })), false);
    assert.equal(isDownloadControl(createElement({ 'data-action': 'view' })), false);
    assert.equal(isDownloadControl(createElement({ 'data-command': 'open' })), false);
    assert.equal(isDownloadControl(createElement({ 'data-purpose': 'preview' })), false);
    assert.equal(isDownloadControl(createElement({ 'data-type': 'submit' })), false);
    assert.equal(isDownloadControl(createElement({ 'data-download-url': '' })), false);
    assert.equal(isDownloadControl(createElement({ 'data-download-href': '   ' })), false);
});

test('keeps control selectors aligned with detector attributes', () => {
    DOWNLOAD_CONTROL_VALUE_ATTRIBUTES.forEach((name) => {
        assert.match(DOWNLOAD_CONTROL_SELECTOR, new RegExp(`\\[${name}="download" i\\]`));
        assert.match(DOWNLOAD_CLICK_TARGET_SELECTOR, new RegExp(`\\[${name}="download" i\\]`));
    });

    DOWNLOAD_CONTROL_URL_ATTRIBUTES.forEach((name) => {
        assert.match(DOWNLOAD_CONTROL_SELECTOR, new RegExp(`\\[${name}\\]`));
        assert.match(DOWNLOAD_CLICK_TARGET_SELECTOR, new RegExp(`\\[${name}\\]`));
    });
});

test('extracts download URLs from centralized element attributes', () => {
    assert.equal(getDownloadUrlFromElement(createElement({ href: '/from-href' })), '/from-href');
    assert.equal(getDownloadUrlFromElement(createElement({ 'data-download-url': '/from-data' })), '/from-data');
    assert.equal(
        getDownloadUrlFromElement(
            createElement({ 'data-gokey': 'name=file&download_url=https://example.com/app.apk' }),
        ),
        'https://example.com/app.apk',
    );
    assert.equal(
        getDownloadUrlFromElement(createElement({ 'data-gokey': 'name=file', 'data-download-link': '/fallback' })),
        '/fallback',
    );
    assert.equal(
        getDownloadUrlFromElement(createElement({}, 'https://example.com/resolved')),
        'https://example.com/resolved',
    );
    assert.equal(getDownloadUrlFromElement(null), '');
});

test('detects candidates with an HTTP-only gate and explicit control handling', () => {
    for (const url of [
        '',
        '   ',
        'not-a-url',
        'https://',
        'https:example.com/file.zip',
        'ftp://example.com/file.zip',
        'mailto:user@example.com',
        'file:///tmp/file.zip',
        'javascript:alert(1)',
        'blob:https://example.com/file',
    ]) {
        assert.equal(isDownloadCandidate(url, true), false, url);
    }

    const downloadUrl = 'https://example.com/files/report.pdf';
    assert.equal(isDownloadLink(downloadUrl), true);
    assert.equal(isDownloadCandidate(downloadUrl), true);
    assert.equal(isDownloadCandidate(downloadUrl, true), true);

    const pageUrl = 'https://example.com/binding';
    assert.equal(isDownloadLink(pageUrl), false);
    assert.equal(isDownloadCandidate(pageUrl), false);
    assert.equal(isDownloadCandidate(pageUrl, true), true);
});

test('detects direct file downloads by extension', () => {
    assert.equal(isDownloadLink('https://example.com/releases/app.apk'), true);
    assert.equal(isDownloadLink('https://example.com/archive/file.zip?token=abc'), true);
    assert.equal(isDownloadLink('https://example.com/video/movie.mkv#download'), true);
});

test('detects download-like routes and attachment query parameters', () => {
    assert.equal(isDownloadLink('https://example.com/download?id=123'), true);
    assert.equal(isDownloadLink('https://example.com/files/manual'), true);
    assert.equal(isDownloadLink('https://example.com/view?response-content-disposition=attachment'), true);
});

test('ignores common navigation, source, and local filesystem-like URLs', () => {
    assert.equal(isDownloadLink('https://example.com/login'), false);
    assert.equal(isDownloadLink('https://github.com/user/repo/tree/main'), false);
    assert.equal(isDownloadLink('https://github.com/user/repo/blob/main/file.zip'), false);
    assert.equal(isDownloadLink('file:///data/data/com.example/cache/app.apk'), false);
    assert.equal(isDownloadLink('https://example.com/data/data/com.example/cache'), false);
});

test('keeps SourceForge project file pages as normal pages', () => {
    assert.equal(isDownloadLink('https://sourceforge.net/projects/example/files/latest/download'), false);
});

test('detects known redirect download pages', () => {
    assert.equal(isDownloadLink('https://game.gtimg.cn/images/zlkdatasys/mct/proj_123/download.shtml'), true);
    assert.equal(isDownloadLink('https://game.gtimg.cn/images/zlkdatasys/mct/d/package-name.shtml?foo=bar'), true);
});

test('ignores weak asset and media routes without stronger download signals', () => {
    assert.equal(isDownloadLink('https://example.com/assets/page'), false);
    assert.equal(isDownloadLink('https://example.com/media/gallery'), false);
    assert.equal(isDownloadLink('https://example.com/cdn/help'), false);
    assert.equal(isDownloadLink('https://example.com/dist/docs'), false);
});
