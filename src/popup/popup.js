const chromeApi = typeof chrome !== "undefined" ? chrome : null;

const DEFAULT_SETTINGS = {
  listSize: 50,
  defaultStatusFilter: "all",
  showSpeed: false,
  undoRemove: true
};

const state = {
  downloads: [],
  searchText: "",
  statusFilter: "all",
  typeFilter: "all",
  settings: { ...DEFAULT_SETTINGS },
  loading: true,
  refreshTimer: null,
  skeletonTimer: null
};

const elements = {
  searchInput: document.getElementById("searchInput"),
  clearSearch: document.getElementById("clearSearch"),
  toggleFilters: document.getElementById("toggleFilters"),
  filters: document.getElementById("filters"),
  statusFilters: document.getElementById("statusFilters"),
  typeFilters: document.getElementById("typeFilters"),
  menuButton: document.getElementById("menuButton"),
  menuPanel: document.getElementById("menuPanel"),
  downloadIndicator: document.getElementById("downloadIndicator"),
  downloadIndicatorText: document.getElementById("downloadIndicatorText"),
  downloadList: document.getElementById("downloadList"),
  emptyState: document.getElementById("emptyState"),
  resetFilters: document.getElementById("resetFilters"),
  skeleton: document.getElementById("skeleton"),
  toast: document.getElementById("toast"),
  toastMessage: document.getElementById("toastMessage"),
  toastAction: document.getElementById("toastAction")
};

const TYPE_MAP = {
  document: ["pdf", "doc", "docx", "ppt", "pptx"],
  spreadsheet: ["xls", "xlsx", "csv"],
  image: ["png", "jpg", "jpeg", "webp", "gif", "svg"],
  archive: ["zip", "rar", "7z"],
  installer: ["exe", "dmg", "pkg"]
};

const TYPE_COLORS = {
  document: "#6366f1",
  spreadsheet: "#22c55e",
  image: "#06b6d4",
  archive: "#f97316",
  installer: "#f43f5e",
  other: "#64748b"
};

init();

function init() {
  try {
    bindEvents();
    loadSettings().then(() => {
      state.statusFilter = state.settings.defaultStatusFilter || "all";
      updateFilterUI();
      loadDownloads();
    });
  } catch (error) {
    console.error("初始化失败", error);
  }
}

function bindEvents() {
  elements.searchInput.addEventListener("input", debounce(handleSearchInput, 300));
  elements.searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      clearSearch();
    }
  });
  elements.clearSearch.addEventListener("click", clearSearch);
  elements.toggleFilters.addEventListener("click", () => {
    elements.filters.classList.toggle("hidden");
  });
  elements.statusFilters.addEventListener("click", (event) => {
    const target = event.target.closest("button");
    if (!target) {
      return;
    }
    state.statusFilter = target.dataset.value;
    updateFilterUI();
    applyFilters();
  });
  elements.typeFilters.addEventListener("click", (event) => {
    const target = event.target.closest("button");
    if (!target) {
      return;
    }
    state.typeFilter = target.dataset.value;
    updateFilterUI();
    applyFilters();
  });
  elements.menuButton.addEventListener("click", (event) => {
    event.stopPropagation();
    event.preventDefault();
    // 直接切换菜单状态，避免事件冒泡导致自动打开
    const isHidden = elements.menuPanel.classList.contains("hidden");
    if (isHidden) {
      elements.menuPanel.classList.remove("hidden");
    } else {
      elements.menuPanel.classList.add("hidden");
    }
  });
  elements.menuPanel.addEventListener("click", (event) => {
    const action = event.target.dataset.action;
    if (!action) {
      return;
    }
    event.stopPropagation();
    handleMenuAction(action);
  });
  elements.resetFilters.addEventListener("click", () => {
    clearSearch();
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".more-menu")) {
      closeMenu();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "/" && document.activeElement !== elements.searchInput) {
      event.preventDefault();
      elements.searchInput.focus();
    }
    if (event.key === "Escape") {
      closeMenu();
    }
  });

  if (chromeApi && chromeApi.downloads && chromeApi.downloads.onChanged) {
    chromeApi.downloads.onChanged.addListener(scheduleRefresh);
  }
}

