# Download Manager Lite

<p align="center">
  <img src="icons/icon128.png" alt="Logo" width="128" height="128" onerror="this.style.display='none'">
</p>

<p align="center">
  A refined, efficient Chrome download manager extension with a native macOS-style design.
</p>

## ✨ Features

- **📥 Modern Download Management**
  - View download progress, speed, and time remaining in real-time.
  - Support **Cancel** (for active downloads) and **Retry** (for failed downloads).
  - Smart distinction between **Remove Record Only** and **Delete Local File**.
- **🔍 Powerful Search & Filtering**
  - Real-time search by filename and source domain.
  - Filter by status: Downloading, Completed, Failed.
  - Filter by type: Documents, Images, Archives, Installers, etc.
- **🎨 Premium UI Experience**
  - Pixel-perfect macOS-style design.
  - Automatic Light/Dark mode support.
  - Smooth micro-interactions and animations.
- **🔔 Thoughtful Details**
  - Extension icon badge shows real-time active download count.
  - Automatic categorization of common file types (PDF, Doc, ZIP, DMG, etc.).

## 🛠️ Project Structure

```
chrome_download_manager/
├── manifest.json              # Extension Configuration
├── README.md                  # Chinese Documentation
├── README_EN.md               # English Documentation
├── LICENSE                    # MIT License
├── src/
│   ├── popup/                 # Main UI
│   │   ├── popup.html
│   │   ├── popup.js          # Logic & Rendering Engine
│   │   └── popup.css         # Styles (macOS CSS Variables)
│   ├── options/               # Settings Page
│   └── background/            # Background Service (badge logic)
└── docs/                      # Documentation & PRDs
```

## 🚀 Quick Start

### 1. Installation (Developer Mode)
1. Clone this repository locally.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **"Developer mode"** in the top right corner.
4. Click **"Load unpacked"**.
5. Select the project root directory `chrome_download_manager`.

### 2. Usage
- **Basic Actions**: Click the extension icon to open the panel. Use the buttons on the right of each item to Open, Show in Folder, Cancel, or Remove.
- **Batch Cleaning**: Click the `...` menu in the top right to clear all completed or failed records.
- **Settings**: Select "Settings" in the menu to customize list size and default filters.

## ⚙️ Tech Stack

- **Core**: Manifest V3, Generic JavaScript (ES6+), HTML5
- **Style**: Native CSS (CSS Variables, Flexbox, Backdrop-filter)
- **APIs**:
  - `chrome.downloads`: Core download management.
  - `chrome.action`: Dynamic icon badge.
  - `chrome.storage`: User settings synchronization.

## 📝 Development Guide

### Core Directories
- `src/popup/`: Contains all UI rendering logic (`renderList`) and event bindings.
- `src/background/`: Handles download event listeners (`onChanged`, `onCreated`) and updates the badge.

### Style Customization
Theme colors are defined in `:root` within `src/popup/popup.css` and support hot reloading:
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

## 📄 License

MIT License - See [LICENSE](LICENSE) file for details.
