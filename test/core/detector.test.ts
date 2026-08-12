import assert from 'node:assert/strict';
import test from 'node:test';

import { isDownloadCandidate, isDownloadControl, isDownloadLink } from '../../src/pkg/core/detector/index.ts';

test('detects explicit download controls independently of URL shape', () => {
    const control = {
        hasAttribute: (name: string) => name === 'auto-inspect-button-type',
        getAttribute: (name: string) => (name === 'auto-inspect-button-type' ? 'download' : null),
    };
    const link = {
        hasAttribute: () => false,
        getAttribute: (name: string) => (name === 'href' ? '/binding' : null),
    };

    assert.equal(isDownloadControl(control), true);
    assert.equal(isDownloadControl(link), false);
    assert.equal(isDownloadCandidate('https://example.com/binding', true), true);
    assert.equal(isDownloadCandidate('https://example.com/binding'), false);
    assert.equal(isDownloadCandidate('javascript:alert(1)', true), false);
    assert.equal(isDownloadCandidate('blob:https://example.com/file', true), false);
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