function scheduleRefresh() {
  if (state.refreshTimer) {
    clearTimeout(state.refreshTimer);
  }
  state.refreshTimer = setTimeout(() => {
    loadDownloads();
  }, 500);
}

function renderSkeleton() {
  elements.skeleton.innerHTML = "";
  for (let index = 0; index < 6; index += 1) {
    const item = document.createElement("div");
    item.className = "skeleton-card";
    elements.skeleton.appendChild(item);
  }
}

async function loadSettings() {
  try {
    if (!chromeApi || !chromeApi.storage) {
      showToast("请在扩展环境中打开", false);
      return;
    }
    const stored = await chromeStorageGet(["settings"]);
    if (stored.settings) {
      state.settings = { ...DEFAULT_SETTINGS, ...stored.settings };
    }
  } catch (error) {
    console.error("读取设置失败", error);
  }
}

async function loadDownloads() {
  try {
    if (!chromeApi || !chromeApi.downloads) {
      showToast("请在扩展环境中打开", false);
      return;
    }
    state.loading = true;
    elements.skeleton.classList.add("hidden");
    elements.emptyState.classList.add("hidden");
    elements.downloadList.innerHTML = "";
    if (state.skeletonTimer) {
      clearTimeout(state.skeletonTimer);
      state.skeletonTimer = null;
    }
    state.skeletonTimer = setTimeout(() => {
      if (state.loading) {
        elements.skeleton.classList.remove("hidden");
      }
    }, 300);

    const items = await chromeDownloadsSearch({
      orderBy: ["-startTime"],
      limit: state.settings.listSize
    });
    state.downloads = items || [];
    state.loading = false;
    if (state.skeletonTimer) {
      clearTimeout(state.skeletonTimer);
      state.skeletonTimer = null;
    }
    elements.skeleton.classList.add("hidden");
    applyFilters();
  } catch (error) {
    console.error("加载下载列表失败", error);
    showToast("加载下载列表失败", false);
    state.loading = false;
    if (state.skeletonTimer) {
      clearTimeout(state.skeletonTimer);
      state.skeletonTimer = null;
    }
    elements.skeleton.classList.add("hidden");
  }
}

function handleSearchInput(event) {
  state.searchText = event.target.value.trim();
  elements.clearSearch.classList.toggle("hidden", !state.searchText);
  applyFilters();
}

function clearSearch() {
  state.searchText = "";
  elements.searchInput.value = "";
  elements.clearSearch.classList.add("hidden");
  applyFilters();
}

function updateFilterUI() {
  updateActiveChip(elements.statusFilters, state.statusFilter);
  updateActiveChip(elements.typeFilters, state.typeFilter);
}

function updateActiveChip(container, value) {
  const chips = Array.from(container.querySelectorAll(".chip"));
  chips.forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.value === value);
  });
}

function applyFilters() {
  const keyword = state.searchText.toLowerCase();
  const filtered = state.downloads.filter((item) => {
    if (state.statusFilter !== "all" && item.state !== state.statusFilter) {
      return false;
    }
    const type = detectFileType(item);
    if (state.typeFilter !== "all" && type !== state.typeFilter) {
      return false;
    }
    if (!keyword) {
      return true;
    }
    const fileName = getFileName(item).toLowerCase();
    const domain = getDomain(item).toLowerCase();
    return fileName.includes(keyword) || domain.includes(keyword);
  });
  updateDownloadIndicator();
  renderList(filtered);
}

