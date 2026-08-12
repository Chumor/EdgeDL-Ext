export const EDGEDL_MESSAGE_SOURCE = 'edgedl-ext' as const;

export interface DownloadRequestMessage {
    source: typeof EDGEDL_MESSAGE_SOURCE;
    type: 'download-request';
    url: string;
    explicitControl?: boolean;
}

export function isDownloadRequestMessage(value: unknown): value is DownloadRequestMessage {
    if (!value || typeof value !== 'object') return false;

    const message = value as Record<PropertyKey, unknown>;
    return (
        message.source === EDGEDL_MESSAGE_SOURCE &&
        message.type === 'download-request' &&
        typeof message.url === 'string' &&
        (message.explicitControl === undefined || typeof message.explicitControl === 'boolean')
    );
}
