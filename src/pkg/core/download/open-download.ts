/**
 * @module adapter/factory
 * @description 下载任务分发工厂，匹配对应的下载适配器
 */
import { showToast } from '@/pages/components/toast';
import { openDownloader } from '@/pkg/core/launcher';
import { DOWNLOADERS } from '@/pkg/services/config';

/**
 * 调用指定下载器执行下载任务
 * @async
 * @param {string} url - 目标下载链接
 * @param {string} downloader - 外部下载器包名
 * @returns {boolean} 是否成功匹配并唤起下载器
 */
export function openDownload(url: string, downloader: string) {
    const launcherKey = (Object.keys(DOWNLOADERS) as Array<keyof typeof DOWNLOADERS>).find(
        (key) => DOWNLOADERS[key] === downloader,
    );
    if (!launcherKey) {
        showToast('无法打开下载器');
        return false;
    }

    showToast(`${launcherKey} 正在唤起`);
    openDownloader(url, launcherKey);
    return true;
}
