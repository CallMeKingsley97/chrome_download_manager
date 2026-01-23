# Download Manager Lite

<p align="center">
  <img src="icons/icon128.png" alt="Logo" width="128" height="128" onerror="this.style.display='none'">
</p>

<p align="center">
  一个精致、高效的 Chrome 下载管理扩展，采用原生 macOS 风格设计。
</p>

## ✨ 功能特性

- **📥 现代化下载管理**
  - 实时查看下载进度、速度和剩余时间
  - 支持 **取消下载** (正在下载) 和 **重试下载** (失败任务)
  - 智能区分 **仅移除记录** 与 **删除本地文件**
- **🔍 强大的搜索与筛选**
  - 实时搜索文件名和来源域名
  - 按状态筛选：下载中、已完成、失败
  - 按类型筛选：文档、图片、压缩包、安装包等
- **🎨 极致的 UI 体验**
  - 像素级复刻 macOS 风格
  - 支持浅色/深色模式自动切换
  - 细腻的微交互与流畅动画
- **🔔 贴心细节**
  - 扩展图标徽章实时显示下载数量
  - 自动分类常见文件类型 (PDF, Doc, ZIP, DMG 等)

## 🛠️ 项目结构

```
chrome_download_manager/
├── manifest.json              # 扩展核心配置
├── README.md                  # 中文说明文档
├── README_EN.md               # English Documentation
├── LICENSE                    # MIT 协议
├── src/
│   ├── popup/                 # 核心弹窗界面
│   │   ├── popup.html
│   │   ├── popup.js          # 交互逻辑 & 渲染引擎
│   │   └── popup.css         # 样式表 (CSS Variables)
│   ├── options/               # 个性化设置页
│   └── background/            # 后台服务 (Service Worker)
└── docs/                      # 设计与需求文档
```

## 🚀 快速开始

### 1. 安装开发版
1. 克隆本项目到本地
2. 在 Chrome 浏览器地址栏输入 `chrome://extensions/`
3. 开启右上角的 **"开发者模式"**
4. 点击 **"加载已解压的扩展程序"**
5. 选择项目根目录 `chrome_download_manager`

### 2. 使用说明
- **基础操作**：点击扩展图标打开面板，点击列表项右侧按钮进行操作（打开/定位/取消/移除）。
- **批量清理**：点击右上角 `...` 菜单，可一键清理已完成或失败的记录。
- **个性化设置**：在菜单中选择"设置"，可调整列表显示数量及默认筛选状态。

## ⚙️ 技术栈

- **Core**: Manifest V3, Generic JavaScript (ES6+), HTML5
- **Style**: Native CSS (CSS Variables, Flexbox, Backdrop-filter)
- **APIs**:
  - `chrome.downloads`: 核心下载控制
  - `chrome.action`: 动态徽章状态
  - `chrome.storage`: 用户配置同步

## 📝 开发指南

### 核心目录
- `src/popup/`: 包含所有 UI 渲染逻辑 (`renderList`) 和交互事件绑定。
- `src/background/`: 负责监听下载事件 (`onChanged`, `onCreated`) 并更新扩展图标徽章。

### 样式定制
所有主题色定义在 `src/popup/popup.css` 的 `:root` 中，支持热重载：
```css
:root {
  --primary: #007AFF;  /* macOS Blue */
  --bg: #FFFFFF;       /* Light Mode Background */
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1C1C1E;     /* Dark Mode Background */
  }
}
```

## 📄 开源协议

MIT License - 详见 [LICENSE](LICENSE) 文件
