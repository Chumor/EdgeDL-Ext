import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test, { afterEach } from 'node:test';

import { applyLocaleDirection, getMessage, getUILanguage, localizeDocument } from '../src/pkg/browser/i18n.ts';

interface MessagePlaceholder {
    content: string;
    example?: string;
}

interface MessageDefinition {
    description: string;
    message: string;
    placeholders?: Record<string, MessagePlaceholder>;
}

type MessageCatalog = Record<string, MessageDefinition>;

interface ChromeMock {
    i18n: {
        getMessage(messageName: string, substitutions?: string | string[]): string;
        getUILanguage(): string;
    };
}

class TestElement {
    readonly dataset: Record<string, string> = {};
    dir = '';
    lang = '';
    textContent: string | null = null;

    private readonly attributes = new Map<string, string>();

    getAttribute(name: string) {
        return this.attributes.get(name) ?? null;
    }

    setAttribute(name: string, value: string) {
        this.attributes.set(name, value);
    }
}

class TestDocument {
    readonly documentElement = new TestElement();

    private readonly elements: Record<string, TestElement[]>;

    constructor(elements: Record<string, TestElement[]>) {
        this.elements = elements;
    }

    querySelectorAll(selector: string) {
        return this.elements[selector] || [];
    }
}

const runtimeGlobal = globalThis as typeof globalThis & { chrome?: ChromeMock };
const originalChrome = runtimeGlobal.chrome;
const projectRoot = new URL('../', import.meta.url);
const localesRoot = new URL('src/_locales/', projectRoot);

async function readJson<T>(url: URL) {
    return JSON.parse(await readFile(url, 'utf8')) as T;
}

function getNamedPlaceholders(message: string) {
    return [...message.matchAll(/\$([A-Z][A-Z0-9_]*)\$/g)].map((match) => match[1].toLowerCase()).sort();
}

async function getSourceFiles(directory: URL): Promise<URL[]> {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = await Promise.all(
        entries.map(async (entry) => {
            const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
            if (entry.isDirectory()) return getSourceFiles(url);
            return /\.(?:html|ts)$/.test(entry.name) ? [url] : [];
        }),
    );
    return files.flat();
}

afterEach(() => {
    if (originalChrome) runtimeGlobal.chrome = originalChrome;
    else delete runtimeGlobal.chrome;
});

test('i18n helpers format fallback messages without the browser API', () => {
    delete runtimeGlobal.chrome;

    assert.equal(getMessage('simple-key'), 'simple-key');
    assert.equal(getMessage('hello $1', 'world'), 'hello world');
    assert.equal(getMessage('first $1 second $2', ['one', 'two']), 'first one second two');
    assert.equal(getMessage('only $1 and $2', ['one']), 'only one and ');
    assert.equal(getMessage('$1-$2-$3', []), '--');
    assert.equal(getUILanguage(), 'en');
});

test('i18n helpers use browser-provided messages and UI language', () => {
    const calls: Array<[string, string | string[] | undefined]> = [];
    let languageCalls = 0;
    runtimeGlobal.chrome = {
        i18n: {
            getMessage(messageName, substitutions) {
                calls.push([messageName, substitutions]);
                if (messageName === 'withSubstitutions') {
                    const values = typeof substitutions === 'string' ? [substitutions] : substitutions || [];
                    return `message: ${values.join(',')}`;
                }
                return `message:${messageName}`;
            },
            getUILanguage() {
                languageCalls += 1;
                return 'fr';
            },
        },
    };

    assert.equal(getMessage('plain'), 'message:plain');
    assert.equal(getMessage('withSubstitutions', ['one', 'two']), 'message: one,two');
    assert.equal(getUILanguage(), 'fr');
    assert.deepEqual(calls, [
        ['plain', undefined],
        ['withSubstitutions', ['one', 'two']],
    ]);
    assert.equal(languageCalls, 1);
});

