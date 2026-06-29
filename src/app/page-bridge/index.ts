import { isDownloadLink } from '@/pkg/core/detector';
import { EDGEDL_MESSAGE_SOURCE } from '@/pkg/browser/messages';

const BRIDGE_INSTALLED_FLAG = '__edgedlPageBridgeInstalled';
const SCRIPT_NAVIGATION_USER_GESTURE_WINDOW_MS = 1500;

interface EdgeDLWindow extends Window {
    [BRIDGE_INSTALLED_FLAG]?: boolean;
}

(() => {
    const edgeDLWindow = window as EdgeDLWindow;
    if (edgeDLWindow[BRIDGE_INSTALLED_FLAG]) return;
    edgeDLWindow[BRIDGE_INSTALLED_FLAG] = true;

    let lastUserGestureAt = 0;
    let interceptEnabled = true;

    function normalizeUrl(input: unknown) {
        if (!input) return '';

        try {
            const url = new URL(String(input), location.href).href;
            return url.startsWith('http') ? url : '';
        } catch {
            return '';
        }
    }

    function hasRecentUserGesture() {
        return Date.now() - lastUserGestureAt <= SCRIPT_NAVIGATION_USER_GESTURE_WINDOW_MS;
    }

    function postDownloadRequest(input: unknown, options?: { requireUserGesture?: boolean }) {
        if (!interceptEnabled) return false;
        if (options?.requireUserGesture && !hasRecentUserGesture()) return false;

        const url = normalizeUrl(input);
        if (!url || !isDownloadLink(url)) return false;

        window.postMessage({
            source: EDGEDL_MESSAGE_SOURCE,
            type: 'download-request',
            url,
        }, '*');

        return true;
    }

    function rememberUserGesture() {
        lastUserGestureAt = Date.now();
    }

    function patchWindowOpen() {
        const originalOpen = window.open;
        window.open = function patchedOpen(url?: string | URL, target?: string, features?: string) {
            if (postDownloadRequest(url)) return null;
            return originalOpen.call(window, url, target, features);
        } as typeof window.open;
    }

    function patchAnchorClick() {
        try {
            const originalClick = HTMLAnchorElement.prototype.click;
            HTMLAnchorElement.prototype.click = function patchedClick(this: HTMLAnchorElement) {
                if (postDownloadRequest(this.href)) return;
                return originalClick.call(this);
            };
        } catch {
            // ignore
        }
    }

    function patchLocationMethods() {
        (['assign', 'replace'] as const).forEach((method) => {
            try {
                const original = Location.prototype[method];
                (Location.prototype as unknown as Record<typeof method, typeof original>)[method] =
                    function patchedLocation(this: Location, url: string | URL) {
                        if (postDownloadRequest(url)) return;
                        return original.call(this, url);
                    } as typeof original;
            } catch {
                // ignore
            }
        });
    }

    function patchIframeNavigation() {
        try {
            const descriptor = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'src');
            if (descriptor?.set) {
                const originalSet = descriptor.set;
                Object.defineProperty(HTMLIFrameElement.prototype, 'src', {
                    ...descriptor,
                    set: function patchedIframeSrc(this: HTMLIFrameElement, value: string) {
                        if (postDownloadRequest(value, { requireUserGesture: true })) return;
                        originalSet.call(this, value);
                    },
                });
            }

            const originalSetAttribute = Element.prototype.setAttribute;
            Element.prototype.setAttribute = function patchedSetAttribute(this: Element, name: string, value: string) {
                if (this instanceof HTMLIFrameElement && name.toLowerCase() === 'src') {
                    if (postDownloadRequest(value, { requireUserGesture: true })) return;
                }
                return originalSetAttribute.call(this, name, value);
            };
        } catch {
            // ignore
        }
    }

    function attachStateListener() {
        window.addEventListener('message', (event) => {
            if (event.source !== window) return;
            const data = event.data as Record<PropertyKey, unknown> | undefined;
            if (data?.source !== EDGEDL_MESSAGE_SOURCE || data.type !== 'intercept-state') return;
            interceptEnabled = data.enabled === true;
        });
    }

    function init() {
        attachStateListener();
        window.addEventListener('pointerdown', rememberUserGesture, true);
        window.addEventListener('keydown', rememberUserGesture, true);

        patchWindowOpen();
        patchAnchorClick();
        patchLocationMethods();
        patchIframeNavigation();
    }

    init();
})();