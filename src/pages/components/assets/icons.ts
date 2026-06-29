/**
 * @module components/assets/icons
 * @description 下载器图标资源库
 */
function getIconUrl(path: string) {
    try {
        return chrome.runtime.getURL(path);
    } catch {
        return path;
    }
}

export const downloaderIcons = {
    ABDM: getIconUrl('assets/downloader-icons/abdm.svg'),
    ADM: getIconUrl('assets/downloader-icons/adm.svg'),
    EDGE: getIconUrl('assets/downloader-icons/edge.svg'),
    FDM: getIconUrl('assets/downloader-icons/fdm.svg'),
    IDM: getIconUrl('assets/downloader-icons/idm.svg'),
    IDM_PLUS: getIconUrl('assets/downloader-icons/idm-plus.svg'),
};