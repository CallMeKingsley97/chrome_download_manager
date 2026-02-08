# Manifest V3 检查清单

## 目录
1. 必填结构
2. 权限最小化
3. 消息通信
4. 安全基线
5. 稳定性与可维护性

## 1. 必填结构
- `manifest_version` 必须为 `3`。
- 必须声明 `name`、`version`、`action`（如需 popup）。
- 后台逻辑统一放在 `background.service_worker`。
- 多语言项目使用 `_locales/*/messages.json`，避免文案硬编码。

## 2. 权限最小化
- `permissions` 仅声明实际 API（如 `storage`、`downloads`、`tabs`）。
- `host_permissions` 仅声明真实域名，避免 `*://*/*` 全量放开。
- 内容脚本匹配规则使用最小 `matches` 范围。
- 涉及动态注入时，优先静态声明，动态注入仅用于确有条件分支的场景。

## 3. 消息通信
- 统一消息格式：
```json
{
  "type": "NAMESPACE/ACTION",
  "requestId": "uuid",
  "payload": {}
}
```
- `type` 必填且可枚举，禁止自由文本消息类型。
- 对 `sender.tab`、`sender.origin` 做校验。
- 对超时和失败设计兜底，避免调用方无响应。

## 4. 安全基线
- 禁止 `eval`、`new Function` 和远程脚本拼接执行。
- 任何 DOM 插入内容必须做净化，避免 XSS。
- 避免在 content script 中长期保存敏感数据。
- 若使用 `web_accessible_resources`，仅暴露必要路径并限制 `matches`。
- 外部通信接口必须白名单来源，默认拒绝。

## 5. 稳定性与可维护性
- service worker 逻辑设计为可重入和幂等。
- 重任务切分为小任务，避免长时间阻塞事件处理。
- 关键链路记录结构化日志：`type`、`tabId`、`url`、`elapsedMs`。
- 配置项集中管理，避免散落在多个脚本中造成行为漂移。
