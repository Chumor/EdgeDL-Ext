export type MessageSubstitutions = string | string[];

function formatFallback(fallback: string, substitutions?: MessageSubstitutions) {
    const values = typeof substitutions === 'string' ? [substitutions] : substitutions || [];
    return fallback.replace(/\$(\d+)/g, (_match, index: string) => values[Number(index) - 1] ?? '');
}

export function getMessage(key: string, substitutions?: MessageSubstitutions, fallback = key) {
    if (typeof chrome !== 'undefined' && chrome.i18n) {
        const message = chrome.i18n.getMessage(key, substitutions);
        if (message) return message;
    }

    return formatFallback(fallback, substitutions);
}

export function getUILanguage() {
    if (typeof chrome !== 'undefined' && chrome.i18n) return chrome.i18n.getUILanguage();
    return 'en';
}

export function applyLocaleDirection(element: HTMLElement) {
    element.lang = getUILanguage().replace('_', '-');
    element.dir = getMessage('@@bidi_dir', undefined, 'ltr');
}

const LOCALIZED_ATTRIBUTES = ['aria-label', 'placeholder', 'title'] as const;

export function localizeDocument(root: Document = document) {
    applyLocaleDirection(root.documentElement);

    root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((element) => {
        const key = element.dataset.i18n;
        if (key) element.textContent = getMessage(key);
    });

    for (const attribute of LOCALIZED_ATTRIBUTES) {
        const dataAttribute = `data-i18n-${attribute}`;
        root.querySelectorAll<HTMLElement>(`[${dataAttribute}]`).forEach((element) => {
            const key = element.getAttribute(dataAttribute);
            if (key) element.setAttribute(attribute, getMessage(key));
        });
    }
}
