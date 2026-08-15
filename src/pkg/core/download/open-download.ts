/**
 * @module adapter/factory
 * @description 下载任务分发工厂，匹配对应的下载适配器
 */
import { showToast } from '@/pages/components/toast';
import { sendRuntimeMessage } from '@/pkg/browser/api';
import { EDGEDL_MESSAGE_SOURCE, type Aria2RuntimeResponse } from '@/pkg/browser/messages';
import { ARIA2_DOWNLOADER_VALUE } from '@/pkg/core/aria2';
import { openDownloader } from '@/pkg/core/launcher';
import { DOWNLOADERS } from '@/pkg/services/config';
import { getErrorMessage } from '@/pkg/utils/error';

export type OpenDownloadResult = 'failed' | 'opened' | 'unsupported';

/**
 * 调用指定下载器执行下载任务
 * @async
 * @param {string} url - 目标下载链接
 * @param {string} downloader - 外部下载器包名或 RPC 下载器标识
 * @returns {Promise<OpenDownloadResult>} 分发结果
 */
export async function openDownload(url: string, downloader: string, referer?: string): Promise<OpenDownloadResult> {
    if (downloader === ARIA2_DOWNLOADER_VALUE) {
        showToast('正在发送到 Aria2', { duration: 1800 });

        let response: Aria2RuntimeResponse;
        try {
            response = await sendRuntimeMessage<Aria2RuntimeResponse>({
                referer,
                source: EDGEDL_MESSAGE_SOURCE,
                type: 'aria2-add-uri',
                url,
            });
        } catch (error: unknown) {
            const message = getErrorMessage(error);
            showToast(`Aria2 请求失败：${message}`, { duration: 3200, type: 'error' });
            return 'failed';
        }

        if (!response.ok) {
            showToast(response.error, { duration: 3200, type: 'error' });
            return 'failed';
        }

        showToast('已添加到 Aria2', { duration: 1800 });
        return 'opened';
    }

    const launcherKey = (Object.keys(DOWNLOADERS) as Array<keyof typeof DOWNLOADERS>).find(
        (key) => DOWNLOADERS[key] === downloader,
    );
    if (!launcherKey) {
        showToast('无法打开下载器');
        return 'unsupported';
    }

    showToast(`${launcherKey} 正在唤起`);
    openDownloader(url, launcherKey);
    return 'opened';
}
