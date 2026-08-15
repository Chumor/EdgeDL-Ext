export const EDGEDL_MESSAGE_SOURCE = 'edgedl-ext' as const;

export interface DownloadRequestMessage {
    source: typeof EDGEDL_MESSAGE_SOURCE;
    type: 'download-request';
    url: string;
    explicitControl?: boolean;
}

export interface Aria2AddUriMessage {
    source: typeof EDGEDL_MESSAGE_SOURCE;
    type: 'aria2-add-uri';
    url: string;
    referer?: string;
}

export interface Aria2TestConnectionMessage {
    source: typeof EDGEDL_MESSAGE_SOURCE;
    type: 'aria2-test-connection';
}

export type Aria2RuntimeMessage = Aria2AddUriMessage | Aria2TestConnectionMessage;

export type Aria2RuntimeResponse =
    | { gid: string; ok: true; version?: never }
    | { gid?: never; ok: true; version: string }
    | { error: string; ok: false };

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

export function isAria2RuntimeMessage(value: unknown): value is Aria2RuntimeMessage {
    if (!value || typeof value !== 'object') return false;

    const message = value as Record<PropertyKey, unknown>;
    if (message.source !== EDGEDL_MESSAGE_SOURCE) return false;
    if (message.type === 'aria2-test-connection') return true;

    return (
        message.type === 'aria2-add-uri' &&
        typeof message.url === 'string' &&
        (message.referer === undefined || typeof message.referer === 'string')
    );
}
