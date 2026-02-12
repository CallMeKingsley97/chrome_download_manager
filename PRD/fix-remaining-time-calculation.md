# 修复下载剩余时间始终显示"计算中..."

## 问题描述

正在下载的文件，"剩余时间"始终显示 `计算中...`，无法切换为具体的倒计时。

## 根因分析

### 3 个核心缺陷

| # | 缺陷 | 位置 | 影响 |
|---|------|------|------|
| 1 | `estimatedEndTime` 不可靠 | `calculateDownloadSpeed` 方法1 | Chrome API 不保证提供此字段 |
| 2 | 全程平均速度 + 1秒空窗期 | `calculateDownloadSpeed` 方法2 | 前1秒返回0，剩余时间回退到"计算中" |
| 3 | 无瞬时速度追踪 | 无 | 无法基于轮询间隔计算实时速度 |

## 修改内容

### popup.js

1. **`calculateDownloadSpeed`** — 引入 EMA（指数加权移动平均）瞬时速度采样
   - 方法1（新）: 两次轮询间 `bytesReceived` 差值 → EMA 平滑（α=0.7）
   - 方法2: `estimatedEndTime` 反推速度（保留）
   - 方法3: 全程平均速度，阈值从 1s 降至 500ms

2. **`estimateRemainingTime`** — 增加两个兜底分支
   - `bytesReceived >= totalBytes` → 返回"即将完成"
   - 有速度但无 `totalBytes` → 返回"未知"

3. **`updateActiveDownloadsUI`** — 清理已完成下载的速度采样，防止内存泄漏

4. **`downloadSpeedCache`** — 复用已有 Map，更新注释为采样缓存用途

### i18n (5 个 locale)

新增 `timeRemainingUnknown` 键：zh_CN=未知, en=Unknown, ja=不明, ko=알 수 없음, es=Desconocido

## 验证方式

在 `chrome://extensions` 中重新加载扩展，下载一个 >100MB 文件，观察：
- 1-2 秒后"剩余"字段从"计算中"切换为具体时间
- 剩余时间随下载持续更新
- 接近完成时显示"即将完成"
