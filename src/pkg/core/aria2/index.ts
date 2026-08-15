import { getErrorMessage } from '../../utils/error.ts';

export const ARIA2_CONFIG_KEY = 'edgedl-aria2-config';
export const ARIA2_DOWNLOADER_VALUE = 'aria2-rpc';
export const ARIA2_SETTINGS_EXPANDED_KEY = 'edgedl-aria2-settings-expanded';

export interface Aria2Config {
    directory: string;
    endpoint: string;
    secret: string;
}

export interface Aria2Version {
    enabledFeatures?: string[];
    version: string;
}

export interface Aria2CallOptions {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
}

export interface AddAria2UriOptions {
    directory?: string;
    referer?: string;
}

export const DEFAULT_ARIA2_CONFIG: Aria2Config = {
    directory: '',
    endpoint: 'http://127.0.0.1:6800/jsonrpc',
    secret: '',
};

const DEFAULT_RPC_TIMEOUT_MS = 10_000;

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function createRpcId() {
    const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `edgedl-${suffix}`;
}

function createTimeoutError(cause: unknown) {
    return new Error('连接 aria2 超时', { cause });
}

export function normalizeAria2Config(value: unknown): Aria2Config {
    if (!isRecord(value)) return { ...DEFAULT_ARIA2_CONFIG };

    return {
        directory: typeof value.directory === 'string' ? value.directory.trim() : '',
        endpoint:
            typeof value.endpoint === 'string' && value.endpoint.trim()
                ? value.endpoint.trim()
                : DEFAULT_ARIA2_CONFIG.endpoint,
        secret: typeof value.secret === 'string' ? value.secret : '',
    };
}

export function normalizeAria2Endpoint(endpoint: string) {
    const value = endpoint.trim();
    if (!value) return DEFAULT_ARIA2_CONFIG.endpoint;

    const protocolMatch = value.match(/^([a-z][a-z\d+.-]*):\/\//i);
    if (protocolMatch) {
        const protocol = `${protocolMatch[1].toLowerCase()}:`;
        if (!['http:', 'https:'].includes(protocol)) {
            throw new Error('RPC 地址仅支持 HTTP 或 HTTPS');
        }

        const authority = value.slice(protocolMatch[0].length).split(/[/?#]/, 1)[0];
        if (!authority || authority === '@') throw new Error('RPC 地址缺少主机名 (missing hostname)');
    }

    let parsed: URL;

    try {
        parsed = new URL(value);
    } catch {
        throw new Error('RPC 地址格式无效');
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('RPC 地址仅支持 HTTP 或 HTTPS');
    }

    if (!parsed.hostname) throw new Error('RPC 地址缺少主机名 (missing hostname)');
    if (parsed.username || parsed.password) {
        throw new Error('RPC 地址包含嵌入凭据 (embedded credentials)，请使用 RPC 密钥');
    }

    parsed.hash = '';
    return parsed.toString();
}

function buildRpcParams(config: Aria2Config, params: unknown[]) {
    if (!config.secret) return params;
    return [`token:${config.secret}`, ...params];
}

function readRpcError(value: unknown) {
    if (!isRecord(value) || typeof value.code !== 'number' || !Number.isFinite(value.code)) return null;
    if (typeof value.message !== 'string') return null;

    return `aria2 RPC 错误 (${value.code})：${value.message}`;
}

export async function callAria2<T>(
    configValue: Aria2Config,
    method: string,
    params: unknown[] = [],
    options: Aria2CallOptions = {},
): Promise<T> {
    const config = normalizeAria2Config(configValue);
    const endpoint = normalizeAria2Endpoint(config.endpoint);
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs ?? DEFAULT_RPC_TIMEOUT_MS;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const fetchImpl = options.fetchImpl ?? fetch;
    const requestId = createRpcId();

    try {
        let response: Response;
        try {
            response = await fetchImpl(endpoint, {
                body: JSON.stringify({
                    id: requestId,
                    jsonrpc: '2.0',
                    method,
                    params: buildRpcParams(config, params),
                }),
                headers: { 'Content-Type': 'application/json' },
                method: 'POST',
                signal: controller.signal,
            });
        } catch (error: unknown) {
            if (controller.signal.aborted) throw createTimeoutError(error);
            throw new Error(`无法连接 aria2：${getErrorMessage(error)}`, { cause: error });
        }

        if (!response.ok) throw new Error(`aria2 RPC 返回 HTTP ${response.status}`);

        let payload: unknown;
        try {
            payload = await response.json();
        } catch (error: unknown) {
            if (controller.signal.aborted) throw createTimeoutError(error);
            throw new Error('aria2 RPC 返回了无效的 JSON', { cause: error });
        }

        if (!isRecord(payload) || payload.jsonrpc !== '2.0' || payload.id !== requestId) {
            throw new Error('aria2 RPC 响应的 jsonrpc 或 id 无效');
        }

        const hasResult = Object.hasOwn(payload, 'result');
        const hasError = Object.hasOwn(payload, 'error');
        if (hasResult === hasError) {
            throw new Error('aria2 RPC 响应必须包含 result 或 error 之一');
        }

        if (hasError) {
            const rpcError = readRpcError(payload.error);
            if (!rpcError) throw new Error('aria2 RPC 错误对象格式无效');
            throw new Error(rpcError);
        }

        return payload.result as T;
    } finally {
        clearTimeout(timeoutId);
    }
}

export async function getAria2Version(config: Aria2Config, options?: Aria2CallOptions) {
    const result = await callAria2<unknown>(config, 'aria2.getVersion', [], options);
    if (!isRecord(result) || typeof result.version !== 'string') {
        throw new Error('aria2 RPC 返回的版本信息无效');
    }

    return result as unknown as Aria2Version;
}

export async function addAria2Uri(
    config: Aria2Config,
    downloadUrl: string,
    addOptions: AddAria2UriOptions = {},
    callOptions?: Aria2CallOptions,
) {
    const url = new URL(downloadUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('aria2 仅支持 HTTP 或 HTTPS 下载地址');

    const aria2Options: Record<string, string> = {};
    const directory = addOptions.directory?.trim() || config.directory.trim();
    if (directory) aria2Options.dir = directory;

    if (addOptions.referer) {
        try {
            const referer = new URL(addOptions.referer);
            if (['http:', 'https:'].includes(referer.protocol)) {
                referer.hash = '';
                referer.username = '';
                referer.password = '';
                aria2Options.referer = referer.toString();
            }
        } catch {
            // Ignore an invalid page URL; the download URL remains usable.
        }
    }

    const gid = await callAria2<unknown>(config, 'aria2.addUri', [[url.toString()], aria2Options], callOptions);
    if (typeof gid !== 'string' || !gid) throw new Error('aria2 RPC 返回的任务 GID 无效');

    return gid;
}
