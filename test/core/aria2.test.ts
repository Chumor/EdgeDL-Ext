import assert from 'node:assert/strict';
import test from 'node:test';

import {
    DEFAULT_ARIA2_CONFIG,
    addAria2Uri,
    getAria2Version,
    normalizeAria2Config,
    normalizeAria2Endpoint,
} from '../../src/pkg/core/aria2/index.ts';

function createJsonResponse(payload: unknown, status = 200) {
    return new Response(JSON.stringify(payload), {
        headers: { 'Content-Type': 'application/json' },
        status,
    });
}

function readRpcRequest(init: RequestInit | undefined) {
    return JSON.parse(String(init?.body)) as { id: string; method?: string; params?: unknown[] };
}

test('normalizes aria2 configuration and validates RPC endpoints', () => {
    assert.deepEqual(normalizeAria2Config(null), DEFAULT_ARIA2_CONFIG);
    assert.deepEqual(
        normalizeAria2Config({
            directory: ' /downloads ',
            endpoint: ' http://localhost:6800/jsonrpc ',
            secret: ' key ',
        }),
        {
            directory: '/downloads',
            endpoint: 'http://localhost:6800/jsonrpc',
            secret: ' key ',
        },
    );
    assert.equal(normalizeAria2Endpoint('http://127.0.0.1:6800/jsonrpc'), 'http://127.0.0.1:6800/jsonrpc');
    assert.equal(normalizeAria2Endpoint(''), DEFAULT_ARIA2_CONFIG.endpoint);
    assert.equal(normalizeAria2Endpoint('   '), DEFAULT_ARIA2_CONFIG.endpoint);
    assert.throws(() => normalizeAria2Endpoint('ws://127.0.0.1:6800/jsonrpc'), /HTTP 或 HTTPS/);
    assert.throws(() => normalizeAria2Endpoint('not a URL'), /格式无效/);
    assert.throws(() => normalizeAria2Endpoint('http://@/jsonrpc'), /missing hostname/i);
    assert.throws(() => normalizeAria2Endpoint('http:///jsonrpc'), /missing hostname/i);
    assert.throws(() => normalizeAria2Endpoint('http://user:pass@127.0.0.1:6800/jsonrpc'), /embedded credentials/i);
});

test('adds a URI with token, directory, and referer options', async () => {
    let requestUrl = '';
    let requestInit: RequestInit | undefined;
    const fetchImpl: typeof fetch = async (input, init) => {
        requestUrl = String(input);
        requestInit = init;
        const body = readRpcRequest(init);
        return createJsonResponse({ id: body.id, jsonrpc: '2.0', result: '0123456789abcdef' });
    };

    const gid = await addAria2Uri(
        {
            directory: '/storage/emulated/0/Download',
            endpoint: 'http://127.0.0.1:6800/jsonrpc',
            secret: 'rpc-secret',
        },
        'https://example.com/file.zip',
        { referer: 'https://user:pass@example.com/downloads#secret' },
        { fetchImpl },
    );

    assert.equal(gid, '0123456789abcdef');
    assert.equal(requestUrl, 'http://127.0.0.1:6800/jsonrpc');
    assert.equal(requestInit?.method, 'POST');

    const body = JSON.parse(String(requestInit?.body)) as { method: string; params: unknown[] };
    assert.equal(body.method, 'aria2.addUri');
    assert.deepEqual(body.params, [
        'token:rpc-secret',
        ['https://example.com/file.zip'],
        {
            dir: '/storage/emulated/0/Download',
            referer: 'https://example.com/downloads',
        },
    ]);
});

test('rejects non-HTTP(S) download URLs before making an RPC call', async () => {
    let called = false;
    const fetchImpl: typeof fetch = async () => {
        called = true;
        throw new Error('fetch should not be called');
    };

    await assert.rejects(
        () => addAria2Uri(DEFAULT_ARIA2_CONFIG, 'ftp://example.com/file.zip', {}, { fetchImpl }),
        /aria2 仅支持 HTTP 或 HTTPS 下载地址/,
    );
    assert.equal(called, false);
});

test('omits an invalid referer from aria2 RPC options', async () => {
    let lastRpcRequestBody: { params?: unknown[] } | undefined;
    const fetchImpl: typeof fetch = async (_input, init) => {
        const body = readRpcRequest(init);
        lastRpcRequestBody = body;
        return createJsonResponse({ id: body.id, jsonrpc: '2.0', result: '0123456789abcdef' });
    };

    const gid = await addAria2Uri(
        {
            directory: '/downloads',
            endpoint: DEFAULT_ARIA2_CONFIG.endpoint,
            secret: 'rpc-secret',
        },
        'https://example.com/file.zip',
        { referer: 'not a url' },
        { fetchImpl },
    );

    assert.equal(gid, '0123456789abcdef');
    const params = lastRpcRequestBody?.params;
    assert.ok(params);
    assert.deepEqual(params[0], 'token:rpc-secret');
    assert.deepEqual(params[1], ['https://example.com/file.zip']);
    assert.deepEqual(params[2], { dir: '/downloads' });
    assert.ok(!('referer' in (params[2] as Record<string, string>)));
});

test('normalizes an empty saved configuration to its defaults', () => {
    assert.deepEqual(normalizeAria2Config({ directory: '   ', endpoint: '   ', secret: '' }), DEFAULT_ARIA2_CONFIG);
});

