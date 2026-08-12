/**
 * @module core/detector
 * @description 链接分析引擎：基于黑名单路径、文件后缀及特征关键字实现下载意图识别。
 */

// 下载文件后缀匹配
export const EXTENSIONS = [
    '.apk',
    '.apks',
    '.xapk',
    '.apkm',
    '.ipa',
    '.obb',
    '.aab',
    '.zip',
    '.rar',
    '.7z',
    '.tar',
    '.gz',
    '.tgz',
    '.bz2',
    '.xz',
    '.iso',
    '.cab',
    '.jar',
    '.z',
    '.mp4',
    '.mkv',
    '.avi',
    '.mov',
    '.flv',
    '.wmv',
    '.webm',
    '.m4v',
    '.3gp',
    '.ts',
    '.mpg',
    '.mpeg',
    '.vob',
    '.mp3',
    '.flac',
    '.wav',
    '.ogg',
    '.m4a',
    '.aac',
    '.wma',
    '.ape',
    '.pdf',
    '.epub',
    '.mobi',
    '.azw3',
    '.djvu',
    '.doc',
    '.docx',
    '.xls',
    '.xlsx',
    '.ppt',
    '.pptx',
    '.exe',
    '.msi',
    '.bin',
    '.dat',
    '.dmg',
    '.bat',
    '.sh',
    '.img',
    '.torrent',
];

// 下载链接特征匹配
export const KEYWORDS = [
    '/down/',
    '/download/',
    '/downloads/',
    '/dl/',
    '/fetch/',
    '/files/',
    '/file/',
    '/attach/',
    '/attachment/',
    '/repo/',
    '/backup/',
    '/upload/',
    '/releases/download/',
    '/binary/',
    '/pkg/',
    '?file=',
    '&file=',
    '?filename=',
    '&filename=',
    'download?',
    '&download=',
    '?download=',
    'force_download',
    'response-content-disposition=',
    'content-disposition=attachment',
];

// 非下载页面排除规则
const EXCLUDE_PATHS = /\/(login|reg(ister)?|sign(in|up|out)|logout|account|user|blob|src|tree)(?:[/#?]|$)/i;

// 下载跳转页匹配
const REDIRECT_DOWNLOAD_PAGES = [
    // 腾讯游戏
    /\/zlkdatasys\/mct\/(?:d\/[^#/?]+|proj_\d+\/download)\.shtml(?:[#?].*)?$/i,
];

export const DOWNLOAD_CONTROL_VALUE_ATTRIBUTES = [
    'auto-inspect-button-type',
    'data-action',
    'data-command',
    'data-purpose',
    'data-type',
] as const;

export const DOWNLOAD_CONTROL_URL_ATTRIBUTES = [
    'data-download-url',
    'data-download-href',
    'data-download-link',
] as const;

export const DOWNLOAD_CLICK_URL_ATTRIBUTES = [
    'href',
    'data-ng-href',
    'data-href',
    'data-gokey',
    ...DOWNLOAD_CONTROL_URL_ATTRIBUTES,
    'data-url',
] as const;

const DOWNLOAD_CONTROL_SELECTORS = [
    '[download]',
    ...DOWNLOAD_CONTROL_VALUE_ATTRIBUTES.map((name) => `[${name}="download" i]`),
    ...DOWNLOAD_CONTROL_URL_ATTRIBUTES.map((name) => `[${name}]`),
];

export const DOWNLOAD_CONTROL_SELECTOR = DOWNLOAD_CONTROL_SELECTORS.join(', ');

export const DOWNLOAD_CLICK_TARGET_SELECTOR = [
    'a',
    'button',
    '[role="button"]',
    '[onclick]',
    ...DOWNLOAD_CONTROL_SELECTORS,
    ...DOWNLOAD_CLICK_URL_ATTRIBUTES.filter((name) => name !== 'href').map((name) => `[${name}]`),
].join(', ');

export const DOWNLOAD_TRIGGER_SELECTOR = [
    DOWNLOAD_CONTROL_SELECTOR,
    '[class*="download" i]',
    '[id*="download" i]',
    '[dt-eid*="download" i]',
].join(', ');

/**
 * Determines whether an element explicitly represents a download control.
 * URL analysis remains separate because many sites use extensionless download endpoints.
 */
export function isDownloadControl(element: Pick<Element, 'hasAttribute' | 'getAttribute'> | null) {
    if (!element) return false;
    if (element.hasAttribute('download')) return true;

    if (DOWNLOAD_CONTROL_VALUE_ATTRIBUTES.some((name) => element.getAttribute(name)?.toLowerCase() === 'download'))
        return true;
    if (DOWNLOAD_CONTROL_URL_ATTRIBUTES.some((name) => Boolean(element.getAttribute(name)?.trim()))) return true;

    return false;
}

export function getDownloadUrlFromElement(
    element: (Pick<Element, 'getAttribute'> & { readonly href?: string }) | null,
) {
    if (!element) return '';

    for (const name of DOWNLOAD_CLICK_URL_ATTRIBUTES) {
        const value = element.getAttribute(name);
        if (!value?.trim()) continue;

        if (name === 'data-gokey') {
            const embeddedUrl = value.match(/download_url=([^&]+)/)?.[1];
            if (embeddedUrl) return embeddedUrl;
            continue;
        }

        return value;
    }

    return element.href || '';
}

function isHttpUrl(url: string) {
    if (!/^https?:\/\//i.test(url)) return false;

    try {
        const parsedUrl = new URL(url);
        return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
    } catch {
        return false;
    }
}

export function isDownloadCandidate(url: string, explicitControl = false) {
    return isHttpUrl(url) && (explicitControl || isDownloadLink(url));
}

// 下载链接检测
export function isDownloadLink(url: string) {
    if (url?.includes('sourceforge.net/projects/') && url.includes('/files/')) return false;
    if (!url || !isHttpUrl(url)) return false;
    const lowerUrl = url.toLowerCase();

    // 排除非下载页面
    if (EXCLUDE_PATHS.test(lowerUrl)) return false;

    // 排除类 Unix 目录路径
    if (/\/data\/data\/[^?#]*$/i.test(lowerUrl)) return false;

    // 下载跳转页匹配
    if (REDIRECT_DOWNLOAD_PAGES.some((pattern) => pattern.test(lowerUrl))) return true;

    // 后缀匹配
    try {
        const path = new URL(url).pathname.toLowerCase();
        if (EXTENSIONS.some((ext) => path.endsWith(ext))) return true;
    } catch {
        const path = lowerUrl.split('?')[0].split('#')[0];
        if (EXTENSIONS.some((ext) => path.endsWith(ext))) return true;
    }

    // 关键字匹配
    return KEYWORDS.some((kw) => lowerUrl.includes(kw));
}