test('localizeDocument applies locale direction, text, and localized attributes', () => {
    const messages: Record<string, string> = {
        '@@bidi_dir': 'rtl',
        ariaLabelText: 'Libelle',
        hello: 'Bonjour',
        placeholderText: 'Tapez ici',
        titleText: 'Titre',
    };
    runtimeGlobal.chrome = {
        i18n: {
            getMessage(messageName) {
                return messages[messageName] || '';
            },
            getUILanguage() {
                return 'fr_CA';
            },
        },
    };

    const heading = new TestElement();
    heading.dataset.i18n = 'hello';
    const input = new TestElement();
    input.setAttribute('data-i18n-placeholder', 'placeholderText');
    const button = new TestElement();
    button.setAttribute('data-i18n-title', 'titleText');
    button.setAttribute('data-i18n-aria-label', 'ariaLabelText');
    const root = new TestDocument({
        '[data-i18n]': [heading],
        '[data-i18n-aria-label]': [button],
        '[data-i18n-placeholder]': [input],
        '[data-i18n-title]': [button],
    });

    localizeDocument(root as unknown as Document);

    assert.equal(root.documentElement.lang, 'fr-CA');
    assert.equal(root.documentElement.dir, 'rtl');
    assert.equal(heading.textContent, 'Bonjour');
    assert.equal(input.getAttribute('placeholder'), 'Tapez ici');
    assert.equal(button.getAttribute('title'), 'Titre');
    assert.equal(button.getAttribute('aria-label'), 'Libelle');

    const standaloneElement = new TestElement();
    applyLocaleDirection(standaloneElement as unknown as HTMLElement);
    assert.equal(standaloneElement.lang, 'fr-CA');
    assert.equal(standaloneElement.dir, 'rtl');
});

test('locale catalogs have matching valid messages and placeholders', async () => {
    const localeNames = (await readdir(localesRoot, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();

    assert.deepEqual(localeNames, ['en', 'zh_CN']);

    const catalogs = await Promise.all(
        localeNames.map((locale) => readJson<MessageCatalog>(new URL(`${locale}/messages.json`, localesRoot))),
    );
    const expectedKeys = Object.keys(catalogs[0]).sort();

    for (const [index, catalog] of catalogs.entries()) {
        assert.deepEqual(Object.keys(catalog).sort(), expectedKeys, `${localeNames[index]} message keys differ`);

        for (const [key, definition] of Object.entries(catalog)) {
            assert.match(key, /^[A-Za-z0-9_]+$/, `${localeNames[index]} has an invalid message key: ${key}`);
            assert.ok(definition.message.trim(), `${localeNames[index]}.${key} has an empty message`);
            assert.ok(definition.description.trim(), `${localeNames[index]}.${key} has no translator description`);

            const placeholders = Object.keys(definition.placeholders || {}).sort();
            assert.deepEqual(
                getNamedPlaceholders(definition.message),
                placeholders,
                `${localeNames[index]}.${key} placeholder definitions differ from the message`,
            );
            for (const placeholder of Object.values(definition.placeholders || {})) {
                assert.match(placeholder.content, /^\$\d+$/, `${localeNames[index]}.${key} has an invalid placeholder`);
            }
        }
    }
});

test('manifest localization follows extension requirements', async () => {
    const manifest = await readJson<Record<string, unknown>>(new URL('src/manifest.json', projectRoot));
    const defaultLocale = manifest.default_locale;

    assert.equal(defaultLocale, 'en');
    const catalog = await readJson<MessageCatalog>(new URL(`${String(defaultLocale)}/messages.json`, localesRoot));
    const manifestText = JSON.stringify(manifest);
    const manifestKeys = [...manifestText.matchAll(/__MSG_([A-Za-z0-9_]+)__/g)].map((match) => match[1]);

    assert.ok(manifestKeys.length > 0, 'manifest does not contain localized fields');
    for (const key of manifestKeys) assert.ok(catalog[key], `manifest references missing message: ${key}`);
    assert.ok(
        catalog.extensionDescription.message.length <= 132,
        'default extension description exceeds 132 characters',
    );
});

test('source localization references exist in every catalog', async () => {
    const catalog = await readJson<MessageCatalog>(new URL('en/messages.json', localesRoot));
    const sourceFiles = await getSourceFiles(new URL('src/', projectRoot));
    const referencedKeys = new Set<string>();

    for (const file of sourceFiles) {
        const source = await readFile(file, 'utf8');
        for (const match of source.matchAll(/getMessage\(\s*['"]([^'"]+)['"]/g)) referencedKeys.add(match[1]);
        for (const match of source.matchAll(/data-i18n(?:-(?:aria-label|placeholder|title))?=["']([^"']+)["']/g)) {
            referencedKeys.add(match[1]);
        }
    }

    for (const key of referencedKeys) {
        if (key.startsWith('@@')) continue;
        assert.ok(catalog[key], `source references missing message: ${key}`);
    }
});