function renderList(items) {
  elements.downloadList.innerHTML = "";
  if (items.length === 0) {
    const isSearchEmpty = Boolean(state.searchText);
    elements.emptyState.classList.remove("hidden");
    elements.resetFilters.classList.toggle("hidden", !isSearchEmpty);
    elements.emptyState.querySelector(".empty-title").textContent = isSearchEmpty
      ? "没有匹配结果"
      : "暂无下载记录";
    elements.emptyState.querySelector(".empty-desc").textContent = isSearchEmpty
      ? "尝试修改关键词"
      : "去下载点什么吧";
    return;
  }
  elements.emptyState.classList.add("hidden");

  items.forEach((item) => {
    const card = document.createElement("li");
    card.className = "download-item";

    const fileType = detectFileType(item);
    const icon = document.createElement("div");
    icon.className = "file-icon";
    icon.style.background = TYPE_COLORS[fileType] || TYPE_COLORS.other;
    icon.textContent = fileTypeLabel(fileType);

    const main = document.createElement("div");
    main.className = "file-main";

    const title = document.createElement("div");
    title.className = "file-title";
    // 悬停时显示完整绝对路径，正常只显示文件名
    title.title = item.filename || "";
    title.innerHTML = highlightMatch(getFileName(item), state.searchText);

    const status = document.createElement("span");
    status.className = `status-pill ${statusClass(item.state)}`;
    status.textContent = statusLabel(item.state);

    const meta = document.createElement("div");
    meta.className = "file-meta";
    const domain = document.createElement("span");
    domain.innerHTML = highlightMatch(getDomain(item), state.searchText);
    const size = document.createElement("span");
    size.textContent = formatBytes(item.fileSize || item.totalBytes || 0);
    const time = document.createElement("span");
    time.textContent = formatTime(item.endTime || item.startTime);
    meta.append(domain, size, time);

    main.append(title, status, meta);

    if (item.state === "downloading") {
      const progress = document.createElement("div");
      progress.className = "progress";
      const progressBar = document.createElement("div");
      progressBar.className = "progress-bar";
      const progressValue = document.createElement("span");
      const percent = getProgressPercent(item);
      progressValue.style.width = `${percent}%`;
      progressBar.appendChild(progressValue);
      const progressText = document.createElement("span");
      const progressInfo = `${percent}%`;
      progressText.textContent = state.settings.showSpeed
        ? `${progressInfo} · 已下载 ${formatBytes(item.bytesReceived || 0)}`
        : progressInfo;
      progress.append(progressBar, progressText);
      main.appendChild(progress);
    }

    if (item.state === "interrupted") {
      const failed = document.createElement("div");
      failed.className = "file-meta";
      failed.textContent = "下载中断，可尝试重试";
      main.appendChild(failed);
    }

    const actions = document.createElement("div");
    actions.className = "action-group";

    if (item.state === "complete") {
      actions.append(
        buildActionButton("打开", "primary", () => openFile(item)),
        buildActionButton("定位", "", () => showInFolder(item))
      );
    }
    if (item.state === "interrupted") {
      actions.append(buildActionButton("重试", "primary", () => retryDownload(item)));
    }
    if (item.state === "downloading") {
      actions.append(buildActionButton("取消", "danger", () => cancelDownload(item)));
    }
    actions.append(buildActionButton("移除", "", () => removeDownload(item)));

    card.append(icon, main, actions);
    elements.downloadList.appendChild(card);
  });
}

function updateDownloadIndicator() {
  const downloadingCount = state.downloads.filter((item) => item.state === "downloading").length;
  if (downloadingCount > 0) {
    elements.downloadIndicator.classList.remove("hidden");
    elements.downloadIndicatorText.innerHTML = `正在下载 <span class="count">${downloadingCount}</span> 项`;
  } else {
    elements.downloadIndicator.classList.add("hidden");
    elements.downloadIndicatorText.textContent = "正在下载";
  }
}

function buildActionButton(label, variant, onClick) {
  const button = document.createElement("button");
  button.className = `action-button ${variant}`.trim();
  button.textContent = label;
  button.addEventListener("click", () => {
    button.disabled = true;
    onClick().finally(() => {
      button.disabled = false;
    });
  });
  return button;
}

function handleMenuAction(action) {
  closeMenu();
  if (action === "open-downloads") {
    openDownloadsPage();
    return;
  }
  if (action === "open-options") {
    openOptionsPage();
    return;
  }
  if (action === "clear-complete") {
    clearByState("complete", "已完成记录已清理");
    return;
  }
  if (action === "clear-failed") {
    clearByState("interrupted", "失败记录已清理");
  }
}

function toggleMenu() {
  elements.menuPanel.classList.toggle("hidden");
}

function closeMenu() {
  elements.menuPanel.classList.add("hidden");
}

async function openDownloadsPage() {
  try {
    await chromeTabsCreate({ url: "chrome://downloads" });
  } catch (error) {
    console.error("打开下载页失败", error);
    showToast("打开下载页失败", false);
  }
}

async function openOptionsPage() {
  try {
    await chromeRuntimeOpenOptions();
  } catch (error) {
    console.error("打开设置失败", error);
    showToast("打开设置失败", false);
  }
}

