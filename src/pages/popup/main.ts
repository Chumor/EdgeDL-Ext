import { downloaderIcons } from '@/pages/components/assets/icons';
import { queryActiveTab, sendMessageToTab, storage } from '@/pkg/browser/api';
import { getInterceptSitesKey } from '@/pkg/core/intercept';
import { DEFAULT_DOWNLOADER_KEY, DOWNLOADERS, EDGE_DOWNLOADER_VALUE, getEdgeDLVersion } from '@/pkg/services/config';

const POPUP_COMMAND_SOURCE = 'edgedl-popup-command';

const downloaderOptions = [
    {
        label: '1DM',
        value: DOWNLOADERS.IDM,
        icon: downloaderIcons.IDM,
        description: '1DM Download Manager',
    },
    {
        label: '1DM+',
        value: DOWNLOADERS.IDM_PLUS,
        icon: downloaderIcons.IDM_PLUS,
        description: '1DM Plus',
    },
    {
        label: 'ADM',
        value: DOWNLOADERS.ADM,
        icon: downloaderIcons.ADM,
        description: 'Advanced Download Manager',
    },
    {
        label: 'ABDM',
        value: DOWNLOADERS.ABDM,
        icon: downloaderIcons.ABDM,
        description: 'AB Download Manager',
    },
    {
        label: 'FDM',
        value: DOWNLOADERS.FDM,
        icon: downloaderIcons.FDM,
        description: 'Free Download Manager',
    },
    {
        label: 'Edge',
        value: EDGE_DOWNLOADER_VALUE,
        icon: downloaderIcons.EDGE,
        description: '使用 Edge 内置下载器',
    },
] as const;

type DownloaderValue = (typeof downloaderOptions)[number]['value'];

interface SiteStateResponse {
    blocked?: boolean;
    host?: string;
    ok: boolean;
}

interface PopupState {
    activeTab: chrome.tabs.Tab | null;
    defaultDownloader: string | null;
    siteState: SiteStateResponse | null;
}

const state: PopupState = {
    activeTab: null,
    defaultDownloader: null,
    siteState: null,
};

function qs<T extends Element>(selector: string) {
    const element = document.querySelector<T>(selector);
    if (!element) throw new Error(`Missing popup element: ${selector}`);
    return element;
}

function getHostname(url: string) {
    try {
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol)) return '';
        return parsed.hostname.toLowerCase();
    } catch {
        return '';
    }
}

function getDownloaderLabel(value: string | null) {
    if (!value) return '询问';
    return downloaderOptions.find((item) => item.value === value)?.label || '自定义';
}

function getSelectedDownloaderValue() {
    return state.defaultDownloader;
}

function isEdgeDefaultDownloader() {
    return state.defaultDownloader === EDGE_DOWNLOADER_VALUE;
}

function setElementBusy(element: HTMLButtonElement, busy: boolean) {
    element.disabled = busy;
    element.style.cursor = busy ? 'wait' : '';
}

let toastTimer: number | undefined;
function showToast(message: string) {
    const toast = qs<HTMLElement>('#toast');
    toast.textContent = message;
    toast.classList.add('show');

    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
        toast.classList.remove('show');
    }, 1600);
}

function getDefaultDownloaderToast(value: string | null) {
    return `已将默认下载器设为 ${getDownloaderLabel(value)}`;
}

async function setDefaultDownloader(pkg: DownloaderValue | string) {
    await storage.set(DEFAULT_DOWNLOADER_KEY, pkg);
    state.defaultDownloader = pkg;
}

async function getCurrentSiteState(tab: chrome.tabs.Tab) {
    if (!tab.id) return null;

    try {
        const response = await sendMessageToTab<SiteStateResponse>(tab.id, {
            source: POPUP_COMMAND_SOURCE,
            type: 'get-current-site-state',
        });

        if (response.ok && response.host) return response;
    } catch (error) {
        console.info('[EdgeDL] Content script site state is unavailable, falling back to tab URL', error);
    }

    const host = getHostname(tab.url || '');
    if (!host) return null;

    const sites = await storage.get<string[]>(getInterceptSitesKey(), []);
    return {
        blocked: sites.some((item) => item.toLowerCase() === host),
        host,
        ok: true,
    } satisfies SiteStateResponse;
}

