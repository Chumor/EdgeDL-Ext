/**
 * @module core/intercept
 * @description 接管控制模块：管理站点是否允许 EdgeDL 接管下载行为。
 */
import { storage } from '@/pkg/browser/api';
import { DEFAULT_DOWNLOADER_KEY, EDGE_DOWNLOADER_VALUE } from '@/pkg/services/config';

const KEY = 'edgedl-site-intercept';

let interceptEnabled = true;
let edgeDefaultDownloader = false;
let interceptStateReady = false;

export function getInterceptSitesKey() {
    return KEY;
}

export function getControlledHostname() {
    try {
        return window.top?.location.hostname.toLowerCase() || location.hostname.toLowerCase();
    } catch {
        try {
            return new URL(document.referrer).hostname.toLowerCase() || location.hostname.toLowerCase();
        } catch {
            return location.hostname.toLowerCase();
        }
    }
}

export function normalizeUrl(input: unknown) {
    if (!input) return '';

    try {
        const url = new URL(String(input), location.href).href;
        return url.startsWith('http') ? url : '';
    } catch {
        return '';
    }
}

export function isInterceptEnabled() {
    return interceptStateReady && interceptEnabled && !edgeDefaultDownloader;
}

export async function getInterceptSites() {
    const list = await storage.get<string[]>(KEY, []);
    return Array.isArray(list) ? list : [];
}

export async function setInterceptSites(list: string[]) {
    const normalized = list.map((item) => item.toLowerCase());
    await storage.set(KEY, normalized);
    interceptEnabled = !normalized.includes(getControlledHostname());
    edgeDefaultDownloader = await isEdgeDefaultDownloader();
    interceptStateReady = true;
    return normalized;
}

export async function isSiteIntercepted() {
    const host = getControlledHostname();
    const list = await getInterceptSites();
    return list.some((item) => item.toLowerCase() === host);
}

export async function toggleSiteIntercept() {
    const host = getControlledHostname();
    const list = await getInterceptSites();
    const index = list.findIndex((item) => item.toLowerCase() === host);
    const added = index < 0;

    if (index >= 0) list.splice(index, 1);
    else list.push(host);

    await setInterceptSites(list);
    return added;
}

async function isEdgeDefaultDownloader() {
    return (await storage.get<string | null>(DEFAULT_DOWNLOADER_KEY, null)) === EDGE_DOWNLOADER_VALUE;
}

export async function initializeInterceptState() {
    try {
        const [siteIntercepted, usesEdgeDefault] = await Promise.all([isSiteIntercepted(), isEdgeDefaultDownloader()]);
        interceptEnabled = !siteIntercepted;
        edgeDefaultDownloader = usesEdgeDefault;
    } catch (error) {
        console.error('[EdgeDL] Failed to load site intercept state', error);
        interceptEnabled = true;
        edgeDefaultDownloader = false;
    } finally {
        interceptStateReady = true;
    }
}
