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
  skeletonTimer: null,
  progressRefreshTimer: null,
  // 用于计算下载速度的快照缓存 {downloadId: {bytes, timestamp}}
  downloadSpeedCache: new Map(),
  // 延迟删除队列 {downloadId: { item, timerId }}
  pendingDeletes: new Map()
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
  toastAction: document.getElementById("toastAction"),
  // Modal Elements
  removeConfirmModal: document.getElementById("removeConfirmModal"),
  modalBtnRemoveRecord: document.getElementById("modalBtnRemoveRecord"),
  modalBtnDeleteFile: document.getElementById("modalBtnDeleteFile"),
  modalBtnCancel: document.getElementById("modalBtnCancel"),
  // New Download Modal Elements
  newDownloadBtn: document.getElementById("newDownloadBtn"),
  newDownloadModal: document.getElementById("newDownloadModal"),
  newDownloadUrls: document.getElementById("newDownloadUrls"),
  newDownloadSubmit: document.getElementById("newDownloadSubmit"),
  newDownloadCancel: document.getElementById("newDownloadCancel")
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
    elements.toggleFilters.classList.toggle("active");
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
      hideNewDownloadModal();
    }
  });

  // 新建下载按钮事件
  elements.newDownloadBtn.addEventListener("click", showNewDownloadModal);
  elements.newDownloadSubmit.addEventListener("click", handleNewDownload);
  elements.newDownloadCancel.addEventListener("click", hideNewDownloadModal);
  elements.newDownloadModal.addEventListener("click", (event) => {
    if (event.target === elements.newDownloadModal) {
      hideNewDownloadModal();
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

// 定时刷新下载进度 (当有活跃下载时)
function startProgressRefresh() {
  if (state.progressRefreshTimer) {
    return; // 已经在运行
  }
  state.progressRefreshTimer = setInterval(() => {
    updateActiveDownloadsUI(); // 只更新进度，不重建列表
  }, 1000); // 每秒刷新一次
}

function stopProgressRefresh() {
  if (state.progressRefreshTimer) {
    clearInterval(state.progressRefreshTimer);
    state.progressRefreshTimer = null;
  }
}

// 只更新活跃下载的进度UI，不重建整个列表
async function updateActiveDownloadsUI() {
  if (!chromeApi || !chromeApi.downloads) {
    return;
  }
  try {
    // 只获取正在下载的项目
    const activeItems = await chromeDownloadsSearch({ state: "in_progress" });

    activeItems.forEach((item) => {
      // 更新 state 中的数据
      const index = state.downloads.findIndex((d) => d.id === item.id);
      if (index !== -1) {
        state.downloads[index] = item;
      }

      // 找到 DOM 中对应的卡片
      const card = elements.downloadList.querySelector(`[data-id="${item.id}"]`);
      if (!card) {
        return;
      }

      // 更新进度条
      const progressValue = card.querySelector(".progress-bar span");
      if (progressValue) {
        const percent = getProgressPercent(item);
        if (item.totalBytes && item.totalBytes > 0) {
          progressValue.style.width = `${percent}%`;
        }
      }

      // 更新详情文字
      const details = card.querySelector(".download-details-text");
      if (details) {
        const speed = calculateDownloadSpeed(item);
        const speedStr = formatSpeed(speed);
        const downloadedStr = formatBytes(item.bytesReceived || 0);
        const totalStr = item.totalBytes ? formatBytes(item.totalBytes) : "--";
        const timeLeftStr = estimateRemainingTime(item, speed);
        details.textContent = `下载中 , ${speedStr} - ${downloadedStr} , 共 ${totalStr} , 剩余 ${timeLeftStr}`;
      }
    });

    // 检查是否有下载完成，需要完整刷新
    if (activeItems.length === 0 && state.downloads.some((d) => d.state === "in_progress")) {
      loadDownloads(); // 状态变化，完整刷新
    }
  } catch (error) {
    console.error("更新进度失败", error);
  }
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
      orderBy: ["-startTime"]
    });
    state.downloads = (items || []).slice(0, state.settings.listSize);
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
    // 过滤掉待删除的记录
    if (state.pendingDeletes.has(item.id)) {
      return false;
    }
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

  // 根据是否有活跃下载来启动/停止定时刷新
  const hasActiveDownloads = state.downloads.some((item) => item.state === "in_progress" || item.state === "downloading");
  if (hasActiveDownloads) {
    startProgressRefresh();
  } else {
    stopProgressRefresh();
  }
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
    card.dataset.id = item.id; // 添加 ID 用于局部更新

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
    main.append(title);

    // 非下载中状态显示标准元数据
    const isDownloading = item.state === "in_progress" || item.state === "downloading";
    if (!isDownloading) {
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

      main.append(status, meta);
    }

    if (isDownloading) {
      // 1. 进度条 (细条，无文字)
      const progress = document.createElement("div");
      progress.className = "progress compact"; // Add compact class
      const progressBar = document.createElement("div");
      progressBar.className = "progress-bar";
      if (!item.totalBytes || item.totalBytes <= 0) {
        progressBar.classList.add("indeterminate");
      }
      const progressValue = document.createElement("span");
      const percent = getProgressPercent(item);
      if (!item.totalBytes || item.totalBytes <= 0) {
        progressValue.style.width = "40%";
      } else {
        progressValue.style.width = `${percent}%`;
      }
      progressBar.appendChild(progressValue);
      progress.appendChild(progressBar);
      main.appendChild(progress);

      // 2. 详情文字行: "下载中, 277.7KB/s - 1.8MB , 共 12.7MB , 剩余 40秒"
      const details = document.createElement("div");
      details.className = "download-details-text";

      const speed = calculateDownloadSpeed(item);
      const speedStr = formatSpeed(speed);
      const downloadedStr = formatBytes(item.bytesReceived || 0);
      const totalStr = item.totalBytes ? formatBytes(item.totalBytes) : "--";
      const timeLeftStr = estimateRemainingTime(item, speed);

      // 组合字符串
      details.textContent = `下载中 , ${speedStr} - ${downloadedStr} , 共 ${totalStr} , 剩余 ${timeLeftStr}`;

      main.appendChild(details);
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
    if (isDownloading) {
      actions.append(buildActionButton("取消", "danger", () => cancelDownload(item)));
    }
    actions.append(buildActionButton("移除", "", () => removeDownload(item)));

    card.append(icon, main, actions);
    elements.downloadList.appendChild(card);
  });
}

