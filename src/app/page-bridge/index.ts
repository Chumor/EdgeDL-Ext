import { DOWNLOAD_CONTROL_SELECTOR, isDownloadCandidate, isDownloadControl } from '@/pkg/core/detector';
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
    let lastDownloadControlAt = 0;
    let allowedNavigationUrl = '';
    let allowedNavigationExpiresAt = 0;
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

    function consumeRecentDownloadControl() {
        const recent = Date.now() - lastDownloadControlAt <= SCRIPT_NAVIGATION_USER_GESTURE_WINDOW_MS;
        lastDownloadControlAt = 0;
        return recent;
    }

    function postDownloadRequest(
        input: unknown,
        options?: { explicitControl?: boolean; requireUserGesture?: boolean },
    ) {
        if (!interceptEnabled) return false;
        if (options?.requireUserGesture && !hasRecentUserGesture()) return false;

        const url = normalizeUrl(input);
        if (url && url === allowedNavigationUrl && Date.now() <= allowedNavigationExpiresAt) {
            allowedNavigationUrl = '';
            allowedNavigationExpiresAt = 0;
            return false;
        }

        const explicitControl = options?.explicitControl === true;
        if (!isDownloadCandidate(url, explicitControl)) return false;

        if (explicitControl) lastDownloadControlAt = 0;

        window.postMessage(
            {
                source: EDGEDL_MESSAGE_SOURCE,
                type: 'download-request',
                url,
                explicitControl,
            },
            '*',
        );

        return true;
    }

    function rememberUserGesture(event: PointerEvent | TouchEvent | KeyboardEvent) {
        if (!event.isTrusted) return;
        lastUserGestureAt = Date.now();

        const target = event.target;
        if (!(target instanceof Element)) return;

        const control = target.closest(DOWNLOAD_CONTROL_SELECTOR);
        if (isDownloadControl(control)) lastDownloadControlAt = Date.now();
    }

    function patchWindowOpen() {
        const originalOpen = window.open;
        window.open = function patchedOpen(url?: string | URL, target?: string, features?: string) {
            if (
                postDownloadRequest(url, {
                    explicitControl: consumeRecentDownloadControl(),
                    requireUserGesture: true,
                })
            )
                return null;
            return originalOpen.call(window, url, target, features);
        } as typeof window.open;
    }

    function attachNavigationInterceptor() {
        if (!('navigation' in window)) return;

        window.navigation.addEventListener('navigate', (event) => {
            const recentDownloadControl = consumeRecentDownloadControl();
            if (!event.canIntercept || !event.cancelable || event.hashChange) return;
            if (
                !postDownloadRequest(event.destination.url, {
                    explicitControl: event.downloadRequest != null || recentDownloadControl,
                    requireUserGesture: true,
                })
            )
                return;

            event.preventDefault();
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
                        if (
                            postDownloadRequest(value, {
                                explicitControl: consumeRecentDownloadControl(),
                                requireUserGesture: true,
                            })
                        )
                            return;
                        originalSet.call(this, value);
                    },
                });
            }

            const originalSetAttribute = Element.prototype.setAttribute;
            Element.prototype.setAttribute = function patchedSetAttribute(this: Element, name: string, value: string) {
                if (this instanceof HTMLIFrameElement && name.toLowerCase() === 'src') {
                    if (
                        postDownloadRequest(value, {
                            explicitControl: consumeRecentDownloadControl(),
                            requireUserGesture: true,
                        })
                    )
                        return;
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
            if (data?.source !== EDGEDL_MESSAGE_SOURCE) return;

            if (data.type === 'intercept-state') {
                interceptEnabled = data.enabled === true;
                return;
            }

            if (
                data.type === 'allow-navigation' &&
                typeof data.url === 'string' &&
                typeof data.requestId === 'string'
            ) {
                allowedNavigationUrl = normalizeUrl(data.url);
                allowedNavigationExpiresAt = Date.now() + SCRIPT_NAVIGATION_USER_GESTURE_WINDOW_MS;
                window.postMessage(
                    {
                        source: EDGEDL_MESSAGE_SOURCE,
                        type: 'navigation-allowed',
                        requestId: data.requestId,
                    },
                    '*',
                );
            }
        });
    }

    function init() {
        attachStateListener();
        window.addEventListener('pointerdown', rememberUserGesture, true);
        window.addEventListener('touchstart', rememberUserGesture, true);
        window.addEventListener('keydown', rememberUserGesture, true);
        patchWindowOpen();
        attachNavigationInterceptor();
        patchIframeNavigation();
    }

    init();
})();
