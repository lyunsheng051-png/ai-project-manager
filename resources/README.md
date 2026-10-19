# Logo 与应用图标 · Logo and application icons

[中文首页](../README.md) · [English README](../README.en.md)

![Project Workbench logo](icon.png)

## 文件 / Files

| 文件 / File | 用途 / Purpose |
| --- | --- |
| `logo.png` | 透明背景原始图稿；后续修改和导出的唯一来源 / Original transparent artwork; source for all exports |
| `icon.png` | 256 × 256 RGBA PNG；应用内与跨平台窗口使用 / In-app and cross-platform window icon |
| `icon.ico` | Windows 多尺寸图标；用于窗口、EXE 和安装程序 / Multi-resolution Windows window, executable, and installer icon |
| `icons/icon-*.png` | 16、20、24、32、40、48、64、96、128、256、512 像素 / Individual PNG exports |
| `logo-prompt.txt` | 图稿的生成工具与原始提示词 / Generation tool and original prompt |

图形由蓝色玻璃底座、三个工作区叠层和绿色运行状态点组成，不包含文字，便于中英文版本共用。原始图稿使用内置 imagegen 工具生成，导出脚本只做缩放及 PNG / ICO 格式转换，保留透明通道。

The mark combines a blue glass tile, three stacked workspace panels, and a mint service-status node. It contains no text and works for both documentation languages. The original artwork was generated with the built-in imagegen tool. The export script only resizes and converts PNG / ICO formats while preserving alpha transparency.

## 重新导出 / Re-export

在项目根目录执行 / Run from the repository root:

```powershell
uv run scripts/export-icons.py
```

脚本通过内联依赖声明使用 Pillow。基础桌面功能不依赖 Python；只有需要重新导出图标时才使用此工具。

Pillow is declared in the script's inline dependency metadata. Python is only needed to regenerate icons, not to run the desktop app.

## 打包接入 / Packaging

- **窗口 / Window**：`electron/main.ts` 已为 Windows 加载 `resources/icon.ico`，其他平台加载 `resources/icon.png`。打包时须将 `resources/` 保留在应用内容根目录，即 `app.getAppPath()` 下。/ The Electron window uses the ICO on Windows and PNG elsewhere. Include this directory under the packaged application root returned by `app.getAppPath()`.
- **应用 EXE / Application executable**：把所选打包工具的 Windows EXE 图标设置为 `resources/icon.ico`。窗口图标设置不会自动修改 EXE 的资源。/ Set your packager's Windows executable icon to `resources/icon.ico`; the window icon does not change the executable's embedded resources.
- **Inno Setup 安装包 / Installer**：通过 `SetupIconFile` 使用该 ICO；安装后的快捷方式可使用已嵌入图标的应用 EXE。/ Use the ICO through `SetupIconFile`; installed shortcuts can use the application executable's embedded icon.

这里只提供图标及使用约定，尚未增加打包流程，也未生成 EXE 或安装包。

These assets prepare the branding for packaging. They do not add a packaging pipeline or produce an executable or installer.
