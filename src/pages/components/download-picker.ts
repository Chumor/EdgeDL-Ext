/**
 * @module components/download-picker
 * @description 交互式分发控制器：提供可视化 UI 供用户选择下载目标，并处理下载器偏好设置的持久化逻辑。
 */
import { storage } from '@/pkg/browser/api';
import { DEFAULT_DOWNLOADER_KEY, DOWNLOADERS, EDGE_DOWNLOADER_VALUE, getEdgeDLVersion } from '@/pkg/services/config';
import { downloaderIcons } from './assets/icons';

export interface ExternalDownloadPickerResult {
    packageName: string;
    type: 'external';
}

export interface EdgeDownloadPickerResult {
    type: 'edge';
}

export interface CancelDownloadPickerResult {
    type: 'cancel';
}

export type DownloadPickerResult = CancelDownloadPickerResult | EdgeDownloadPickerResult | ExternalDownloadPickerResult;

interface DownloaderOption {
    icon: string;
    label: string;
    packageName: string;
}

const DOWNLOADER_OPTIONS: DownloaderOption[] = [
    { icon: downloaderIcons.IDM, label: '1DM', packageName: DOWNLOADERS.IDM },
    { icon: downloaderIcons.IDM_PLUS, label: '1DM+', packageName: DOWNLOADERS.IDM_PLUS },
    { icon: downloaderIcons.ADM, label: 'ADM', packageName: DOWNLOADERS.ADM },
    { icon: downloaderIcons.ABDM, label: 'ABDM', packageName: DOWNLOADERS.ABDM },
    { icon: downloaderIcons.FDM, label: 'FDM', packageName: DOWNLOADERS.FDM },
    { icon: downloaderIcons.EDGE, label: 'Edge', packageName: EDGE_DOWNLOADER_VALUE },
];

interface DownloadPickerOptions {
    downloadUrl?: string;
}

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

type CopyButtonState = 'copy' | 'copied' | 'failed';

function createCopyIcon(state: CopyButtonState) {
    const icon = document.createElementNS(SVG_NAMESPACE, 'svg');
    icon.setAttribute('aria-hidden', 'true');
    icon.setAttribute('fill', 'none');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('stroke', 'currentColor');
    icon.setAttribute('stroke-linecap', 'round');
    icon.setAttribute('stroke-linejoin', 'round');
    icon.setAttribute('stroke-width', '2');

    if (state === 'copy') {
        const back = document.createElementNS(SVG_NAMESPACE, 'rect');
        back.setAttribute('width', '14');
        back.setAttribute('height', '14');
        back.setAttribute('x', '8');
        back.setAttribute('y', '8');
        back.setAttribute('rx', '2');

        const front = document.createElementNS(SVG_NAMESPACE, 'path');
        front.setAttribute('d', 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2');
        icon.append(back, front);
    } else {
        const status = document.createElementNS(SVG_NAMESPACE, 'path');
        status.setAttribute('d', state === 'copied' ? 'm5 12 4 4L19 6' : 'M18 6 6 18M6 6l12 12');
        icon.appendChild(status);
    }

    return icon;
}

function setCopyButtonState(button: HTMLButtonElement, state: CopyButtonState) {
    const labels: Record<CopyButtonState, string> = {
        copy: '复制下载链接',
        copied: '已复制下载链接',
        failed: '复制失败',
    };

    button.classList.toggle('copied', state === 'copied');
    button.classList.toggle('copy-failed', state === 'failed');
    button.title = labels[state];
    button.setAttribute('aria-label', labels[state]);
    button.replaceChildren(createCopyIcon(state));
}

async function copyText(value: string) {
    try {
        await navigator.clipboard.writeText(value);
        return;
    } catch {
        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        textarea.style.pointerEvents = 'none';
        document.documentElement.appendChild(textarea);

        try {
            textarea.select();
            if (!document.execCommand('copy')) throw new Error('Clipboard write failed');
        } finally {
            textarea.remove();
        }
    }
}

function createPickerContent(shadow: ShadowRoot, downloadUrl: string) {
    const background = document.createElement('div');
    background.className = 'edgedl-bg';

    const card = document.createElement('div');
    card.className = 'edgedl-card';

    const heading = document.createElement('h3');
    heading.textContent = '选择下载器';

    const versionTag = document.createElement('div');
    versionTag.className = 'edgedl-version-tag';
    versionTag.textContent = `EdgeDL v${getEdgeDLVersion()}`;

    const copyButton = document.createElement('button');
    copyButton.className = 'edgedl-copy-button';
    copyButton.type = 'button';
    copyButton.disabled = !downloadUrl;
    copyButton.title = downloadUrl ? '复制下载链接' : '没有可复制的下载链接';
    copyButton.setAttribute('aria-label', copyButton.title);
    copyButton.setAttribute('aria-live', 'polite');
    copyButton.appendChild(createCopyIcon('copy'));

    const options = document.createElement('div');
    options.className = 'edgedl-options';

    for (const option of DOWNLOADER_OPTIONS) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.pkg = option.packageName;
        button.setAttribute('aria-pressed', 'false');

        const icon = document.createElement('img');
        icon.alt = '';
        icon.src = option.icon;

        button.append(icon, document.createTextNode(option.label));
        options.appendChild(button);
    }

    const label = document.createElement('label');
    label.className = 'edgedl-default-label';

    const checkbox = document.createElement('input');
    checkbox.id = 'edgedl-set-default';
    checkbox.className = 'edgedl-default-checkbox';
    checkbox.type = 'checkbox';

    const labelText = document.createElement('span');
    labelText.textContent = '设为默认下载器';

    label.append(checkbox, labelText);
    card.append(heading, versionTag, copyButton, options, label);
    shadow.append(background, card);
}