async function openFile(item) {
  try {
    await chromeDownloadsOpen(item.id);
  } catch (error) {
    console.error("打开文件失败", error);
    showToast("文件可能已移动或删除", false);
  }
}

async function showInFolder(item) {
  try {
    await chromeDownloadsShow(item.id);
  } catch (error) {
    console.error("打开所在文件夹失败", error);
    showToast("无法打开所在文件夹", false);
  }
}

async function retryDownload(item) {
  try {
    await chromeDownloadsResume(item.id);
    showToast("已尝试重试", false);
  } catch (error) {
    console.error("重试失败", error);
    showToast("重试失败", false);
  }
}

async function cancelDownload(item) {
  try {
    await chromeDownloadsCancel(item.id);
    showToast("已取消下载", false);
  } catch (error) {
    console.error("取消失败", error);
    showToast("取消失败", false);
  }
}

async function removeDownload(item) {
  // 创建自定义选择对话框，区分仅移除记录和删除磁盘文件
  const choice = await showRemoveDialog(item);
  if (choice === null) {
    return; // 用户取消
  }
  try {
    if (choice === "delete_file" && item.state === "complete") {
      // 同时删除磁盘文件和记录
      await chromeDownloadsRemoveFile(item.id);
      showToast("已删除文件和记录", false);
    } else {
      // 仅移除记录
      await chromeDownloadsErase({ id: item.id });
      showToast("已移除下载记录", state.settings.undoRemove, () => undoRemove(item));
    }
    loadDownloads();
  } catch (error) {
    console.error("移除失败", error);
    showToast("移除失败", false);
  }
}

function showRemoveDialog(item) {
  return new Promise((resolve) => {
    const isComplete = item.state === "complete";
    const message = isComplete
      ? "选择移除方式:\n\n[1] 仅移除记录\n[2] 删除文件并移除记录\n\n输入 1 或 2，取消请按 Esc"
      : "确认移除该下载记录？";

    if (!isComplete) {
      const confirmed = window.confirm(message);
      resolve(confirmed ? "remove_record" : null);
      return;
    }

    const input = window.prompt(message, "1");
    if (input === null) {
      resolve(null);
    } else if (input === "2") {
      resolve("delete_file");
    } else {
      resolve("remove_record");
    }
  });
}

async function undoRemove(item) {
  if (!item.url) {
    showToast("无法撤销该记录", false);
    return;
  }
  try {
    await chromeDownloadsDownload({ url: item.url, filename: item.filename });
    showToast("已重新下载", false);
  } catch (error) {
    console.error("撤销失败", error);
    showToast("撤销失败", false);
  }
}

async function clearByState(stateValue, message) {
  const confirmed = window.confirm("确认批量清理记录？");
  if (!confirmed) {
    return;
  }
  try {
    const items = await chromeDownloadsSearch({ state: stateValue });
    await Promise.all(items.map((item) => chromeDownloadsErase({ id: item.id })));
    showToast(message, false);
    loadDownloads();
  } catch (error) {
    console.error("批量清理失败", error);
    showToast("批量清理失败", false);
  }
}

