# GitCharm 开发指导

本文件供在本仓库工作的 AI 编程助手快速了解项目。修改代码前先读相关实现；具体行为以当前源码、`package.json` 和构建脚本为准。`README.md` 介绍功能，`CONTRIBUTING.md` 介绍贡献和本地化流程。

## 项目概况

- 这是名为 `gitchyan` 的 VS Code Git 扩展（界面名 GitCharm），扩展入口为 `src/host/extension.ts`，运行要求见 `package.json` 的 `engines.vscode`（当前为 `^1.93.0`）。不要根据 README 中可能过时的版本号推断兼容范围。
- 扩展宿主使用 TypeScript、VS Code API、`simple-git`；界面由多个 React/TypeScript Webview 构成，状态主要使用 Zustand。宿主能访问 Git、文件系统、密钥和网络；Webview 通过消息请求宿主执行这些操作。
- 支持多仓库、多根工作区、子模块与 worktree；Git 状态和操作都必须关联正确的 `repoId`，不能默认只存在一个仓库。

## 从哪里读代码

| 要改的内容 | 主要入口 |
| --- | --- |
| 激活、注册视图和命令 | `src/host/extension.ts`、`src/host/commands/registerCommands.ts`、`package.json` |
| 仓库发现、状态刷新、分支/提交事件 | `src/host/git/WorkspaceGitManager.ts` |
| 单仓库 Git 操作、解析与 VS Code Git 集成 | `src/host/git/GitService.ts`、`gitClient.ts`、`VscodeGitApi.ts`、`DiffParser.ts` |
| Commit / Push / Stash / Shelve / Worktree 界面 | `src/host/panels/CommitPanelProvider.ts`、`PushPreviewPanel.ts`、`SquashEditorPanel.ts`、`src/webview/commitPanel/`、`src/webview/pushPreview/` |
| Git Log 界面 | `src/host/panels/GitLogPanelProvider.ts`、`src/webview/gitLog/` |
| PR 功能 | `src/host/pullRequests/`、`src/host/panels/*PullRequest*`、`src/webview/pullRequestCreate/`、`src/webview/pullRequestDetail/` |
| 独立编辑器页及并排视图 | `src/host/panels/`、`src/webview/commitFullDetail/`、`pushPreview/`、`aiExplainDetail/`、`undockedPanel/` |
| 宿主与界面消息及共享数据类型 | `src/host/types/messages.ts`、`src/host/types/git.ts`、`src/webview/shared/msgTypes.ts`、`types.ts` |
| 状态栏、徽标、文件标注 | `src/host/ui/` |
| 扩展配置、命令、菜单、快捷键 | `package.json`、`package.nls*.json` |

## 架构与修改路径

1. `activate()` 创建 `WorkspaceGitManager`、各服务及 Webview provider，并注册 VS Code 视图、命令和可释放资源。新增命令或视图时同时检查 `package.json` 的贡献声明与宿主注册。
2. `WorkspaceGitManager` 发现仓库、监听文件和 Git 引用变化、汇总状态；`GitService` 执行单仓库操作。优先沿用这些服务及 `src/host/git/gitClient.ts` 的 `createGit()`，它统一 Git 输出语言和非 ASCII 路径处理。不要在 Webview 中直接调用 Git 或 Node API。
3. Webview 用 `getVsCodeApi().postMessage()` 发消息；宿主 provider 处理后再发状态或结果。消息联合类型的源头是 `src/host/types/messages.ts`，`src/webview/shared/msgTypes.ts` 负责重导出。新增交互时同步修改消息类型、宿主处理、界面发送与响应处理；请求/响应要保留 `requestId`，异步刷新要避免旧响应覆盖新状态。
4. 独立 Webview panel 的首次消息使用 `src/host/utils/webviewReadyGate.ts`：宿主设置 HTML 后先建立 gate，界面挂载消息监听器后调用 `notifyHostReady()`。否则初始化消息可能丢失。
5. `undockedPanel` 复用 Commit 和 Log 应用，并封装宿主发来的目标消息；`src/webview/undockedPanel/setupDispatch.ts` 必须是其入口的第一个导入。改动共享消息、监听器或 API 单例时检查普通视图与并排视图两条路径。
6. Webview HTML、资源 URI、CSP、主题样式和本地化注入集中在 `src/host/utils/webviewHtml.ts`；新增 Webview 入口时同步更新该文件中的 appName、`build-webview.mjs` 和相应 panel。

