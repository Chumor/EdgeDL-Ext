import { getInterceptSitesKey } from '@/pkg/core/intercept';
import { DEFAULT_DOWNLOADER_KEY, EDGE_DOWNLOADER_VALUE } from '@/pkg/services/config';
import { storage } from '@/pkg/browser/api';

async function ensureDefaultStorage() {
    await Promise.all([storage.get(DEFAULT_DOWNLOADER_KEY, ''), storage.get<string[]>(getInterceptSitesKey(), [])]);
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
        await chrome.action.setTitle({ tabId, title: 'EdgeDL：默认使用 Edge，不接管下载' });
        return;
    }

    const siteBlocked = blockedHosts.some((item) => item.toLowerCase() === host);
    await chrome.action.setTitle({ tabId, title: siteBlocked ? 'EdgeDL：本站已暂停' : 'EdgeDL：本站接管中' });
}

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
