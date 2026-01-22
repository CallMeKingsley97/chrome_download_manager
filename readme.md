# Download Manager Lite

一个精致、高效的Chrome下载管理扩展，采用macOS风格设计。

## 功能特性

- 📥 快速查看和管理最近下载的文件
- 🔍 实时搜索文件名和来源域名
- 🏷️ 按状态和文件类型筛选
- 🎨 精致的macOS风格UI设计
- 🔔 下载进度徽章提示
- 🌓 完美支持浅色/深色模式

## 项目结构

```
chrome_download_manager/
├── manifest.json              # 扩展配置文件
├── README.md                  # 项目说明
├── LICENSE                    # 开源协议
├── src/                       # 源代码目录
│   ├── popup/                 # 主弹窗界面
│   │   ├── popup.html        # 弹窗HTML结构
│   │   ├── popup.js          # 弹窗业务逻辑
│   │   └── popup.css         # 弹窗样式(macOS风格)
│   ├── options/               # 设置页面
│   │   ├── options.html      # 设置页HTML
│   │   ├── options.js        # 设置页逻辑
│   │   └── options.css       # 设置页样式
│   └── background/            # 后台服务
│       └── background.js     # Service Worker(徽章功能)
└── docs/                      # 文档目录
    ├── PRD/                   # 产品需求文档
    ├── download_manager_prd_v1.md
    └── agent.md
```

## 快速开始

### 安装方式

#### 开发模式安装
1. 克隆或下载本项目
2. 打开Chrome浏览器，访问 `chrome://extensions/`
3. 开启右上角的"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择项目根目录 `chrome_download_manager`

#### 使用方式
- 点击扩展图标打开下载管理器
- 使用搜索框快速查找文件
- 点击"筛选"按钮进行高级筛选
- 点击右上角三点菜单进行批量操作

## 技术栈

- **Manifest V3**: Chrome扩展最新标准
- **Vanilla JavaScript**: 原生JS，无依赖
- **CSS Variables**: 主题颜色管理
- **Service Worker**: 后台任务处理
- **Chrome Extension APIs**:
  - `chrome.downloads`: 下载管理
  - `chrome.action`: 徽章显示
  - `chrome.storage`: 设置存储

## 设计特色

### macOS风格UI
- 🎨 系统蓝配色 (#007AFF)
- 🔘 大圆角设计 (16px)
- 💫 毛玻璃效果 (backdrop-filter)
- 🌊 流畅动画 (0.3s ease)
- 📱 SF Pro字体风格

### 用户体验
- ⚡ 实时下载状态同步
- 🔔 徽章数字提示
- 🎯 智能搜索高亮
- 🖱️ 细腻的交互反馈

## 开发指南

### 目录说明

- `src/popup/`: 主弹窗界面，用户主要交互界面
- `src/options/`: 设置页面，配置扩展选项
- `src/background/`: Service Worker，处理后台任务和徽章更新
- `docs/`: 所有文档，包括需求文档和开发文档

### 修改样式

所有CSS变量定义在 `src/popup/popup.css` 顶部：
```css
:root {
  --primary: #007AFF;  /* 主色调 */
  --bg: #FFFFFF;       /* 背景色 */
  --border: #E5E5E7;   /* 边框色 */
  /* ... */
}
```

### 调试技巧

- **Popup调试**: 右键扩展图标 → 检查弹出内容
- **Background调试**: 访问 `chrome://serviceworker-internals/`
- **重新加载**: 修改代码后，在扩展管理页点击刷新按钮

## 更新日志

### v0.1.0 (2026-01-22)
- ✅ 修复菜单关闭bug
- ✅ 修复skeleton加载状态
- ✅ 修复日期计算跨月问题
- ✅ 新增下载徽章功能
- ✅ 统一文件图标大小
- ✅ 全面macOS风格UI重构
- ✅ 优化项目目录结构

## 常见问题

**Q: 徽章不显示数字？**
A: 检查 `chrome://serviceworker-internals/` 确认background.js正常运行

**Q: 如何修改主题颜色？**
A: 编辑 `src/popup/popup.css` 中的 `--primary` 变量

**Q: 支持哪些浏览器？**
A: Chrome/Edge (Manifest V3)

## 贡献指南

欢迎提交Issue和Pull Request！

## 开源协议

MIT License - 详见 [LICENSE](LICENSE) 文件

## 作者

Chrome Download Manager Lite

---

**Enjoy! 🎉**
