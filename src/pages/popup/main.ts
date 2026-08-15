import { downloaderIcons } from '@/pages/components/assets/icons';
import { queryActiveTab, sendMessageToTab, sendRuntimeMessage, storage } from '@/pkg/browser/api';
import { EDGEDL_MESSAGE_SOURCE, type Aria2RuntimeResponse } from '@/pkg/browser/messages';
import {
    ARIA2_CONFIG_KEY,
    ARIA2_DOWNLOADER_VALUE,
    ARIA2_SETTINGS_EXPANDED_KEY,
    DEFAULT_ARIA2_CONFIG,
    type Aria2Config,
    normalizeAria2Config,
    normalizeAria2Endpoint,
} from '@/pkg/core/aria2';
import { getInterceptSitesKey } from '@/pkg/core/intercept';
import { DEFAULT_DOWNLOADER_KEY, DOWNLOADERS, EDGE_DOWNLOADER_VALUE, getEdgeDLVersion } from '@/pkg/services/config';
import { getErrorMessage } from '@/pkg/utils/error';

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
        label: 'Aria2 RPC',
        value: ARIA2_DOWNLOADER_VALUE,
        icon: downloaderIcons.ARIA2,
        description: '通过 RPC 添加到 aria2',
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
    aria2Config: Aria2Config;
    aria2SettingsExpanded: boolean;
    defaultDownloader: string | null;
    siteState: SiteStateResponse | null;
}