function highlightMatch(text, keyword) {
  if (!keyword) {
    return escapeHtml(text);
  }
  const escapedText = escapeHtml(text);
  const escapedKeyword = escapeRegExp(keyword);
  const regex = new RegExp(escapedKeyword, "ig");
  return escapedText.replace(regex, (match) => `<mark>${match}</mark>`);
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function detectFileType(item) {
  const name = getFileName(item).toLowerCase();
  const extension = name.includes(".") ? name.split(".").pop() : "";
  const type = Object.keys(TYPE_MAP).find((key) => TYPE_MAP[key].includes(extension));
  return type || "other";
}

function fileTypeLabel(type) {
  const labels = {
    document: "DOC",
    spreadsheet: "XLS",
    image: "IMG",
    archive: "ZIP",
    installer: "APP",
    other: "FILE"
  };
  return labels[type] || "FILE";
}

function getFileName(item) {
  if (item.filename) {
    // 兼容 Windows 反斜杠和 Unix 正斜杠路径分隔符
    const parts = item.filename.split(/[\\/]/);
    return parts[parts.length - 1] || "未知文件";
  }
  const url = item.finalUrl || item.url || "";
  try {
    const parsed = new URL(url);
    const segment = parsed.pathname.split("/").pop();
    return segment || parsed.hostname || "未知文件";
  } catch (error) {
    console.error("解析文件名失败", error);
    return "未知文件";
  }
}

function getDomain(item) {
  const url = item.finalUrl || item.url || "";
  try {
    if (!url || url.startsWith("file:") || url.startsWith("blob:")) {
      return "本地/未知来源";
    }
    const parsed = new URL(url);
    return parsed.hostname || "本地/未知来源";
  } catch (error) {
    console.error("解析域名失败", error);
    return "本地/未知来源";
  }
}

function getProgressPercent(item) {
  if (!item.totalBytes || item.totalBytes <= 0) {
    return 0;
  }
  return Math.min(100, Math.round((item.bytesReceived / item.totalBytes) * 100));
}

function formatBytes(bytes) {
  if (!bytes) {
    return "--";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(1)}${units[index]}`;
}

function formatTime(timeString) {
  if (!timeString) {
    return "--";
  }
  const date = new Date(timeString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (now.toDateString() === date.toDateString()) {
    return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  }
  if (diffDays === 1) {
    return "昨天";
  }
  return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

function statusLabel(stateValue) {
  const map = {
    complete: "已完成",
    downloading: "下载中",
    interrupted: "失败",
    paused: "暂停"
  };
  return map[stateValue] || "未知";
}

function statusClass(stateValue) {
  const map = {
    complete: "status-complete",
    downloading: "status-downloading",
    interrupted: "status-interrupted",
    paused: "status-paused"
  };
  return map[stateValue] || "";
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => fn(...args), delay);
  };
}

function showToast(message, withAction, actionHandler) {
  elements.toastMessage.textContent = message;
  elements.toast.classList.remove("hidden");
  if (withAction && actionHandler) {
    elements.toastAction.classList.remove("hidden");
    elements.toastAction.onclick = () => {
      elements.toastAction.classList.add("hidden");
      actionHandler();
    };
  } else {
    elements.toastAction.classList.add("hidden");
  }
  setTimeout(() => {
    elements.toast.classList.add("hidden");
  }, 2400);
}

function chromeDownloadsSearch(query) {
  return new Promise((resolve, reject) => {
    try {
      if (!chromeApi || !chromeApi.downloads) {
        reject(new Error("下载 API 不可用"));
        return;
      }
      chromeApi.downloads.search(query, (items) => {
        const error = chromeApi.runtime.lastError;
        if (error) {
          console.error("downloads.search 失败", error.message);
          reject(error);
          return;
        }
        resolve(items || []);
      });
    } catch (error) {
      console.error("downloads.search 异常", error);
      reject(error);
    }
  });
}

function chromeDownloadsOpen(id) {
  return new Promise((resolve, reject) => {
    try {
      if (!chromeApi || !chromeApi.downloads) {
        reject(new Error("下载 API 不可用"));
        return;
      }
      chromeApi.downloads.open(id, () => {
        const error = chromeApi.runtime.lastError;
        if (error) {
          console.error("downloads.open 失败", error.message);
          reject(error);
          return;
        }
        resolve();
      });
    } catch (error) {
      console.error("downloads.open 异常", error);
      reject(error);
    }
  });
}

function chromeDownloadsShow(id) {
  return new Promise((resolve, reject) => {
    try {
      if (!chromeApi || !chromeApi.downloads) {
        reject(new Error("下载 API 不可用"));
        return;
      }
      // chrome.downloads.show() 是同步方法，不接受回调函数
      chromeApi.downloads.show(id);
      const error = chromeApi.runtime.lastError;
      if (error) {
        console.error("downloads.show 失败", error.message);
        reject(error);
        return;
      }
      resolve();
    } catch (error) {
      console.error("downloads.show 异常", error);
      reject(error);
    }
  });
}

function chromeDownloadsResume(id) {
  return new Promise((resolve, reject) => {
    try {
      if (!chromeApi || !chromeApi.downloads) {
        reject(new Error("下载 API 不可用"));
        return;
      }
      chromeApi.downloads.resume(id, () => {
        const error = chromeApi.runtime.lastError;
        if (error) {
          console.error("downloads.resume 失败", error.message);
          reject(error);
          return;
        }
        resolve();
      });
    } catch (error) {
      console.error("downloads.resume 异常", error);
      reject(error);
    }
  });
}

function chromeDownloadsCancel(id) {
  return new Promise((resolve, reject) => {
    try {
      if (!chromeApi || !chromeApi.downloads) {
        reject(new Error("下载 API 不可用"));
        return;
      }
      chromeApi.downloads.cancel(id, () => {
        const error = chromeApi.runtime.lastError;
        if (error) {
          console.error("downloads.cancel 失败", error.message);
          reject(error);
          return;
        }
        resolve();
      });
    } catch (error) {
      console.error("downloads.cancel 异常", error);
      reject(error);
    }
  });
}

function chromeDownloadsErase(query) {
  return new Promise((resolve, reject) => {
    try {
      if (!chromeApi || !chromeApi.downloads) {
        reject(new Error("下载 API 不可用"));
        return;
      }
      chromeApi.downloads.erase(query, (ids) => {
        const error = chromeApi.runtime.lastError;
        if (error) {
          console.error("downloads.erase 失败", error.message);
          reject(error);
          return;
        }
        resolve(ids || []);
      });
    } catch (error) {
      console.error("downloads.erase 异常", error);
      reject(error);
    }
  });
}

function chromeDownloadsDownload(options) {
  return new Promise((resolve, reject) => {
    try {
      if (!chromeApi || !chromeApi.downloads) {
        reject(new Error("下载 API 不可用"));
        return;
      }
      chromeApi.downloads.download(options, (downloadId) => {
        const error = chromeApi.runtime.lastError;
        if (error) {
          console.error("downloads.download 失败", error.message);
          reject(error);
          return;
        }
        resolve(downloadId);
      });
    } catch (error) {
      console.error("downloads.download 异常", error);
      reject(error);
    }
  });
}

function chromeStorageGet(keys) {
  return new Promise((resolve, reject) => {
    try {
      if (!chromeApi || !chromeApi.storage) {
        reject(new Error("存储 API 不可用"));
        return;
      }
      chromeApi.storage.local.get(keys, (items) => {
        const error = chromeApi.runtime.lastError;
        if (error) {
          console.error("storage.get 失败", error.message);
          reject(error);
          return;
        }
        resolve(items || {});
      });
    } catch (error) {
      console.error("storage.get 异常", error);
      reject(error);
    }
  });
}

function chromeTabsCreate(options) {
  return new Promise((resolve, reject) => {
    try {
      if (!chromeApi || !chromeApi.tabs) {
        reject(new Error("tabs API 不可用"));
        return;
      }
      chromeApi.tabs.create(options, (tab) => {
        const error = chromeApi.runtime.lastError;
        if (error) {
          console.error("tabs.create 失败", error.message);
          reject(error);
          return;
        }
        resolve(tab);
      });
    } catch (error) {
      console.error("tabs.create 异常", error);
      reject(error);
    }
  });
}

function chromeRuntimeOpenOptions() {
  return new Promise((resolve, reject) => {
    try {
      if (!chromeApi || !chromeApi.runtime) {
        reject(new Error("runtime API 不可用"));
        return;
      }
      chromeApi.runtime.openOptionsPage(() => {
        const error = chromeApi.runtime.lastError;
        if (error) {
          console.error("openOptionsPage 失败", error.message);
          reject(error);
          return;
        }
        resolve();
      });
    } catch (error) {
      console.error("openOptionsPage 异常", error);
      reject(error);
    }
  });
}

function chromeDownloadsRemoveFile(id) {
  return new Promise((resolve, reject) => {
    try {
      if (!chromeApi || !chromeApi.downloads) {
        reject(new Error("下载 API 不可用"));
        return;
      }
      chromeApi.downloads.removeFile(id, () => {
        const error = chromeApi.runtime.lastError;
        if (error) {
          console.error("downloads.removeFile 失败", error.message);
          reject(error);
          return;
        }
        // 删除文件后，也需要移除记录
        chromeApi.downloads.erase({ id: id }, () => {
          const eraseError = chromeApi.runtime.lastError;
          if (eraseError) {
            console.warn("erase 失败", eraseError.message);
          }
          resolve();
        });
      });
    } catch (error) {
      console.error("downloads.removeFile 异常", error);
      reject(error);
    }
  });
}