async function loadState() {
    const [tab, defaultDownloader] = await Promise.all([
        queryActiveTab(),
        storage.get<string | null>(DEFAULT_DOWNLOADER_KEY, null),
    ]);

    state.activeTab = tab;
    state.defaultDownloader = defaultDownloader;
    state.siteState = tab ? await getCurrentSiteState(tab) : null;
}

function renderHeader() {
    const icon = qs<HTMLImageElement>('#brand-icon');
    const version = qs<HTMLElement>('#version');
    const host = qs<HTMLElement>('#current-host');
    const pill = qs<HTMLElement>('#site-pill');
    const site = state.siteState;

    icon.src = downloaderIcons.EDGE;
    version.textContent = `v${getEdgeDLVersion()}`;
    host.textContent = site?.host || '当前页面不可用';
    host.title = site?.host || '';

    const enabled = !!site?.host && !site.blocked && !isEdgeDefaultDownloader();
    pill.classList.toggle('off', !enabled);
    pill.replaceChildren();

    const dot = document.createElement('span');
    dot.className = 'dot';

    const label = document.createElement('span');
    label.textContent = !site?.host ? '不可用' : enabled ? '已接管' : '已暂停';

    pill.append(dot, label);
}

function renderSiteControls() {
    const switchButton = qs<HTMLButtonElement>('#site-switch');
    const siteDesc = qs<HTMLElement>('#site-desc');
    const site = state.siteState;
    const enabled = !!site?.host && !site.blocked && !isEdgeDefaultDownloader();

    switchButton.disabled = !site?.host || isEdgeDefaultDownloader();
    switchButton.classList.toggle('on', enabled);
    switchButton.setAttribute('aria-pressed', String(enabled));

    if (!site?.host) {
        siteDesc.textContent = '当前页面不可用';
        return;
    }

    if (isEdgeDefaultDownloader()) {
        siteDesc.textContent = '默认使用 Edge，不接管下载';
        return;
    }

    siteDesc.textContent = enabled ? '处理本站下载跳转' : '本站已暂停';
}

function renderDownloaderGrid() {
    const grid = qs<HTMLElement>('#downloader-grid');
    const selected = getSelectedDownloaderValue();

    grid.replaceChildren(
        ...downloaderOptions.map((item) => {
            const button = document.createElement('button');
            button.className = 'downloader';
            button.type = 'button';
            button.dataset.pkg = item.value;
            button.title = item.description;
            button.classList.toggle('selected', selected === item.value);

            const check = document.createElement('span');
            check.className = 'check';
            check.textContent = '✓';

            const iconBox = document.createElement('span');
            iconBox.className = 'icon-box';

            const icon = document.createElement('img');
            icon.src = item.icon;
            icon.alt = '';
            iconBox.append(icon);

            const label = document.createElement('span');
            label.className = 'label';
            label.textContent = item.label;

            button.append(check, iconBox, label);
            return button;
        }),
    );
}

function renderDefaultDesc() {
    const desc = qs<HTMLElement>('#default-desc');
    const clearButton = qs<HTMLButtonElement>('#clear-default');
    const label = getDownloaderLabel(state.defaultDownloader);

    desc.textContent = state.defaultDownloader ? `默认：${label}` : '下载时询问';

    clearButton.disabled = !state.defaultDownloader;
}

function render() {
    renderHeader();
    renderSiteControls();
    renderDownloaderGrid();
    renderDefaultDesc();
}

