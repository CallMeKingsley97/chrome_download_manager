# 修复 Popup UI 两个样式问题

## 需求背景

用户反馈 Chrome 下载管理器扩展的 Popup 页面存在两个样式问题：
1. 有下载任务时，"下载中"按钮会挤占"筛选"按钮的空间，导致筛选按钮被截断
2. 正在下载的文件（如品质模型.xlsx），有下载速度和整体大小，但"共---"和"剩余---"没有数据

## 根因分析

### 问题 1：Header 按钮溢出

- `.header` 使用 `flex` 布局，搜索框 `flex: 1`
- `header-actions` 内所有按钮（`新建`/`下载中 N`/`筛选`/`⋯`）均设置 `flex-shrink: 0`，不可压缩
- popup 宽度固定 380px，当下载指示器从 hidden 变为可见时，总宽度超出，搜索框被过度压缩

### 问题 2：下载详情文本截断

- `download-details-text` 设置了 `white-space: nowrap` + `text-overflow: ellipsis`
- i18n 模板：`下载中 , $SPEED$ - $DOWNLOADED$ , 共 $TOTAL$ , 剩余 $LEFT$`
- 文本过长被 ellipsis 截断，"共"和"剩余"字段不可见
- 当 Chrome API 中 `totalBytes` 为 -1 或 0 时，"共"显示为 `--`，"剩余"显示为 `计算中...`

## 修复方案

### popup.css 修改
1. `.search-box` 增加 `min-width: 100px` 防止被过度压缩
2. `.download-indicator` 移除 `flex-shrink: 0`，允许在空间不足时收缩
3. `.download-details-text` 移除 `white-space: nowrap; overflow: hidden; text-overflow: ellipsis`，增加 `line-height: 1.4` 允许换行显示

### popup.js 修改
- `formatDownloadDetails()` 函数：当 `totalBytes <= 0` 时，省略"共"和"剩余"字段，仅显示速度和已下载量

## 修改日期
2026-02-11
