# Chrome 下载管理插件 MVP 执行计划

## Context（上下文）
- 当前仓库仅包含 PRD 与 README，无现成代码结构，需要从零搭建 Chrome 扩展最小可运行版本。
- 目标功能以 Popup 为主，覆盖下载列表、搜索、筛选、常用操作、批量清理与基础设置。

## Thought（方案与边界）
- 采用 Manifest V3，核心界面为 `popup.html` + `popup.js` + `popup.css`。
- 引入 `options` 页面保存展示条数、默认筛选、速度显示、移除撤销等设置。
- 核心边界处理：
  - 无文件名时从 URL 兜底；无域名时显示“本地/未知来源”。
  - 搜索空结果显示空态；下载列表为空显示引导文案。
  - 下载中/失败状态仅展示对应操作；完成态展示打开/定位。
  - API 调用异常通过 `try/catch` + `chrome.runtime.lastError` 统一提示。

## Implementation（实施步骤）
1. 新增扩展基础结构：`manifest.json`、`popup.html/css/js`、`options.html/css/js`。
2. 实现下载列表渲染、搜索（300ms debounce）、状态/类型筛选逻辑。
3. 实现操作按钮：打开、定位、重试、取消、移除记录（含确认）。
4. 实现批量清理：已完成记录/失败记录。
5. 提供浅色/深色样式、骨架屏、空态提示、轻量 Toast。
6. 基于 `chrome.storage` 实现设置保存与加载。

## Verification（验证方式）
- 打开 Popup 后 1s 内可展示最近下载列表。
- 搜索与筛选能正确过滤。
- 各状态操作按钮可触发对应 Chrome Downloads API。
- 选项页设置保存后重新打开 Popup 生效。

## 测试建议
- 手动测试：在 Chrome 中加载扩展并执行下载任务，检查列表刷新与操作行为。
- 关键操作：完成/失败/下载中状态下分别测试打开、定位、重试、取消与移除。