function updateDownloadIndicator() {
  const downloadingCount = state.downloads.filter((item) => item.state === "in_progress" || item.state === "downloading").length;
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

function buildInfoPill(label, value, variant) {
  const pill = document.createElement("span");
  pill.className = variant ? `info-pill info-pill--${variant}` : "info-pill";
  const labelSpan = document.createElement("span");
  labelSpan.className = "info-pill-label";
  labelSpan.textContent = label;
  const valueSpan = document.createElement("strong");
  valueSpan.textContent = value;
  pill.append(labelSpan, valueSpan);
  return pill;
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
    // resume() 只能恢复暂停的下载，不能重新开始已取消/中断的下载
    if (item.state === "paused" || item.canResume) {
      await chromeDownloadsResume(item.id);
      showToast("已恢复下载", false);
    } else if (item.url) {
      // 对于中断/取消的下载，使用原始 URL 重新下载
      await chromeDownloadsDownload({ url: item.url });
      showToast("已重新开始下载", false);
      loadDownloads(); // 刷新列表显示新下载
    } else {
      showToast("无法重试：缺少下载链接", false);
    }
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
      // 同时删除磁盘文件和记录 - 立即执行，不支持撤销
      await chromeDownloadsRemoveFile(item.id);
      showToast("已删除文件和记录", false);
      loadDownloads();
    } else {
      // 仅移除记录 - 使用延迟删除，支持撤销
      const UNDO_DELAY_MS = 5000; // 5秒撤销窗口

      // 设置定时器，超时后真正删除
      const timerId = setTimeout(() => {
        executePendingDelete(item.id);
      }, UNDO_DELAY_MS);

      // 添加到待删除队列
      state.pendingDeletes.set(item.id, { item, timerId });

      // 刷新列表（会自动过滤掉待删除记录）
      applyFilters();

      // 显示带撤销按钮的 Toast
      if (state.settings.undoRemove) {
        showToast("已移除下载记录", true, () => undoRemove(item.id));
      } else {
        showToast("已移除下载记录", false);
      }
    }
  } catch (error) {
    console.error("移除失败", error);
    showToast("移除失败", false);
  }
}