test('gets the aria2 version without adding an empty token', async () => {
    let params: unknown[] = [];
    const fetchImpl: typeof fetch = async (_input, init) => {
        const body = readRpcRequest(init);
        params = body.params || [];
        return createJsonResponse({ id: body.id, jsonrpc: '2.0', result: { version: '1.37.0' } });
    };

    const result = await getAria2Version(DEFAULT_ARIA2_CONFIG, { fetchImpl });

    assert.equal(result.version, '1.37.0');
    assert.deepEqual(params, []);
});

test('rejects malformed aria2 results', async () => {
    const missingVersion: typeof fetch = async (_input, init) => {
        const body = readRpcRequest(init);
        return createJsonResponse({ id: body.id, jsonrpc: '2.0', result: {} });
    };
    const missingGid: typeof fetch = async (_input, init) => {
        const body = readRpcRequest(init);
        return createJsonResponse({ id: body.id, jsonrpc: '2.0', result: null });
    };

    await assert.rejects(() => getAria2Version(DEFAULT_ARIA2_CONFIG, { fetchImpl: missingVersion }), /版本信息无效/);
    await assert.rejects(
        () => addAria2Uri(DEFAULT_ARIA2_CONFIG, 'https://example.com/file.zip', {}, { fetchImpl: missingGid }),
        /任务 GID 无效/,
    );
});

test('rejects responses with an invalid JSON-RPC envelope', async () => {
    const invalidJsonRpc: typeof fetch = async (_input, init) => {
        const body = readRpcRequest(init);
        return createJsonResponse({ id: body.id, jsonrpc: '1.0', result: { version: '1.37.0' } });
    };
    const mismatchedId: typeof fetch = async () =>
        createJsonResponse({ id: 'another-request', jsonrpc: '2.0', result: { version: '1.37.0' } });
    const bothResultAndError: typeof fetch = async (_input, init) => {
        const body = readRpcRequest(init);
        return createJsonResponse({
            error: { code: 1, message: 'Unauthorized' },
            id: body.id,
            jsonrpc: '2.0',
            result: null,
        });
    };
    const invalidError: typeof fetch = async (_input, init) => {
        const body = readRpcRequest(init);
        return createJsonResponse({ error: { code: '1', message: 'Unauthorized' }, id: body.id, jsonrpc: '2.0' });
    };

    await assert.rejects(
        () => getAria2Version(DEFAULT_ARIA2_CONFIG, { fetchImpl: invalidJsonRpc }),
        /jsonrpc 或 id 无效/,
    );
    await assert.rejects(
        () => getAria2Version(DEFAULT_ARIA2_CONFIG, { fetchImpl: mismatchedId }),
        /jsonrpc 或 id 无效/,
    );
    await assert.rejects(
        () => getAria2Version(DEFAULT_ARIA2_CONFIG, { fetchImpl: bothResultAndError }),
        /必须包含 result 或 error 之一/,
    );
    await assert.rejects(() => getAria2Version(DEFAULT_ARIA2_CONFIG, { fetchImpl: invalidError }), /错误对象格式无效/);
});

test('surfaces network-level failures', async () => {
    const networkFailure: typeof fetch = async () => {
        throw new Error('socket hang up');
    };

    await assert.rejects(
        () => getAria2Version(DEFAULT_ARIA2_CONFIG, { fetchImpl: networkFailure }),
        /无法连接 aria2：.*socket hang up/,
    );
});

test('surfaces invalid JSON bodies', async () => {
    const invalidJsonBody: typeof fetch = async (_input, init) => {
        readRpcRequest(init);
        return {
            ok: true,
            status: 200,
            json: async () => {
                throw new Error('Unexpected token');
            },
        } as unknown as Response;
    };

    await assert.rejects(
        () => getAria2Version(DEFAULT_ARIA2_CONFIG, { fetchImpl: invalidJsonBody }),
        /aria2 RPC 返回了无效的 JSON/,
    );
});

test('surfaces JSON-RPC and HTTP failures', async () => {
    const rpcFailure: typeof fetch = async (_input, init) => {
        const body = readRpcRequest(init);
        return createJsonResponse({ error: { code: 1, message: 'Unauthorized' }, id: body.id, jsonrpc: '2.0' });
    };
    const httpFailure: typeof fetch = async () => createJsonResponse({}, 503);

    await assert.rejects(
        () => getAria2Version(DEFAULT_ARIA2_CONFIG, { fetchImpl: rpcFailure }),
        /aria2 RPC 错误 \(1\)：Unauthorized/,
    );
    await assert.rejects(() => getAria2Version(DEFAULT_ARIA2_CONFIG, { fetchImpl: httpFailure }), /HTTP 503/);
});

test('times out while the RPC response body is still pending', async () => {
    const fetchImpl: typeof fetch = async (_input, init) =>
        ({
            ok: true,
            json: () =>
                new Promise<unknown>((_resolve, reject) => {
                    init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {
                        once: true,
                    });
                }),
        }) as Response;

    await assert.rejects(() => getAria2Version(DEFAULT_ARIA2_CONFIG, { fetchImpl, timeoutMs: 20 }), /连接 aria2 超时/);
});