## 数据与安全边界

- PR 平台接入由 `PullRequestManager`、`PullRequestProviderFactory` 和 `providers/` 管理；远端地址解析在 `remoteUrlParser.ts`，平台能力与数据模型在 `src/host/pullRequests/types.ts`。GitHub 认证走 VS Code Authentication；其他 PAT 由 `PatCredentialStore` 存入 VS Code SecretStorage。不要把令牌写入配置、日志、Webview 消息或仓库文件。
- 有破坏性的 Git 操作（丢弃修改、删除、重置、改写历史等）沿用现有确认、错误处理和刷新流程；多仓库操作要逐仓库报告结果，并避免把部分成功当作全部成功。
- Git 报错可能含带凭据的 URL；在显示或记录相关错误时沿用现有脱敏与日志工具。渲染远端 Markdown/HTML 时沿用 `src/webview/shared/renderMarkdown.ts` 等已有净化路径，并遵守 Webview 的 CSP。
- Changelist、Shelve、草稿、选择状态等有各自的持久化位置与生命周期；改这些功能前查看对应 service、store 和 VS Code `workspaceState`/`globalState` 用法，不要只改 UI 中的临时状态。

## 本地化与配置

- 宿主 UI 文案用 `vscode.l10n.t()`；Webview 直接从 `@vscode/l10n` 导入 `l10n` 并调用 `l10n.t()`，避免通过重导出使提取器漏掉字符串。保留 `{0}` 等占位符，不拼接待翻译句子；标识符、Git 数据和协议消息类型不翻译。
- `package.json` 中的命令、菜单、配置文案用 `%key%`，对应 `package.nls.json` 及各语言文件。源码中的英文文案由 `npm run l10n:export` 生成到 `l10n/bundle.l10n.json`，不要手改生成文件；之后运行 `npm run l10n:check`。详细规则见 `CONTRIBUTING.md` 的 Localization 节。
- 处理 Enter/Escape 的文本输入须考虑输入法组合状态，参考 `src/webview/shared/ime.ts`；日期按 VS Code 语言环境格式化。

## 构建与验证

```bash
npm ci
npm run build
npm run typecheck
npm run typecheck:webview
npm run lint
npm run l10n:check
```

- `npm run build` 使用 `esbuild.mjs` 构建宿主，使用 `build-webview.mjs` 构建全部 Webview；输出在忽略的 `out/`。日常开发可用 `npm run watch`，在 VS Code 中运行 `.vscode/launch.json` 的 **Run Extension**。
- 当前仓库没有独立的自动测试套件；CI 的基本门槛是宿主与 Webview 类型检查、lint、本地化检查和导出文件一致性。按改动范围运行对应检查；交互或 Git 行为还应在 Extension Development Host 中验证。
- 打包用 `npm run package`，发布前置脚本会先导出本地化并构建。不要把 `out/`、`node_modules/`、`.vsix`、`*.tsbuildinfo` 当源码提交。

## 工作约定

- 开始前查看 `git status`，保留现有未提交改动；只修改当前任务涉及的文件。
- 修改用户可见行为时按 `CONTRIBUTING.md` 更新 `CHANGELOG.md` 的 Unreleased 节；UI 变化应核对主题、窄窗口和多语言布局。
- 若文档与实现冲突，先以当前源码、`package.json`、CI 和构建脚本确定实际行为，再更新过时文档。