function showRemoveDialog(item) {
  return new Promise((resolve) => {
    const isComplete = item.state === "complete";

    // 显示模态框
    elements.removeConfirmModal.classList.remove("hidden");

    if (!isComplete) {
      elements.modalBtnDeleteFile.style.display = 'none';
    } else {
      elements.modalBtnDeleteFile.style.display = 'block';
    }

    const cleanup = () => {
      elements.removeConfirmModal.classList.add("hidden");
      elements.modalBtnRemoveRecord.removeEventListener("click", handleRemoveRecord);
      elements.modalBtnDeleteFile.removeEventListener("click", handleDeleteFile);
      elements.modalBtnCancel.removeEventListener("click", handleCancel);
      // 恢复按钮显示状态
      elements.modalBtnDeleteFile.style.display = '';
    };

    const handleRemoveRecord = () => {
      cleanup();
      resolve("remove_record");
    };

    const handleDeleteFile = () => {
      cleanup();
      resolve("delete_file");
    };

    const handleCancel = () => {
      cleanup();
      resolve(null);
    };

    elements.modalBtnRemoveRecord.addEventListener("click", handleRemoveRecord);
    elements.modalBtnDeleteFile.addEventListener("click", handleDeleteFile);
    elements.modalBtnCancel.addEventListener("click", handleCancel);
  });
}

// 真正执行删除（定时器触发时调用）
async function executePendingDelete(downloadId) {
  const pending = state.pendingDeletes.get(downloadId);
  if (!pending) {
    return; // 已被撤销或已处理
  }

  try {
    await chromeDownloadsErase({ id: downloadId });
  } catch (error) {
    console.error("删除失败", error);
  }

  // 从待删除队列移除
  state.pendingDeletes.delete(downloadId);
}

// 撤销删除（用户点击撤销按钮时调用）
function undoRemove(downloadId) {
  const pending = state.pendingDeletes.get(downloadId);
  if (!pending) {
    showToast("撤销失败：记录已被删除", false);
    return;
  }

  // 清除定时器，阻止真正删除
  clearTimeout(pending.timerId);

  // 从待删除队列移除
  state.pendingDeletes.delete(downloadId);

  // 刷新列表（恢复显示该记录）
  applyFilters();

  showToast("已恢复记录", false);
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

function formatTime(dateStr) {
  if (!dateStr) {
    return "--";
  }
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    if (isToday) {
      return `${hours}:${minutes}`;
    }
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}/${day} ${hours}:${minutes}`;
  } catch (error) {
    console.error("格式化时间失败", error);
    return "--";
  }
}

/**
 * 格式化速度显示 (字节/秒)
 */
function formatSpeed(bytesPerSecond) {
  if (!bytesPerSecond || bytesPerSecond <= 0) {
    return "--";
  }
  const units = ["B/s", "KB/s", "MB/s", "GB/s"];
  let value = bytesPerSecond;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(1)}${units[index]}`;
}

/**
 * 计算下载速度 (基于已下载字节和耗时的平均速度)
 * @param {object} item - Download item from Chrome API
 * @returns {number} 速度(字节/秒),返回0表示无法计算
 */
function calculateDownloadSpeed(item) {
  const isDownloading = item && (item.state === 'in_progress' || item.state === 'downloading');
  if (!isDownloading || !item.bytesReceived || item.bytesReceived === 0) {
    return 0;
  }

  // 方法1: 基于 estimatedEndTime 反推速度
  if (item.estimatedEndTime && item.totalBytes && item.totalBytes > item.bytesReceived) {
    const remainingMs = new Date(item.estimatedEndTime).getTime() - Date.now();
    if (remainingMs > 0) {
      const remainingBytes = item.totalBytes - item.bytesReceived;
      return remainingBytes / (remainingMs / 1000);
    }
  }

  // 方法2: 基于开始时间和已下载字节计算平均速度
  if (item.startTime) {
    const elapsedMs = Date.now() - new Date(item.startTime).getTime();
    if (elapsedMs > 1000) { // 至少1秒才计算
      return item.bytesReceived / (elapsedMs / 1000);
    }
  }

  return 0;
}

/**
 * 预估剩余时间
 * @param {object} item - Download item from Chrome API
 * @param {number} speed - 当前速度(字节/秒)
 * @returns {string} 格式化的剩余时间
 */
