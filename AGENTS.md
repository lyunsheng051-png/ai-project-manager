# 开发约定

- 使用 npm 安装依赖和运行脚本。Python扩展如需增加，使用uv。
- 前端验证只运行 `npm run typecheck`，不运行前端生产build。`scripts/desktop-runtime.mjs`仅转换桌面主进程。
- Vue 3 + Vite + TypeScript按api、components、composables、config、layouts、router、styles、types、views分层；列表默认10条并允许调整。Git变更文件按用户要求完整列出，不分页，使用滚轮滚动。
- 桌面主进程按core、services、repositories拆分，渲染端仅通过preload白名单桥接调用本地能力。
- 运行 `npm test` 验证核心行为；涉及终端、进程或IPC时运行 `npm run test:desktop`。
- Git写操作、进程控制及文件边界测试只能使用独立临时项目，不对用户真实仓库运行破坏性操作。
- 不自动丢弃Git修改，不强制推送，不删除用户项目目录，不按端口终止未知进程。
- 不提交.runtime、node_modules、日志、个人路径配置或秘密值。
- 不添加无实际需要的常驻服务；AI功能保持可选、按需加载。
