# 📥 Download Manager Lite

<p align="center">
  <img src="icons/icon128.png" alt="Logo" width="128" height="128" onerror="this.style.display='none'">
</p>

<p align="center">
  A refined, efficient Chrome download manager extension with a native macOS-style design.
</p>

<p align="center">
  <a href="#-features">Features</a> • 
  <a href="#-installation">Installation</a> • 
  <a href="ROADMAP.md">Roadmap</a>
</p>

---

## ✨ Features

### 🎨 Premium UI Experience
- **macOS-Style Design**: Pixel-perfect native aesthetics.
- **Auto Dark Mode**: Automatically adapts to your system theme.
- **Smooth Animations**: Polished micro-interactions and fluid list transitions.

### ⚡️ Powerful Management
- **Real-time Monitoring**: View progress, download speed, and estimated time remaining.
- **Smart Actions**: Pause, cancel, retry, open files, or reveal in Finder/Explorer.
- **Live Badge**: Extension icon shows the count of active downloads in real-time.

### 🆕 Unique Capabilities
- **New Download**: Manually initialize downloads by entering URLs directly.
- **Undo Remove**: Removed a record by mistake? You have a **5-second undo window** to restore it instantly.
- **Smart Deletion**: Clear distinction between **"Remove Record Only"** and **"Delete File"** to prevent data loss.

### 🔍 Search & Filter
- **Instant Search**: Filter by filename or source domain in real-time.
- **Keyboard Shortcuts**: Press `/` to focus search, `Esc` to clear/close.
- **Smart Categorization**: Automatically filters files by type (Docs, Images, Archives, Installers, etc.).

## 🚀 Installation

1. Clone or download this repository.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **"Developer mode"** in the top right corner.
4. Click **"Load unpacked"**.
5. Select the project root directory.

## 🛠 Usage Tips

- **Quick Search**: Press `/` anywhere to start typing your search query.
- **Undo**: After removing a download record, watch for the toast notification at the bottom to undo the action if needed.
- **Batch Clear**: Use the menu in the top-right corner to clear all completed or failed downloads at once.

## 🗺️ Roadmap

We have ambitious plans! For future features like multi-threaded downloading and cloud sync, check out our [ROADMAP.md](ROADMAP.md).

## ⚙️ Tech Stack

- **Manifest V3**: Secure, performant, and battery-friendly.
- **Vanilla JS & CSS**: No heavy frameworks, ensuring instant startup times.
- **Native APIs**: Deep integration with `chrome.downloads`, `chrome.storage`, `chrome.action`.

## 📄 License

MIT License
