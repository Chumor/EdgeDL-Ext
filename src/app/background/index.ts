import { storage } from '@/pkg/browser/api';
import { getMessage } from '@/pkg/browser/i18n';
import { type Aria2RuntimeMessage, type Aria2RuntimeResponse, isAria2RuntimeMessage } from '@/pkg/browser/messages';
import {
    ARIA2_CONFIG_KEY,
    DEFAULT_ARIA2_CONFIG,
    type Aria2Config,
    addAria2Uri,
    getAria2Version,
    normalizeAria2Config,
} from '@/pkg/core/aria2';
import { getInterceptSitesKey } from '@/pkg/core/intercept';
import { DEFAULT_DOWNLOADER_KEY, EDGE_DOWNLOADER_VALUE } from '@/pkg/services/config';
import { getErrorMessage } from '@/pkg/utils/error';

async function ensureDefaultStorage() {
    await Promise.all([storage.get(DEFAULT_DOWNLOADER_KEY, ''), storage.get<string[]>(getInterceptSitesKey(), [])]);
}

async function getAria2Config() {
    const value = await storage.get<Aria2Config>(ARIA2_CONFIG_KEY, DEFAULT_ARIA2_CONFIG);
    return normalizeAria2Config(value);
}

async function handleAria2Message(message: Aria2RuntimeMessage): Promise<Aria2RuntimeResponse> {
    try {
        const config = await getAria2Config();

        if (message.type === 'aria2-test-connection') {
            const result = await getAria2Version(config);
            return { ok: true, version: result.version };
        }

        const gid = await addAria2Uri(config, message.url, { referer: message.referer });
        return { gid, ok: true };
    } catch (error: unknown) {
        console.error('[EdgeDL] aria2 RPC request failed', error);
        return { error: getErrorMessage(error), ok: false };
    }
}

function getHostname(url?: string) {
    if (!url) return '';

    try {
        return new URL(url).hostname.toLowerCase();
    } catch {
        return '';
    }
}

async function updateActionState(tabId: number, url?: string) {
    const host = getHostname(url);
    if (!host) {
        await chrome.action.setTitle({ tabId, title: 'EdgeDL' });
        return;
    }

    const [defaultDownloader, blockedHosts] = await Promise.all([
        storage.get<string | null>(DEFAULT_DOWNLOADER_KEY, null),
        storage.get<string[]>(getInterceptSitesKey(), []),
    ]);

    if (defaultDownloader === EDGE_DOWNLOADER_VALUE) {
        await chrome.action.setTitle({ tabId, title: getMessage('actionEdgeDefault') });
        return;
    }

    const siteBlocked = blockedHosts.some((item) => item.toLowerCase() === host);
    await chrome.action.setTitle({
        tabId,
        title: getMessage(siteBlocked ? 'actionSitePaused' : 'actionSiteActive'),
    });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isAria2RuntimeMessage(message)) return false;

    void handleAria2Message(message).then(sendResponse);
    return true;
});

chrome.runtime.onInstalled.addListener(() => {
    void ensureDefaultStorage().catch((error: unknown) => {
        console.error('[EdgeDL] Failed to initialize extension storage', error);
    });
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
    void (async () => {
        const tab = await chrome.tabs.get(tabId);
        await updateActionState(tabId, tab.url);
    })().catch((error: unknown) => {
        console.error('[EdgeDL] Failed to update action state on tab activation', error);
    });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!changeInfo.url && changeInfo.status !== 'complete') return;

    void updateActionState(tabId, tab.url).catch((error: unknown) => {
        console.error('[EdgeDL] Failed to update action state on tab update', error);
    });
});

chrome.storage.onChanged.addListener((_changes, areaName) => {
    if (areaName !== 'local') return;

    void (async () => {
        const tabs = await chrome.tabs.query({});
        await Promise.all(tabs.map((tab) => (tab.id ? updateActionState(tab.id, tab.url) : Promise.resolve())));
    })().catch((error: unknown) => {
        console.error('[EdgeDL] Failed to refresh action state after storage change', error);
    });
});
