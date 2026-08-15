/**
 * @module core/download
 * @description 下载请求控制器：负责处理下载任务的调度、默认下载器校验及分发逻辑。
 */
import type { DownloadPickerResult } from '@/pages/components/download-picker';

import { showDownloadPicker } from '@/pages/components/download-picker';
import { storage } from '@/pkg/browser/api';
import { DEFAULT_DOWNLOADER_KEY, EDGE_DOWNLOADER_VALUE } from '@/pkg/services/config';
import { openDownload } from './open-download';

export interface ExternalDownloadRequestResult {
    type: 'external';
}

export interface EdgeDownloadRequestResult {
    type: 'edge';
}

export interface CancelDownloadRequestResult {
    type: 'cancel';
}

export type DownloadRequestResult =
    CancelDownloadRequestResult | EdgeDownloadRequestResult | ExternalDownloadRequestResult;

export interface DownloadRequestOptions {
    referer?: string;
}

export async function requestDownload(
    url: string,
    options: DownloadRequestOptions = {},
): Promise<DownloadRequestResult> {
    if (!url) return { type: 'cancel' };

    const downloader = await storage.get<string | null>(DEFAULT_DOWNLOADER_KEY, null);

    if (downloader === EDGE_DOWNLOADER_VALUE) {
        return { type: 'edge' };
    }

    if (downloader) {
        const result = await openDownload(url, downloader, options.referer);
        if (result !== 'unsupported') return { type: 'external' };

        await storage.remove(DEFAULT_DOWNLOADER_KEY);
    }

    const selected = await new Promise<DownloadPickerResult>((resolve) => {
        void showDownloadPicker(resolve, { downloadUrl: url });
    });

    if (selected.type === 'external') {
        const result = await openDownload(url, selected.packageName, options.referer);
        if (result !== 'unsupported') return { type: 'external' };

        await storage.remove(DEFAULT_DOWNLOADER_KEY);
        return { type: 'cancel' };
    }

    return selected;
}
