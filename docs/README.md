# EdgeDL-Ext

**English** | [简体中文](README_CN.md)

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-D22128.svg)](../LICENSE)
[![Latest Release](https://img.shields.io/github/v/release/Chumor/EdgeDL-Ext?label=Release)](https://github.com/Chumor/EdgeDL-Ext/releases/latest)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Android](https://img.shields.io/badge/Android-3DDC84?logo=android&logoColor=white)](https://www.android.com/)

> Send download requests from Microsoft Edge on Android to the external downloader you choose.

**EdgeDL-Ext** is a Manifest V3 extension for Microsoft Edge on Android. It detects download behavior on webpages and, based on your configuration, sends download requests to an external download manager or leaves them to Edge.

## Core Features

- **Download takeover:** Send download requests to supported external download managers based on your configuration, or leave them to Edge.
- **Downloader support:** Supports 1DM, 1DM+, ADM, ABDM, FDM and aria2 RPC.
- **Handling strategies:**
  - **Default handling:** Specify the default target for download requests.
  - **Ask on download:** Choose an external downloader or Edge before each download.
  - **Edge handling:** Explicitly do not take over the download and let Edge follow its normal flow.
- **Site rules:** Enable or skip download takeover per website.
- **Download detection:** Detect common download links and download behavior triggered by page scripts.
- **Local configuration:** Default handling, site rules, and other settings are stored locally in the browser.
- **Mobile interface:** Provides a compact extension management interface for Microsoft Edge on Android.

## Supported Handling Options

| Option | Android package / description |
| --- | --- |
| 1DM | `idm.internet.download.manager` |
| 1DM+ | `idm.internet.download.manager.plus` |
| ADM | `com.dv.adm` |
| ABDM | `com.abdownloadmanager` |
| FDM | `org.freedownloadmanager.fdm` |
| Aria2 RPC | Use aria2 RPC through `aria2.addUri` |
| Edge | Do not take over the download; let Microsoft Edge handle it |

> EdgeDL-Ext is responsible for detecting and forwarding download requests. Whether the final download succeeds depends on the target downloader, the website's download flow, and the Android system environment.

### Aria2 RPC Configuration

Enable **Aria2 RPC** in the Popup, then set the endpoint, optional secret, and download directory. Default: `http://127.0.0.1:6800/jsonrpc`. Local, LAN, and remote services are supported.

The secret stays in browser-local storage. Use **Test connection** to verify the settings.

## Installation

- **Stable release:** https://github.com/Chumor/EdgeDL-Ext/releases/latest

## Permissions

| Permission | Purpose |
| --- | --- |
| `storage` | Save site settings, default handling, and other local configuration. |
| `tabs` | Get current tab information for Popup display and site-level configuration. |
| `<all_urls>` | Detect downloads and connect to the configured aria2 RPC endpoint. |

EdgeDL-Ext requests `<all_urls>` because download buttons, download links, and script-triggered downloads can appear on any website; the background service also needs to connect to the configured aria2 RPC endpoint. The extension processes download detection and configuration locally and does not upload browsing or download history.

## Compatibility Notes

EdgeDL-Ext's download takeover capability is affected by website implementation, Android system restrictions, and download manager compatibility, including but not limited to:

- special download mechanisms such as blob URLs, temporary signed URLs, and multi-step redirects;
- download flows that depend on page scripts, user sessions, authentication cookies, request headers, or one-time tokens;
- Android system restrictions on browsers opening external apps;
- downloader support for specific protocols or request parameters;
- extension compatibility differences between versions of Microsoft Edge on Android.

Websites with special download flows may require dedicated adaptation.

## Relationship to EdgeDL

**EdgeDL** is the original userscript project.

**EdgeDL-Ext** follows the same core idea, but is reimplemented for Microsoft Edge on Android and the Manifest V3 extension environment, including extension permissions, background service, page bridge, Popup management interface, and local configuration storage.

## Acknowledgements

- Vectors and icons by [SVG Repo](https://www.svgrepo.com)
- `aria2.svg` from [selfh.st/icons](https://github.com/selfhst/icons/blob/main/svg/aria2.svg), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

## License

EdgeDL-Ext is released under the [Apache License 2.0](../LICENSE).