export async function showDownloadPicker(
    callback: (result: DownloadPickerResult) => void,
    pickerOptions: DownloadPickerOptions = {},
) {
    if (document.getElementById('edgedl-picker')) {
        callback({ type: 'cancel' });
        return;
    }

    const picker = document.createElement('div');
    picker.id = 'edgedl-picker';
    picker.classList.add('initializing');

    const downloadUrl = pickerOptions.downloadUrl?.trim() || '';
    const shadow = picker.attachShadow({ mode: 'open' });
    createPickerContent(shadow, downloadUrl);

    document.documentElement.appendChild(picker);

    const layoutPicker = () => {
        const vvp = window.visualViewport;
        const w = vvp ? vvp.width : document.documentElement.clientWidth;
        const card = shadow.querySelector('.edgedl-card') as HTMLDivElement | null;
        if (card) card.style.maxWidth = w - 32 + 'px';
    };
    layoutPicker();

    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', layoutPicker);
        window.visualViewport.addEventListener('scroll', layoutPicker);
    }

    const style = document.createElement('style');
    style.textContent = `
        :host {
            all: initial;
            position: fixed;
            inset: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 2147483647;
            pointer-events: none;
            contain: layout style paint;
            isolation: isolate;
            --edgedl-bg: #F5F5F5;
            --edgedl-highlight: #FEFEFE;
            --edgedl-text: #242424;
            --edgedl-muted: #6f6f6f;
            --edgedl-control: #b7b7b7;
            --edgedl-selection-line: rgba(0, 0, 0, 0.16);
            --edgedl-selection-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            --edgedl-move-easing: cubic-bezier(0, 0, 0.2, 1);
            --edgedl-fade-easing: cubic-bezier(0.4, 0, 0.2, 1);
            --edgedl-exit-easing: cubic-bezier(0.4, 0, 1, 1);
            --edgedl-enter-duration: 300ms;
            --edgedl-fade-duration: 200ms;
            --edgedl-exit-duration: 200ms;
        }

        *,
        *::before,
        *::after {
            box-sizing: border-box;
        }

        .edgedl-bg {
            position: absolute;
            inset: 0;
            background: rgba(0, 0, 0, 0.42);
            backdrop-filter: blur(25px) saturate(140%);
            -webkit-backdrop-filter: blur(25px) saturate(140%);
            animation: edgedl-fade-in var(--edgedl-fade-duration) var(--edgedl-fade-easing) both;
            pointer-events: auto;
            will-change: opacity;
        }

        :host(.initializing) .edgedl-bg,
        :host(.initializing) .edgedl-card {
            pointer-events: none;
            user-select: none;
            cursor: wait;
        }

        .edgedl-card {
            position: relative;
            background: var(--edgedl-bg);
            color: var(--edgedl-text);
            border-radius: 24px;
            padding: 20px;
            width: 260px;
            max-width: 100%;
            box-shadow: 0 10px 28px rgba(0, 0, 0, 0.25);
            display: flex;
            flex-direction: column;
            align-items: center;
            animation: edgedl-slide-up var(--edgedl-enter-duration) var(--edgedl-move-easing) both;
            transform-origin: center bottom;
            will-change: opacity, transform;
            pointer-events: auto;
            box-sizing: border-box;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            font-weight: 400;
            line-height: 1.4;
            -webkit-font-smoothing: antialiased;
        }

        h3 {
            margin: 8px 0 18px 0;
            font-weight: 600;
            font-size: 16px;
            color: var(--edgedl-text);
        }

        .edgedl-version-tag {
            position: absolute;
            top: 10px;
            left: 12px;
            font-size: 9px;
            transform: translate(0, 0);
            font-family: ui-monospace, SFMono-Regular, monospace;
            color: var(--edgedl-muted);
            background: var(--edgedl-highlight);
            padding: 2px 8px;
            border-radius: 12px;
            font-weight: 600;
            letter-spacing: 0.3px;
            pointer-events: none;
            border: 1px solid rgba(0, 0, 0, 0.02);
        }

        .edgedl-copy-button {
            position: absolute;
            top: 8px;
            right: 10px;
            display: grid;
            place-items: center;
            width: 32px;
            height: 32px;
            padding: 0;
            border: 0;
            border-radius: 6px;
            background: transparent;
            color: var(--edgedl-muted);
            cursor: pointer;
            transition: background 150ms ease, color 150ms ease;
        }

        .edgedl-copy-button:hover,
        .edgedl-copy-button:focus-visible {
            background: var(--edgedl-highlight);
            color: var(--edgedl-text);
            outline: none;
        }

        .edgedl-copy-button:focus-visible {
            box-shadow: 0 0 0 2px var(--edgedl-selection-line);
        }

        .edgedl-copy-button:disabled {
            cursor: default;
        }

        .edgedl-copy-button:disabled:not(.copied):not(.copy-failed) {
            opacity: 0.38;
        }

        .edgedl-copy-button.copied {
            color: #247a32;
        }

        .edgedl-copy-button.copy-failed {
            color: #b42318;
        }

        .edgedl-copy-button svg {
            width: 18px;
            height: 18px;
        }

        .edgedl-options {
            display: flex;
            flex-direction: column;
            width: 100%;
            gap: 12px;
        }

        .edgedl-options button {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px;
            border: none;
            border-radius: 12px;
            background: var(--edgedl-highlight);
            color: var(--edgedl-text);
            font-weight: 500;
            cursor: pointer;
            transition: background 0.2s;
        }

        .edgedl-options button:hover {
            background: var(--edgedl-highlight);
        }

        .edgedl-options img {
            width: 24px;
            height: 24px;
        }

        .edgedl-default-label {
            display: flex;
            align-items: center;
            gap: 8px;
            width: 100%;
            min-height: 38px;
            margin-top: 12px;
            padding: 8px 10px;
            border-radius: 10px;
            background: var(--edgedl-highlight);
            color: var(--edgedl-text);
            font-size: 13px;
            cursor: pointer;
            user-select: none;
            transition: background 150ms ease, box-shadow 150ms ease;
        }

        .edgedl-default-label:hover {
            background: var(--edgedl-highlight);
        }

        .edgedl-default-label:focus-within {
            box-shadow: 0 0 0 2px var(--edgedl-selection-line);
        }

        .edgedl-default-label > span {
            display: block;
            flex: 1;
            min-width: 0;
            line-height: 1.35;
        }

        .edgedl-default-checkbox {
            appearance: none;
            -webkit-appearance: none;
            display: grid;
            flex: 0 0 auto;
            place-content: center;
            width: 18px;
            height: 18px;
            margin: 0;
            border: 1.5px solid var(--edgedl-control);
            border-radius: 5px;
            background: transparent;
            cursor: pointer;
            transition: background 150ms ease, border-color 150ms ease;
        }

        .edgedl-default-checkbox::after {
            content: '';
            width: 5px;
            height: 9px;
            border-right: 2px solid var(--edgedl-text);
            border-bottom: 2px solid var(--edgedl-text);
            opacity: 0;
            transform: translateY(-1px) rotate(45deg) scale(0.7);
            transition: opacity 150ms ease, transform 150ms ease;
        }

        .edgedl-default-checkbox:checked {
            border-color: var(--edgedl-selection-line);
            background: var(--edgedl-highlight);
            box-shadow: var(--edgedl-selection-shadow);
        }

        .edgedl-default-checkbox:checked::after {
            opacity: 1;
            transform: translateY(-1px) rotate(45deg) scale(1);
        }

        .edgedl-default-checkbox:focus-visible {
            outline: 2px solid var(--edgedl-selection-line);
            outline-offset: 2px;
        }

        .edgedl-options button.selected {
            background: var(--edgedl-highlight);
            outline: 1.5px solid var(--edgedl-selection-line);
            box-shadow: var(--edgedl-selection-shadow);
        }

        @media (prefers-color-scheme: dark) {
            :host {
                --edgedl-bg: #292929;
                --edgedl-highlight: #3A3A3A;
                --edgedl-text: #FFFFFF;
                --edgedl-muted: #d0d0d0;
                --edgedl-control: #8f8f8f;
                --edgedl-selection-line: rgba(255, 255, 255, 0.24);
                --edgedl-selection-shadow: 0 2px 8px rgba(0, 0, 0, 0.28);
            }

            .edgedl-card {
                box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
            }

            h3 {
                color: var(--edgedl-text);
            }
        }

        @keyframes edgedl-fade-in {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        @keyframes edgedl-slide-up {
            from { opacity: 0; transform: translateY(24px) scale(0.96); }
            to { opacity: 1; transform: translateY(0) scale(1); }
        }

        @keyframes edgedl-fade-out {
            from { opacity: 1; }
            to { opacity: 0; }
        }

        @keyframes edgedl-slide-down {
            from { opacity: 1; transform: translateY(0) scale(1); }
            to { opacity: 0; transform: translateY(12px) scale(0.98); }
        }

        :host(.closing) .edgedl-bg {
            animation: edgedl-fade-out var(--edgedl-exit-duration) var(--edgedl-exit-easing) forwards;
        }

        :host(.closing) .edgedl-card {
            animation: edgedl-slide-down var(--edgedl-exit-duration) var(--edgedl-exit-easing) forwards;
        }

        @media (prefers-reduced-motion: reduce) {
            .edgedl-bg,
            .edgedl-card,
            :host(.closing) .edgedl-bg,
            :host(.closing) .edgedl-card {
                animation-duration: 1ms;
            }
        }
    `;
    shadow.appendChild(style);

    let copyFeedbackTimeoutId = 0;

    try {
        const copyButton = shadow.querySelector('.edgedl-copy-button') as HTMLButtonElement | null;
        if (!copyButton) throw new Error('Copy button is missing');

        copyButton.addEventListener('click', () => {
            if (!downloadUrl || copyButton.disabled) return;

            copyButton.disabled = true;
            void copyText(downloadUrl)
                .then(() => setCopyButtonState(copyButton, 'copied'))
                .catch((error: unknown) => {
                    console.error('[EdgeDL] Failed to copy download URL', error);
                    setCopyButtonState(copyButton, 'failed');
                })
                .finally(() => {
                    window.clearTimeout(copyFeedbackTimeoutId);
                    copyFeedbackTimeoutId = window.setTimeout(() => {
                        setCopyButtonState(copyButton, 'copy');
                        copyButton.disabled = false;
                    }, 1500);
                });
        });

        // 读取默认下载器
        const defaultDownloader = await storage.get<string | null>(DEFAULT_DOWNLOADER_KEY, null);
        const defaultCheckbox = shadow.querySelector('#edgedl-set-default') as HTMLInputElement | null;
        if (!defaultCheckbox) throw new Error('Default downloader checkbox is missing');

        defaultCheckbox.checked = !!defaultDownloader;

        if (defaultDownloader) {
            // 高亮默认下载器按钮
            const defaultBtn = shadow.querySelector(
                `button[data-pkg="${defaultDownloader}"]`,
            ) as HTMLButtonElement | null;
            if (defaultBtn) {
                defaultBtn.classList.add('selected');
                defaultBtn.setAttribute('aria-pressed', 'true');
            }
        }

        // 取消勾选时清除默认下载器
        defaultCheckbox.addEventListener('change', async () => {
            if (!defaultCheckbox.checked) {
                await storage.remove(DEFAULT_DOWNLOADER_KEY);
                const selectedButton = shadow.querySelector<HTMLButtonElement>('button.selected');
                selectedButton?.classList.remove('selected');
                selectedButton?.setAttribute('aria-pressed', 'false');
            }
        });

        // 点击唤起
        shadow.querySelectorAll<HTMLButtonElement>('.edgedl-options button').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const pkg = btn.dataset.pkg || '';
                const selectedButton = shadow.querySelector<HTMLButtonElement>('button.selected');
                selectedButton?.setAttribute('aria-pressed', 'false');
                selectedButton?.classList.remove('selected');
                btn.classList.add('selected');
                btn.setAttribute('aria-pressed', 'true');

                // 按当前选择更新默认下载器
                if (defaultCheckbox.checked) {
                    await storage.set(DEFAULT_DOWNLOADER_KEY, pkg);
                }

                if (pkg === EDGE_DOWNLOADER_VALUE) {
                    callback({ type: 'edge' });
                } else {
                    callback({ packageName: pkg, type: 'external' });
                }

                gotoClose(false);
            });
        });

        picker.classList.remove('initializing');
    } catch (error) {
        console.error('[EdgeDL] Failed to initialize download picker', error);
        cleanupPicker();
        callback({ type: 'cancel' });
    }

    let removed = false;
    function cleanupPicker() {
        if (removed) return;
        removed = true;
        window.clearTimeout(copyFeedbackTimeoutId);
        if (window.visualViewport) {
            window.visualViewport.removeEventListener('resize', layoutPicker);
            window.visualViewport.removeEventListener('scroll', layoutPicker);
        }
        picker.remove();
        window.dispatchEvent(new CustomEvent('edgedl:picker-closed'));
    }

    function gotoClose(cancelled = true) {
        if (picker.classList.contains('closing')) return;
        if (cancelled) callback({ type: 'cancel' });
        picker.classList.add('closing');

        const card = shadow.querySelector('.edgedl-card') as HTMLDivElement | null;
        const onAnimationEnd = (event: AnimationEvent) => {
            if (!card || event.target !== card) return;
            card.removeEventListener('animationend', onAnimationEnd);
            cleanupPicker();
        };

        card?.addEventListener('animationend', onAnimationEnd);
        window.setTimeout(cleanupPicker, 260);
    }

    shadow.querySelector('.edgedl-bg')?.addEventListener('click', () => gotoClose());
}
