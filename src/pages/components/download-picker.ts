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

export async function showDownloadPicker(callback: (result: DownloadPickerResult) => void) {
    if (document.getElementById('edgedl-picker')) {
        callback({ type: 'cancel' });
        return;
    }

    const picker = document.createElement('div');
    picker.id = 'edgedl-picker';
    picker.classList.add('initializing');

    const shadow = picker.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
        <div class="edgedl-bg"></div>
        <div class="edgedl-card">
            <h3>选择下载器</h3>
            <div class="edgedl-version-tag">EdgeDL v${getEdgeDLVersion()}</div>
            <div class="edgedl-options">
                <button data-pkg="${DOWNLOADERS.IDM}">
                    <img src="${downloaderIcons.IDM}" /> 1DM
                </button>
                <button data-pkg="${DOWNLOADERS.IDM_PLUS}">
                    <img src="${downloaderIcons.IDM_PLUS}" /> 1DM+
                </button>
                <button data-pkg="${DOWNLOADERS.ADM}">
                    <img src="${downloaderIcons.ADM}" /> ADM
                </button>
                <button data-pkg="${DOWNLOADERS.ABDM}">
                    <img src="${downloaderIcons.ABDM}" /> ABDM
                </button>
                <button data-pkg="${DOWNLOADERS.FDM}">
                    <img src="${downloaderIcons.FDM}" /> FDM
                </button>
                <button data-pkg="${EDGE_DOWNLOADER_VALUE}">
                    <img src="${downloaderIcons.EDGE}" /> Edge
                </button>
            </div>
            <label style="margin-top: 12px; display: flex; align-items: center; gap: 6px; font-size: 13px;">
                <input type="checkbox" id="edgedl-set-default" /> 设为默认下载器
            </label>
        </div>
    `;

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
            --edgedl-selection-bg: rgba(76, 175, 80, 0.12);
            --edgedl-selection-line: rgba(76, 175, 80, 0.72);
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
            right: 12px;
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

        .edgedl-options button.selected {
            background: var(--edgedl-selection-bg);
            outline: 1.5px solid var(--edgedl-selection-line);
        }

        @media (prefers-color-scheme: dark) {
            :host {
                --edgedl-bg: #292929;
                --edgedl-highlight: #3A3A3A;
                --edgedl-text: #FFFFFF;
                --edgedl-muted: #d0d0d0;
                --edgedl-selection-bg: rgba(129, 199, 132, 0.16);
                --edgedl-selection-line: rgba(129, 199, 132, 0.82);
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

    // 读取默认下载器
    const defaultDownloader = await storage.get<string | null>(DEFAULT_DOWNLOADER_KEY, null);
    const defaultCheckbox = shadow.querySelector('#edgedl-set-default') as HTMLInputElement;
    if (defaultCheckbox) defaultCheckbox.checked = !!defaultDownloader;

    if (defaultDownloader) {
        // 高亮默认下载器按钮
        const defaultBtn = shadow.querySelector(`button[data-pkg="${defaultDownloader}"]`) as HTMLButtonElement | null;
        if (defaultBtn) defaultBtn.classList.add('selected');
    }

    // 取消勾选时清除默认下载器
    defaultCheckbox.addEventListener('change', async () => {
        if (!defaultCheckbox.checked) {
            await storage.remove(DEFAULT_DOWNLOADER_KEY);
            shadow.querySelector('button.selected')?.classList.remove('selected');
        }
    });

    // 点击唤起
    shadow.querySelectorAll('button').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const pkg = btn.dataset.pkg || '';

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

    function gotoClose(cancelled = true) {
        if (picker.classList.contains('closing')) return;
        if (cancelled) callback({ type: 'cancel' });
        picker.classList.add('closing');

        let removed = false;
        const removePicker = () => {
            if (removed) return;
            removed = true;
            if (window.visualViewport) {
                window.visualViewport.removeEventListener('resize', layoutPicker);
                window.visualViewport.removeEventListener('scroll', layoutPicker);
            }
            picker.remove();
            window.dispatchEvent(new CustomEvent('edgedl:picker-closed'));
        };

        const card = shadow.querySelector('.edgedl-card') as HTMLDivElement;
        const onAnimationEnd = (event: AnimationEvent) => {
            if (event.target !== card) return;
            card.removeEventListener('animationend', onAnimationEnd);
            removePicker();
        };

        card?.addEventListener('animationend', onAnimationEnd);
        window.setTimeout(removePicker, 260);
    }

    shadow.querySelector('.edgedl-bg')?.addEventListener('click', () => gotoClose());
}
