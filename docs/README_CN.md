# EdgeDL-Ext

[English](README.md) | **简体中文**

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-D22128.svg)](../LICENSE)
[![Latest Release](https://img.shields.io/github/v/release/Chumor/EdgeDL-Ext?label=Release)](https://github.com/Chumor/EdgeDL-Ext/releases/latest)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Android](https://img.shields.io/badge/Android-3DDC84?logo=android&logoColor=white)](https://www.android.com/)

> 将 Android 版 Microsoft Edge 的下载请求交给你选择的外部下载器。

**EdgeDL-Ext** 是一款面向 Android 版 Microsoft Edge 的 Manifest V3 扩展，用于识别网页中的下载行为，并按照你的配置将下载请求交给外部下载管理器，或保留由 Edge 自行处理。

## 核心能力

- **下载接管：** 根据配置将下载请求交给受支持的外部下载管理器，或保留由 Edge 自行处理。
- **下载器支持：** 支持 1DM、1DM+、ADM、ABDM 和 FDM。
- **处理策略：**
  - **默认处理方式：** 为下载请求指定默认的处理目标。
  - **下载时询问：** 每次下载前选择外部下载器或交给 Edge。
  - **Edge 处理：** 明确不接管下载，由 Edge 按默认流程处理。
- **站点规则：** 支持按网站启用或跳过下载接管。
- **下载识别：** 识别常见下载链接以及页面脚本触发的下载行为。
- **本地配置：** 默认处理方式、站点规则等配置均保存在浏览器本地。
- **移动端界面：** 提供适配 Android 版 Microsoft Edge 的紧凑型扩展管理界面。

## 支持的处理方式

| 处理方式 | Android 包名 / 说明 |
| --- | --- |
| 1DM | `idm.internet.download.manager` |
| 1DM+ | `idm.internet.download.manager.plus` |
| ADM | `com.dv.adm` |
| ABDM | `com.abdownloadmanager` |
| FDM | `org.freedownloadmanager.fdm` |
| Edge | 不接管下载，由 Microsoft Edge 自行处理 |

> EdgeDL-Ext 负责识别并转交下载请求；最终下载是否成功，取决于目标下载器、网站下载流程以及 Android 系统环境。

## 安装

- **稳定版：** https://github.com/Chumor/EdgeDL-Ext/releases/latest

## 权限说明

| 权限 | 用途 |
| --- | --- |
| `storage` | 保存站点设置、默认处理方式等本地配置。 |
| `tabs` | 获取当前标签页信息，用于 Popup 展示和站点级配置。 |
| `<all_urls>` | 在网页中检测下载链接和脚本触发的下载行为。 |

EdgeDL-Ext 请求 `<all_urls>`，是因为下载按钮、下载链接和脚本触发的下载行为可能出现在任意网站中。扩展仅在本地处理相关请求，不会上传浏览记录或下载记录。

## 兼容性说明

EdgeDL-Ext 的下载接管能力会受到网站实现、Android 系统限制以及下载管理器兼容性的影响，包括但不限于：

- blob URL、临时签名 URL、多段重定向等特殊下载机制；
- 依赖页面脚本、用户会话、鉴权 Cookie、请求 Header 或一次性 Token 的下载流程；
- Android 系统限制浏览器唤起外部应用；
- 下载管理器对特定协议或请求参数的支持情况；
- Android 版 Microsoft Edge 不同版本的扩展兼容性差异。

对于采用特殊下载流程的网站，可能需要进行单独适配。

## 与 EdgeDL 的关系

**EdgeDL** 是原始用户脚本项目。

**EdgeDL-Ext** 延续其核心思路，但面向 Android 版 Microsoft Edge 与 Manifest V3 扩展环境重新实现，包括扩展权限、后台服务、页面桥接、Popup 管理界面和本地配置存储等部分。

## 致谢

- 矢量图与图标来自 [SVG Repo](https://www.svgrepo.com)

## 许可证

EdgeDL-Ext 基于 [Apache License 2.0](../LICENSE) 开源。