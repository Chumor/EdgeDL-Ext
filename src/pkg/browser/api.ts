export interface StorageAdapter {
    get<T>(key: string, defaultValue: T): Promise<T>;
    remove(key: string): Promise<void>;
    set<T>(key: string, value: T): Promise<void>;
}

function createStorageAdapter(area: chrome.storage.StorageArea): StorageAdapter {
    return {
        async get<T>(key: string, defaultValue: T) {
            const items = await area.get(key);
            return (items[key] as T | undefined) ?? defaultValue;
        },

        async remove(key: string) {
            await area.remove(key);
        },

        async set<T>(key: string, value: T) {
            await area.set({ [key]: value });
        },
    };
}

export async function queryActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
}

export async function sendMessageToTab<TResponse>(tabId: number, message: unknown) {
    return chrome.tabs.sendMessage(tabId, message) as Promise<TResponse>;
}

export async function sendRuntimeMessage<TResponse>(message: unknown) {
    return chrome.runtime.sendMessage(message) as Promise<TResponse>;
}

export const storage = createStorageAdapter(chrome.storage.local);
