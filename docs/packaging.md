# Windows EXE 安装包 / Windows installer

[中文首页](../README.md) · [English README](../README.en.md)

## 构建 / Build

在 Windows x64 上，使用已配置好的 Node.js、npm 和 Inno Setup 6：

```powershell
npm ci
npm run package:win
```

Run these commands on Windows x64 with Node.js, npm, and Inno Setup 6 configured. No Python or Java installation is needed to build the installer.

默认直接调用 `iscc`；仅在调用失败时尝试 Inno Setup 6 标准安装路径。自定义安装路径可用 `ISCC_PATH` 指向 `ISCC.exe`。

The script invokes `iscc` first, falling back to standard Inno Setup 6 locations only if the command is not found. Set `ISCC_PATH` for a custom compiler location.

## 产物 / Output

| 路径 / Path | 内容 / Contents |
| --- | --- |
| `release/AIProjectManager-版本号-Setup-x64.exe` | 可分发的安装程序 / Distributable installer |
| `release/AIProjectManager-版本号-Setup-x64.exe.sha256` | SHA-256 校验值 / SHA-256 checksum |
| `release/AIProjectManager-win32-x64/` | 完整应用目录 / Complete application directory |

安装包版本来自 `package.json`。解压目录版运行时需保留整个应用目录，不能只复制其中的 EXE。

The version comes from `package.json`. Keep the complete application directory when using the unpacked executable; the EXE is not a standalone file.

## 安装行为 / Installation behavior

- 默认安装到当前用户的 `%LOCALAPPDATA%\Programs\AI Project Manager`，无需管理员权限。
- 创建开始菜单入口，可选桌面快捷方式，提供 Windows 标准卸载入口。
- 应用 EXE、安装 EXE 和快捷方式使用 `resources/icon.ico`。
- 更新安装使用固定 AppId；卸载不额外清除 Electron 用户数据或项目仓库。
- 当前生成的安装包未配置代码签名，也不会自动上传或发布。

The installer defaults to the current user's application directory, adds a Start-menu entry and optional desktop shortcut, and supports standard Windows uninstallation. A fixed AppId identifies updates. User preferences and project repositories are not explicitly removed. Code signing and automatic publication are not configured.

## 发行结构 / Release architecture

1. Vite 将渲染界面编译到独立暂存目录，使用相对资源路径。该步骤用于发行包，日常开发仍无需前端生产构建。
2. esbuild 编译主进程，保留 Electron 和 node-pty 为外部依赖，复制 preload、品牌资源及第三方许可证。
3. 复用已安装的 Electron 运行时，随包提供 node-pty 的 Windows x64 原生模块、DLL、宿主程序和 Worker。应用不使用 ASAR，以保持 PTY 辅助文件的真实路径。
4. Electron Packager 写入应用名称、版本和 EXE 图标；Inno Setup 编译安装包；最后生成 SHA-256 校验文件。

The release pipeline compiles the renderer and main process, includes the isolated preload and runtime assets, packages the installed Electron runtime, embeds Windows metadata, and compiles an Inno Setup installer. PTY files remain outside ASAR so native helpers and workers have real filesystem paths.

安装版通过 `aipm://app/` 安全来源加载本地界面资源，不需要 Vite 或监听本机端口。开发版继续使用启动器创建的本机 HTTP 地址。资源请求限制在应用内的 `renderer/` 目录。

Packaged apps serve their bundled renderer through `aipm://app/` without a Vite server or a listening local port. Development mode continues using the launcher's loopback HTTP URL. Packaged resource requests are confined to the application's `renderer/` directory.

参考 / References: [Electron protocol API](https://www.electronjs.org/docs/latest/api/protocol/), [Electron Packager options](https://electron.github.io/packager/main/interfaces/Options.html), [Inno Setup documentation](https://jrsoftware.org/ishelp/).

## 使用前提 / Runtime requirements

安装版打开工作台不依赖 Node.js、npm、Python 或 Java；Git 操作仍要求本机安装 Git，启动项目服务仍要求对应开发环境。安装包不会安装或覆盖这些环境，也不会包含作者的项目记录、个人配置或业务仓库。

Opening the installed workbench does not require Node.js, npm, Python, or Java. Git operations require system Git, and project service commands require their own runtimes. The installer does not install those runtimes or include personal workspace data.

## 体积优化 / Package size

安装包包含 Electron 自带的 Chromium 和 Node.js 运行时，因此主要体积来自 Electron，而不是业务代码。安装包的压缩体积与安装后的占用不同，不能直接比较。

Electron includes Chromium and Node.js, which account for most of the distribution. Compressed installer size and installed size measure different things.

当前发行流程默认进行以下裁剪：

- Electron 语言资源只保留 `zh-CN`、`en-US`，保留英文回退；这不会限制项目文件中的 Unicode 文本。
- node-pty 保留运行所需 JavaScript、Worker 和原生组件，排除测试和 source map，不分发仅供编译使用的 node-addon-api 头文件。
- 主进程代码压缩；渲染端不生成 source map。
- Inno Setup 使用 `lzma2/ultra64` 固实压缩，提升压缩率；构建耗时和压缩、解压时的内存需求会相应增加。
- 保留图形加速与软件渲染回退组件、媒体库以及第三方许可证。

The release keeps Simplified Chinese and US English locale resources, omits PTY tests, source maps and compile-time headers, minifies the main process, and uses solid LZMA2 ultra64 compression. Graphics support, software-rendering fallbacks, media libraries, and license notices are retained. Higher compression trades build time and compression/decompression memory for a smaller installer.

每次构建额外输出 `release/AIProjectManager-版本号-sizes.json`，记录安装包、安装目录、应用内容和语言包的实际字节数，方便后续比较。若要新增 Electron 原生语言，在打包脚本的 `electronLocales` 中补充对应 `.pak` 文件名。

Each build writes `release/AIProjectManager-VERSION-sizes.json` with measured installer, application-directory, app-content, and locale sizes. Extend `electronLocales` in the packaging script when adding another Electron locale.

压缩参数说明 / Compression reference: [Inno Setup Compression](https://jrsoftware.org/ishelp/topic_setup_compression.htm).