function estimateRemainingTime(item, speed) {
  // 优先使用Chrome API的estimatedEndTime
  if (item.estimatedEndTime) {
    const remaining = new Date(item.estimatedEndTime).getTime() - Date.now();
    if (remaining > 0) {
      return formatDuration(remaining);
    }
  }

  // 备选方案:基于当前速度计算
  if (speed > 0 && item.totalBytes && item.totalBytes > item.bytesReceived) {
    const remainingBytes = item.totalBytes - item.bytesReceived;
    const remainingMs = (remainingBytes / speed) * 1000;
    return formatDuration(remainingMs);
  }

  return "计算中...";
}

/**
 * 格式化时长 (毫秒转可读字符串)
 */
function formatDuration(ms) {
  if (ms <= 0) return "即将完成";

  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return `${seconds}秒`;

  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes}分钟`;

  const hours = Math.ceil(minutes / 60);
  return `约 ${hours} 小时`;
}

function statusLabel(state) {
  const map = {
    in_progress: "下载中",
    downloading: "下载中",
    interrupted: "已失败",
    complete: "已完成",
    paused: "已暂停"
  };
  return map[state] || state;
}

function statusClass(state) {
  const map = {
    in_progress: "status-downloading",
    downloading: "status-downloading",
    interrupted: "status-interrupted",
    complete: "status-complete",
    paused: "status-paused"
  };
  return map[state] || "";
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function showToast(message, allowUndo, undoCallback) {
  elements.toastMessage.textContent = message;
  elements.toast.classList.remove("hidden");

  if (allowUndo && undoCallback) {
    elements.toastAction.classList.remove("hidden");
    elements.toastAction.onclick = () => {
      undoCallback();
      hideToast();
    };
  } else {
    elements.toastAction.classList.add("hidden");
  }

  setTimeout(() => {
    hideToast();
  }, 3000);
}

function hideToast() {
  elements.toast.classList.add("hidden");
}

// Chrome API Wrappers
function chromeDownloadsSearch(query) {
  return new Promise((resolve, reject) => {
    try {
      if (!chromeApi || !chromeApi.downloads) {
        // 在开发环境模拟数据
        if (state.downloads.length > 0) {
          resolve(state.downloads);
          return;
        }
        // Mock data for development when API is not present
        // resolve([]);
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
      chromeApi.downloads.open(id);
      // open method does not have a callback in some versions, but we assume it works or throws async
      // To be safe wrap in try catch and resolve
      resolve();
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
      chromeApi.downloads.show(id);
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

// ========== 新建下载功能 ==========

function showNewDownloadModal() {
  elements.newDownloadUrls.value = "";
  elements.newDownloadModal.classList.remove("hidden");
  elements.newDownloadUrls.focus();
}

function hideNewDownloadModal() {
  elements.newDownloadModal.classList.add("hidden");
  elements.newDownloadUrls.value = "";
}

async function handleNewDownload() {
  const text = elements.newDownloadUrls.value.trim();
  if (!text) {
    showToast("请输入下载地址", false);
    return;
  }

  const lines = text.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
  if (lines.length === 0) {
    showToast("请输入下载地址", false);
    return;
  }

  const validUrls = [];
  const invalidUrls = [];

  lines.forEach((url) => {
    if (isValidHttpUrl(url)) {
      validUrls.push(url);
    } else {
      invalidUrls.push(url);
    }
  });

  if (validUrls.length === 0) {
    showToast("没有有效的 HTTP/HTTPS 地址", false);
    return;
  }

  hideNewDownloadModal();

  let successCount = 0;
  let failCount = 0;

  for (const url of validUrls) {
    try {
      await chromeDownloadsDownload({ url });
      successCount += 1;
    } catch (error) {
      console.error("下载失败", url, error);
      failCount += 1;
    }
  }

  // 显示结果
  let message = `已添加 ${successCount} 个下载任务`;
  if (failCount > 0) {
    message += `，${failCount} 个失败`;
  }
  if (invalidUrls.length > 0) {
    message += `，${invalidUrls.length} 个地址无效`;
  }
  showToast(message, false);
  loadDownloads();
}

function isValidHttpUrl(str) {
  try {
    const url = new URL(str);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (error) {
    return false;
  }
}