async function toggleCurrentSite() {
    const site = state.siteState;
    const tabId = state.activeTab?.id;

    if (!site?.host) return;

    if (tabId) {
        try {
            const response = await sendMessageToTab<SiteStateResponse>(tabId, {
                source: POPUP_COMMAND_SOURCE,
                type: 'toggle-current-site',
            });

            if (response.ok) {
                state.siteState = response;
                return;
            }
        } catch (error) {
            console.info('[EdgeDL] Failed to toggle site through content script, falling back to storage', error);
        }
    }

    const host = site.host;
    const sites = await storage.get<string[]>(getInterceptSitesKey(), []);
    const index = sites.findIndex((item) => item.toLowerCase() === host);
    const nextSites = [...sites];

    if (index >= 0) nextSites.splice(index, 1);
    else nextSites.push(host);

    await storage.set(getInterceptSitesKey(), nextSites);
    state.siteState = {
        ok: true,
        host,
        blocked: index < 0,
    };
}

async function openPagePicker() {
    const tabId = state.activeTab?.id;
    if (!tabId) {
        showToast('当前页面不可用');
        return;
    }

    await sendMessageToTab(tabId, {
        source: POPUP_COMMAND_SOURCE,
        type: 'show-download-picker',
    });

    window.close();
}

async function refreshState() {
    await loadState();
    render();
}

function bindEvents() {
    const grid = qs<HTMLElement>('#downloader-grid');
    const switchButton = qs<HTMLButtonElement>('#site-switch');
    const openPickerButton = qs<HTMLButtonElement>('#open-picker');
    const refreshButton = qs<HTMLButtonElement>('#reload-state');
    const clearButton = qs<HTMLButtonElement>('#clear-default');
    const closeButton = qs<HTMLButtonElement>('#close-popup');

    grid.addEventListener('click', (event) => {
        const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('button[data-pkg]');
        if (!button) return;

        void (async () => {
            setElementBusy(button, true);
            await setDefaultDownloader(button.dataset.pkg || EDGE_DOWNLOADER_VALUE);
            render();
            showToast(getDefaultDownloaderToast(state.defaultDownloader));
        })()
            .catch((error: unknown) => {
                console.error('[EdgeDL] Failed to update default downloader', error);
                showToast('保存默认下载器失败');
            })
            .finally(() => {
                setElementBusy(button, false);
            });
    });

    switchButton.addEventListener('click', () => {
        void (async () => {
            setElementBusy(switchButton, true);
            await toggleCurrentSite();
            render();
            showToast(state.siteState?.blocked ? '本站已暂停' : '本站已接管');
        })()
            .catch((error: unknown) => {
                console.error('[EdgeDL] Failed to toggle site state', error);
                showToast('切换站点状态失败');
            })
            .finally(() => {
                setElementBusy(switchButton, false);
            });
    });

    openPickerButton.addEventListener('click', () => {
        void openPagePicker().catch((error: unknown) => {
            console.error('[EdgeDL] Failed to open page picker', error);
            showToast('无法打开选择器');
        });
    });

    refreshButton.addEventListener('click', () => {
        void (async () => {
            setElementBusy(refreshButton, true);
            await refreshState();
            showToast('状态已刷新');
        })()
            .catch((error: unknown) => {
                console.error('[EdgeDL] Failed to refresh state', error);
                showToast('刷新失败');
            })
            .finally(() => {
                setElementBusy(refreshButton, false);
            });
    });

    clearButton.addEventListener('click', () => {
        void (async () => {
            setElementBusy(clearButton, true);
            await storage.remove(DEFAULT_DOWNLOADER_KEY);
            state.defaultDownloader = null;
            render();
            showToast('已清除默认');
        })()
            .catch((error: unknown) => {
                console.error('[EdgeDL] Failed to clear default downloader', error);
                showToast('默认下载器清除失败');
            })
            .finally(() => {
                setElementBusy(clearButton, false);
            });
    });

    closeButton.addEventListener('click', () => window.close());
}

async function init() {
    bindEvents();
    await loadState();
    render();
}

void init().catch((error: unknown) => {
    console.error('[EdgeDL] Failed to initialize popup', error);
    showToast('菜单初始化失败');
});
