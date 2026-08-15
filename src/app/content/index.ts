import { showDownloadPicker } from '@/pages/components/download-picker';
import { showToast } from '@/pages/components/toast';
import {
    DOWNLOAD_CLICK_TARGET_SELECTOR,
    DOWNLOAD_CONTROL_SELECTOR,
    DOWNLOAD_TRIGGER_SELECTOR,
    getDownloadUrlFromElement,
    isDownloadCandidate,
    isDownloadControl,
    isDownloadLink,
} from '@/pkg/core/detector';
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
import { getMessage } from '@/pkg/browser/i18n';
import { EDGEDL_MESSAGE_SOURCE, isDownloadRequestMessage } from '@/pkg/browser/messages';
import { DEFAULT_DOWNLOADER_KEY } from '@/pkg/services/config';

const POPUP_COMMAND_SOURCE = 'edgedl-popup-command';
const TRUSTED_GESTURE_WINDOW_MS = 1500;

let lastTrustedGestureAt = 0;

function isInvalidNavigationUrl(url: string) {
    const value = url.trim().toLowerCase();
    return !value || value === '#' || value === '##' || value.startsWith('javascript:');
}

interface DownloadClickCandidate {
    url: string;
    explicit: boolean;
}

function getDownloadUrlFromClick(target: HTMLElement): DownloadClickCandidate {
    const control = target.closest(DOWNLOAD_CONTROL_SELECTOR);
    const downloadTrigger = target.closest(DOWNLOAD_TRIGGER_SELECTOR);
    const link = target.closest(DOWNLOAD_CLICK_TARGET_SELECTOR) as HTMLElement | null;
    const explicit = isDownloadControl(control);

    let url = getDownloadUrlFromElement(link);

    if (isInvalidNavigationUrl(url)) {
        const onclick = link
            ? (link as HTMLElement).getAttribute('onclick') || link.closest('[onclick]')?.getAttribute('onclick')
            : target.closest('[onclick]')?.getAttribute('onclick');

        if (onclick) url = extractUrlFromOnclick(onclick) || '';
    }

    if (isInvalidNavigationUrl(url) && downloadTrigger && isDownloadLink(location.href)) {
        url = location.href;
    }

    return { url: normalizeUrl(url), explicit };
}

function allowPageNavigation(url: string) {
    const requestId =
        typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    return new Promise<void>((resolve) => {
        let timeoutId = 0;

        const finish = () => {
            window.clearTimeout(timeoutId);
            window.removeEventListener('message', handleAcknowledgement);
            resolve();
        };
        const handleAcknowledgement = (event: MessageEvent) => {
            if (event.source !== window) return;

            const data = event.data as Record<PropertyKey, unknown> | undefined;
            if (
                data?.source === EDGEDL_MESSAGE_SOURCE &&
                data.type === 'navigation-allowed' &&
                data.requestId === requestId
            ) {
                finish();
            }
        };

        window.addEventListener('message', handleAcknowledgement);
        window.postMessage(
            {
                source: EDGEDL_MESSAGE_SOURCE,
                type: 'allow-navigation',
                requestId,
                url,
            },
            '*',
        );
        timeoutId = window.setTimeout(finish, 250);
    });
}

async function handleDownloadCandidate(candidate: DownloadClickCandidate, options: { showSkippedToast: boolean }) {
    if (!isDownloadCandidate(candidate.url, candidate.explicit)) return false;

    if (!isInterceptEnabled()) {
        if (options.showSkippedToast) {
            showToast(getMessage('takeoverSkipped'), { duration: 1500, type: 'info' });
        }
        return false;
    }

    const result = await requestDownload(candidate.url, { referer: location.href });
    if (result.type === 'edge') {
        await allowPageNavigation(candidate.url);
        location.href = candidate.url;
    }

    return true;
}

async function dispatchDownload(candidate: DownloadClickCandidate) {
    await handleDownloadCandidate(candidate, { showSkippedToast: true });
}

function handleClick(event: MouseEvent) {
    const target = event.target as HTMLElement | null;
    if (!target?.closest) return;
    if (target.closest('label.hope-checkbox, .hope-checkbox, .hope-checkbox__control, input[type="checkbox"]')) return;

    const candidate = getDownloadUrlFromClick(target);
    if (!isDownloadCandidate(candidate.url, candidate.explicit)) return;

    if (!isInterceptEnabled()) {
        showToast(getMessage('takeoverSkipped'), { duration: 1500, type: 'info' });
        return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    void dispatchDownload(candidate).catch((error: unknown) => {
        console.error('[EdgeDL] Failed to handle download click', error);
    });
}

function markTrustedGesture(event: PointerEvent | TouchEvent | MouseEvent | KeyboardEvent) {
    if (!event.isTrusted) return;
    lastTrustedGestureAt = Date.now();
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

        void handleDownloadCandidate(
            { url: event.data.url, explicit: event.data.explicitControl === true },
            { showSkippedToast: false },
        );
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
    showToast(getMessage(blocked ? 'siteTakeoverDisabled' : 'siteTakeoverEnabled'), {
        duration: 1500,
        type: 'info',
    });

    return { blocked, host };
}

function attachRuntimeMessageListener() {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        const data = message as Record<PropertyKey, unknown> | undefined;
        if (!data || data.source !== POPUP_COMMAND_SOURCE) return false;

        if (data.type === 'toggle-current-site') {
            void (async () => {
                try {
                    const result = await toggleCurrentSite();
                    sendResponse({ ok: true, ...result });
                } catch (error: unknown) {
                    console.error('[EdgeDL] Failed to toggle current site from runtime message', error);
                    sendResponse({ ok: false });
                }
            })();
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

        void (async () => {
            try {
                await initializeInterceptState();
                postPageBridgeState();
            } catch (error: unknown) {
                console.error('[EdgeDL] Failed to refresh intercept state', error);
            }
        })();
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
