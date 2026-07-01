declare namespace chrome {
    namespace runtime {
        interface MessageSender {
            frameId?: number;
            id?: string;
            tab?: tabs.Tab;
            url?: string;
        }

        const lastError: { message?: string } | undefined;
        function getURL(path: string): string;

        const onInstalled: {
            addListener(callback: () => void): void;
        };

        const onMessage: {
            addListener(
                callback: (
                    message: unknown,
                    sender: MessageSender,
                    sendResponse: (response?: unknown) => void,
                ) => boolean | void,
            ): void;
        };
    }

    namespace action {
        function setBadgeBackgroundColor(details: { color: string; tabId?: number }): Promise<void>;
        function setBadgeText(details: { tabId?: number; text: string }): Promise<void>;
        function setTitle(details: { tabId?: number; title: string }): Promise<void>;
    }

    namespace storage {
        interface StorageArea {
            get(keys: string | string[] | Record<string, unknown> | null): Promise<Record<string, unknown>>;
            remove(keys: string | string[]): Promise<void>;
            set(items: Record<string, unknown>): Promise<void>;
        }

        interface StorageChange {
            newValue?: unknown;
            oldValue?: unknown;
        }

        const local: StorageArea;
        const onChanged: {
            addListener(callback: (changes: Record<string, StorageChange>, areaName: string) => void): void;
        };
    }

    namespace tabs {
        interface Tab {
            id?: number;
            title?: string;
            url?: string;
        }

        interface TabActiveInfo {
            tabId: number;
            windowId: number;
        }

        interface TabChangeInfo {
            status?: string;
            url?: string;
        }

        function get(tabId: number): Promise<Tab>;
        function query(queryInfo: Record<string, unknown>): Promise<Tab[]>;
        function sendMessage(tabId: number, message: unknown): Promise<unknown>;

        const onActivated: {
            addListener(callback: (activeInfo: TabActiveInfo) => void): void;
        };

        const onUpdated: {
            addListener(callback: (tabId: number, changeInfo: TabChangeInfo, tab: Tab) => void): void;
        };
    }

    namespace scripting {
        type ExecutionWorld = 'ISOLATED' | 'MAIN';
    }
}
