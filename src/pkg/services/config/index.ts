/**
 * @module core/config
 * @description 全局配置中心：管理下载器包名映射及持久化键值对。
 */

/**
 * 受支持的下载器包名 (Package Name) 映射表
 * 用于 Android Intent 唤起特定的下载客户端
 */
export const DOWNLOADERS = {
    IDM: 'idm.internet.download.manager',
    IDM_PLUS: 'idm.internet.download.manager.plus',
    ADM: 'com.dv.adm',
    ABDM: 'com.abdownloadmanager',
    FDM: 'org.freedownloadmanager.fdm',
};

export const EDGE_DOWNLOADER_VALUE = 'edge';

// 默认下载器
export const DEFAULT_DOWNLOADER_KEY = 'edgedl-default-downloader';

// 版本信息
export function getEdgeDLVersion() {
    return '1.0.0';
}