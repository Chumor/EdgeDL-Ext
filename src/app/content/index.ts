import { showDownloadPicker } from '@/pages/components/download-picker';
import { showToast } from '@/pages/components/toast';
import { isDownloadLink } from '@/pkg/core/detector';
import { requestDownload } from '@/pkg/core/download';
import {
    getControlledHostname,
    getInterceptSites,
    getInterceptSitesKey,
    initializeInterceptState,
    isInterceptEnabled,
    normalizeUrl,
    setInterceptSites,
} from '@/pkg/core/intercept';

import { extractUrlFromOnclick } from '@/pkg/utils/url';
import { EDGEDL_MESSAGE_SOURCE, isDownloadRequestMessage } from '@/pkg/browser/messages';
import { DEFAULT_DOWNLOADER_KEY } from '@/pkg/services/config';

const POPUP_COMMAND_SOURCE = 'edgedl-popup-command';
const TRUSTED_GESTURE_WINDOW_MS = 1500;

let lastTrustedGestureAt = 0;

function isInvalidNavigationUrl(url: string) {
    const value = url.trim().toLowerCase();
    return !value || value === '#' || value === '##' || value.startsWith('javascript:');
}

function getDownloadUrlFromClick(target: HTMLElement) {
    const downloadTrigger = target.closest('[class*="download" i], [id*="download" i], [dt-eid*="download" i]');
    const link = target.closest('a, [onclick], [data-ng-href], [data-href], [data-url], [data-gokey]') as
        HTMLAnchorElement | HTMLElement | null;

    let url = '';
    if (link) {
        url =
            link.getAttribute('href') ||
            link.getAttribute('data-ng-href') ||
            link.getAttribute('data-href') ||
            link.getAttribute('data-gokey')?.match(/download_url=([^&]+)/)?.[1] ||
            link.getAttribute('data-url') ||
            (link as HTMLAnchorElement).href ||
            '';
    }

    if (isInvalidNavigationUrl(url)) {
        const onclick = link
            ? (link as HTMLElement).getAttribute('onclick') || link.closest('[onclick]')?.getAttribute('onclick')
            : target.closest('[onclick]')?.getAttribute('onclick');

        if (onclick) url = extractUrlFromOnclick(onclick) || '';
    }

    if (isInvalidNavigationUrl(url) && downloadTrigger && isDownloadLink(location.href)) {
        return location.href;
    }

    return normalizeUrl(url);
}

async function handleDownloadCandidate(url: string, options: { showSkippedToast: boolean }) {
    if (!url || !isDownloadLink(url)) return false;

    if (!isInterceptEnabled()) {
        if (options.showSkippedToast) {
            showToast('已跳过接管', { duration: 1500, type: 'info' });
        }
        return false;
    }

    const result = await requestDownload(url);
    if (result.type === 'edge') {
        location.href = url;
    }

    return true;
}

async function dispatchDownload(url: string) {
    await handleDownloadCandidate(url, { showSkippedToast: true });
}

function handleClick(event: MouseEvent) {
    const target = event.target as HTMLElement | null;
    if (!target?.closest) return;
    if (target.closest('label.hope-checkbox, .hope-checkbox, .hope-checkbox__control, input[type="checkbox"]')) return;

    const url = getDownloadUrlFromClick(target);
    if (!url || !isDownloadLink(url)) return;

    if (!isInterceptEnabled()) {
        showToast('已跳过接管', { duration: 1500, type: 'info' });
        return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    void dispatchDownload(url).catch((error: unknown) => {
        console.error('[EdgeDL] Failed to handle download click', error);
    });
}

function markTrustedGesture(event: PointerEvent | TouchEvent | MouseEvent | KeyboardEvent) {
    if (event.isTrusted) lastTrustedGestureAt = Date.now();
}

function hasRecentTrustedGesture() {
    return Date.now() - lastTrustedGestureAt <= TRUSTED_GESTURE_WINDOW_MS;
}

function attachClickInterceptor() {
    document.addEventListener('pointerdown', markTrustedGesture, true);
    document.addEventListener('touchstart', markTrustedGesture, true);
    document.addEventListener('keydown', markTrustedGesture, true);
    document.addEventListener('click', handleClick, true);
}

function postPageBridgeState() {
    window.postMessage(
        {
            enabled: isInterceptEnabled(),
            source: EDGEDL_MESSAGE_SOURCE,
            type: 'intercept-state',
        },
        '*',
    );
}
function attachPageBridgeMessageListener() {
    window.addEventListener('message', (event) => {
        if (event.source !== window || !isDownloadRequestMessage(event.data)) return;
        if (!hasRecentTrustedGesture()) return;

        void handleDownloadCandidate(event.data.url, { showSkippedToast: false });
    });
}

async function toggleCurrentSite() {
    const host = getControlledHostname();
    const sites = await getInterceptSites();
    const index = sites.findIndex((item) => item.toLowerCase() === host);
    const nextSites = [...sites];
    const blocked = index < 0;

    if (index >= 0) nextSites.splice(index, 1);
    else nextSites.push(host);

    await setInterceptSites(nextSites);
    postPageBridgeState();
    showToast(blocked ? '已禁止接管本站' : '已允许接管本站', { duration: 1500, type: 'info' });

    return { blocked, host };
}

function attachRuntimeMessageListener() {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        const data = message as Record<PropertyKey, unknown> | undefined;
        if (!data || data.source !== POPUP_COMMAND_SOURCE) return false;

        if (data.type === 'toggle-current-site') {
            void toggleCurrentSite()
                .then((result) => sendResponse({ ok: true, ...result }))
                .catch((error: unknown) => {
                    console.error('[EdgeDL] Failed to toggle current site from runtime message', error);
                    sendResponse({ ok: false });
                });
            return true;
        }

        if (data.type === 'get-current-site-state') {
            void (async () => {
                const host = getControlledHostname();
                const sites = await getInterceptSites();
                const blocked = sites.some((item) => item.toLowerCase() === host);
                sendResponse({ blocked, enabled: isInterceptEnabled(), host, ok: true });
            })().catch((error: unknown) => {
                console.error('[EdgeDL] Failed to read current site state', error);
                sendResponse({ ok: false });
            });
            return true;
        }

        if (data.type === 'show-download-picker') {
            void showDownloadPicker(() => {});
            sendResponse({ ok: true });
            return false;
        }

        return false;
    });
}

function attachStorageChangeListener() {
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local' || (!changes[getInterceptSitesKey()] && !changes[DEFAULT_DOWNLOADER_KEY])) return;

        void initializeInterceptState()
            .then(postPageBridgeState)
            .catch((error: unknown) => {
                console.error('[EdgeDL] Failed to refresh intercept state', error);
            });
    });
}

async function init() {
    await initializeInterceptState();
    postPageBridgeState();
    attachClickInterceptor();
    attachPageBridgeMessageListener();
    attachRuntimeMessageListener();
    attachStorageChangeListener();
}

void init().catch((error: unknown) => {
    console.error('[EdgeDL] Failed to initialize content script', error);
});