const state: PopupState = {
    activeTab: null,
    aria2Config: { ...DEFAULT_ARIA2_CONFIG },
    aria2SettingsExpanded: false,
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

interface PopupActionOptions {
    busyElement?: HTMLButtonElement;
    failureMessage: string;
    logMessage: string;
}

async function runPopupAction(action: () => Promise<void>, options: PopupActionOptions) {
    const { busyElement, failureMessage, logMessage } = options;
    if (busyElement) setElementBusy(busyElement, true);

    try {
        await action();
    } catch (error: unknown) {
        console.error(logMessage, error);
        showToast(failureMessage);
    } finally {
        if (busyElement) setElementBusy(busyElement, false);
    }
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
    const [tab, defaultDownloader, aria2Config, aria2SettingsExpanded] = await Promise.all([
        queryActiveTab(),
        storage.get<string | null>(DEFAULT_DOWNLOADER_KEY, null),
        storage.get<Aria2Config>(ARIA2_CONFIG_KEY, DEFAULT_ARIA2_CONFIG),
        storage.get(ARIA2_SETTINGS_EXPANDED_KEY, false),
    ]);

    state.activeTab = tab;
    state.aria2Config = normalizeAria2Config(aria2Config);
    state.aria2SettingsExpanded = aria2SettingsExpanded;
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

function setAria2Status(message: string, type: 'error' | 'idle' | 'success' = 'idle') {
    const status = qs<HTMLElement>('#aria2-status');
    status.textContent = message;
    status.classList.toggle('error', type === 'error');
    status.classList.toggle('success', type === 'success');
}

function renderAria2Settings() {
    const switchButton = qs<HTMLButtonElement>('#aria2-settings-switch');
    const form = qs<HTMLFormElement>('#aria2-form');
    const expanded = state.aria2SettingsExpanded;

    switchButton.classList.toggle('on', expanded);
    switchButton.setAttribute('aria-pressed', String(expanded));
    switchButton.setAttribute('aria-expanded', String(expanded));
    switchButton.setAttribute('aria-label', expanded ? '收起 Aria2 RPC 设置' : '展开 Aria2 RPC 设置');
    switchButton.title = expanded ? '收起 Aria2 RPC 设置' : '展开 Aria2 RPC 设置';
    form.hidden = !expanded;

    qs<HTMLInputElement>('#aria2-endpoint').value = state.aria2Config.endpoint;
    qs<HTMLInputElement>('#aria2-secret').value = state.aria2Config.secret;
    qs<HTMLInputElement>('#aria2-directory').value = state.aria2Config.directory;
}

function readAria2ConfigForm(): Aria2Config {
    return {
        directory: qs<HTMLInputElement>('#aria2-directory').value.trim(),
        endpoint: normalizeAria2Endpoint(qs<HTMLInputElement>('#aria2-endpoint').value),
        secret: qs<HTMLInputElement>('#aria2-secret').value,
    };
}

async function saveAria2Config() {
    const config = readAria2ConfigForm();
    await storage.set(ARIA2_CONFIG_KEY, config);
    state.aria2Config = config;
    qs<HTMLInputElement>('#aria2-endpoint').value = config.endpoint;
    setAria2Status('配置已保存', 'success');
    return config;
}

async function testAria2Connection() {
    try {
        await saveAria2Config();
    } catch (error: unknown) {
        const message = getErrorMessage(error);
        setAria2Status(message, 'error');
        showToast(message);
        return;
    }

    setAria2Status('连接中…');

    try {
        const response = await sendRuntimeMessage<Aria2RuntimeResponse>({
            source: EDGEDL_MESSAGE_SOURCE,
            type: 'aria2-test-connection',
        });

        if (!response.ok) throw new Error(response.error);
        if (!response.version) throw new Error('aria2 未返回版本');

        setAria2Status(`已连接 · aria2 ${response.version}`, 'success');
        showToast('Aria2 已连接');
    } catch (error: unknown) {
        setAria2Status(getErrorMessage(error), 'error');
        throw error;
    }
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
            button.setAttribute('aria-pressed', String(selected === item.value));

            const iconBox = document.createElement('span');
            iconBox.className = 'icon-box';

            const icon = document.createElement('img');
            icon.src = item.icon;
            icon.alt = '';
            iconBox.append(icon);

            const label = document.createElement('span');
            label.className = 'label';
            label.textContent = item.label;

            button.append(iconBox, label);
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
    clearButton.title = state.defaultDownloader ? '清除默认下载器' : '未设置默认下载器';
    clearButton.setAttribute('aria-label', clearButton.title);
}

function render() {
    renderHeader();
    renderSiteControls();
    renderAria2Settings();
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
    const aria2Form = qs<HTMLFormElement>('#aria2-form');
    const aria2SettingsSwitch = qs<HTMLButtonElement>('#aria2-settings-switch');
    const aria2SaveButton = qs<HTMLButtonElement>('#aria2-save');
    const aria2TestButton = qs<HTMLButtonElement>('#aria2-test');

    grid.addEventListener('click', (event) => {
        const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('button[data-pkg]');
        if (!button) return;

        void runPopupAction(
            async () => {
                await setDefaultDownloader(button.dataset.pkg || EDGE_DOWNLOADER_VALUE);
                render();
                showToast(getDefaultDownloaderToast(state.defaultDownloader));
            },
            {
                busyElement: button,
                failureMessage: '保存默认下载器失败',
                logMessage: '[EdgeDL] Failed to update default downloader',
            },
        );
    });

    aria2SettingsSwitch.addEventListener('click', () => {
        void runPopupAction(
            async () => {
                const expanded = !state.aria2SettingsExpanded;
                await storage.set(ARIA2_SETTINGS_EXPANDED_KEY, expanded);
                state.aria2SettingsExpanded = expanded;
                renderAria2Settings();
            },
            {
                busyElement: aria2SettingsSwitch,
                failureMessage: '切换 Aria2 设置失败',
                logMessage: '[EdgeDL] Failed to toggle aria2 RPC settings',
            },
        );
    });

    aria2Form.addEventListener('submit', (event) => {
        event.preventDefault();
        void runPopupAction(
            async () => {
                try {
                    await saveAria2Config();
                    showToast('Aria2 配置已保存');
                } catch (error: unknown) {
                    setAria2Status(getErrorMessage(error), 'error');
                    throw error;
                }
            },
            {
                busyElement: aria2SaveButton,
                failureMessage: '保存 Aria2 配置失败',
                logMessage: '[EdgeDL] Failed to save aria2 RPC configuration',
            },
        );
    });

    aria2TestButton.addEventListener('click', () => {
        void runPopupAction(testAria2Connection, {
            busyElement: aria2TestButton,
            failureMessage: 'Aria2 连接失败',
            logMessage: '[EdgeDL] Failed to test aria2 RPC connection',
        });
    });

    switchButton.addEventListener('click', () => {
        void runPopupAction(
            async () => {
                await toggleCurrentSite();
                render();
                showToast(state.siteState?.blocked ? '本站已暂停' : '本站已接管');
            },
            {
                busyElement: switchButton,
                failureMessage: '切换站点状态失败',
                logMessage: '[EdgeDL] Failed to toggle site state',
            },
        );
    });

    openPickerButton.addEventListener('click', () => {
        void runPopupAction(openPagePicker, {
            failureMessage: '无法打开选择器',
            logMessage: '[EdgeDL] Failed to open page picker',
        });
    });

    refreshButton.addEventListener('click', () => {
        void runPopupAction(
            async () => {
                await refreshState();
                showToast('状态已刷新');
            },
            {
                busyElement: refreshButton,
                failureMessage: '刷新失败',
                logMessage: '[EdgeDL] Failed to refresh state',
            },
        );
    });

    clearButton.addEventListener('click', () => {
        void runPopupAction(
            async () => {
                await storage.remove(DEFAULT_DOWNLOADER_KEY);
                state.defaultDownloader = null;
                render();
                showToast('已清除默认');
            },
            {
                busyElement: clearButton,
                failureMessage: '默认下载器清除失败',
                logMessage: '[EdgeDL] Failed to clear default downloader',
            },
        ).finally(renderDefaultDesc);
    });
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
