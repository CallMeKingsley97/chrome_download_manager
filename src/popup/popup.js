const chromeApi = typeof chrome !== "undefined" ? chrome : null;

const DEFAULT_SETTINGS = {
  listSize: 50,
  defaultStatusFilter: "all",
  showSpeed: false,
  undoRemove: true,
  enableNotifications: true,
  smartTags: {
    enabled: true,
    showTime: true,
    timeWindowDays: 7,
    showDomain: true,
    workDomains: ["github.com", "gitlab.com", "notion.so", "figma.com", "docs.google.com"],
    socialDomains: ["twitter.com", "x.com", "facebook.com", "instagram.com", "weibo.com", "bilibili.com"]
  },
  scheduledDownload: {
    enabled: false,
    time: "02:00",
    urls: []
  },
  takeover: {
    enabled: false
  }
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
  newDownloadCancel: document.getElementById("newDownloadCancel"),
  // Statistics Modal Elements
  statisticsModal: document.getElementById("statisticsModal"),
  statTotalCount: document.getElementById("statTotalCount"),
  statTotalSize: document.getElementById("statTotalSize"),
  statCompleteCount: document.getElementById("statCompleteCount"),
  statFailedCount: document.getElementById("statFailedCount"),
  statsTypeChart: document.getElementById("statsTypeChart"),
  statsTopDomains: document.getElementById("statsTopDomains"),
  statsCloseBtn: document.getElementById("statsCloseBtn")
};

const TYPE_MAP = {
  document: ["pdf", "doc", "docx", "ppt", "pptx", "txt"],
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

function t(key, substitutions, fallback = "") {
  try {
    if (!chromeApi || !chromeApi.i18n || typeof chromeApi.i18n.getMessage !== "function") {
      return fallback;
    }
    const value = chromeApi.i18n.getMessage(key, substitutions);
    return value || fallback;
  } catch (error) {
    console.error("i18n getMessage failed", error);
    return fallback;
  }
}

function applyI18n() {
  try {
    document.querySelectorAll("[data-i18n]").forEach((node) => {
      const key = node.getAttribute("data-i18n");
      if (!key) {
        return;
      }
      const value = t(key, undefined, node.textContent || "");
      if (value) {
        node.textContent = value;
      }
    });

    document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
      const key = node.getAttribute("data-i18n-placeholder");
      if (!key) {
        return;
      }
      const value = t(key, undefined, node.getAttribute("placeholder") || "");
      if (value) {
        node.setAttribute("placeholder", value);
      }
    });

    document.querySelectorAll("[data-i18n-aria]").forEach((node) => {
      const key = node.getAttribute("data-i18n-aria");
      if (!key) {
        return;
      }
      const value = t(key, undefined, node.getAttribute("aria-label") || "");
      if (value) {
        node.setAttribute("aria-label", value);
      }
    });
  } catch (error) {
    console.error("applyI18n failed", error);
  }
}

init();

function init() {
  try {
    applyI18n();
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
    closeActionMenus();
    // 直接切换菜单状态，避免事件冒泡导致自动打开
    const isHidden = elements.menuPanel.classList.contains("hidden");
    if (isHidden) {
      elements.menuPanel.classList.remove("hidden");
    } else {
      elements.menuPanel.classList.add("hidden");
    }
  });
  elements.menuPanel.addEventListener("click", (event) => {
    const actionElement = event.target.closest('[data-action]');
    const action = actionElement ? actionElement.dataset.action : null;
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
    if (!event.target.closest(".action-menu")) {
      closeActionMenus();
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
      closeActionMenus();
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
        details.textContent = t(
          "downloadDetailsPattern",
          [speedStr, downloadedStr, totalStr, timeLeftStr],
          `Downloading, ${speedStr} - ${downloadedStr}, total ${totalStr}, left ${timeLeftStr}`
        );
      }
    });

    // 检查是否有下载完成，需要完整刷新
    if (activeItems.length === 0 && state.downloads.some((d) => d.state === "in_progress")) {
      loadDownloads(); // 状态变化，完整刷新
    }
  } catch (error) {
    console.error("update active download progress failed", error);
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

function mergeSettings(storedSettings) {
  const settings = storedSettings ? { ...DEFAULT_SETTINGS, ...storedSettings } : { ...DEFAULT_SETTINGS };
  settings.smartTags = { ...DEFAULT_SETTINGS.smartTags, ...(storedSettings && storedSettings.smartTags ? storedSettings.smartTags : {}) };
  settings.scheduledDownload = {
    ...DEFAULT_SETTINGS.scheduledDownload,
    ...(storedSettings && storedSettings.scheduledDownload ? storedSettings.scheduledDownload : {})
  };
  settings.takeover = {
    ...DEFAULT_SETTINGS.takeover,
    ...(storedSettings && storedSettings.takeover ? storedSettings.takeover : {})
  };
  return settings;
}

async function loadSettings() {
  try {
    if (!chromeApi || !chromeApi.storage) {
      showToast(t("toastNeedExtension", undefined, "请在扩展环境中打开"), false);
      return;
    }
    // 优先从 chrome.storage.sync 读取 (Cloud Sync)
    let stored = {};
    try {
      stored = await chromeSyncStorageGet(["settings"]);
    } catch (syncError) {
      console.warn("storage.sync read failed, fallback to local", syncError);
      stored = await chromeStorageGet(["settings"]);
    }
    state.settings = mergeSettings(stored.settings);
  } catch (error) {
    console.error("load settings failed", error);
  }
}

async function loadDownloads() {
  try {
    if (!chromeApi || !chromeApi.downloads) {
      showToast(t("toastNeedExtension", undefined, "请在扩展环境中打开"), false);
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
    console.error("load downloads failed", error);
    showToast(t("toastLoadDownloadsFailed", undefined, "加载下载列表失败"), false);
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
      ? t("emptyNoMatchTitle", undefined, "没有匹配结果")
      : t("emptyNoDownloadsTitle", undefined, "暂无下载记录");
    elements.emptyState.querySelector(".empty-desc").textContent = isSearchEmpty
      ? t("emptyNoMatchDesc", undefined, "尝试修改关键词")
      : t("emptyNoDownloadsDesc", undefined, "去下载点什么吧");
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
    // 添加智能标签
    title.appendChild(buildSmartTagElements(item));
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
      details.textContent = t(
        "downloadDetailsPattern",
        [speedStr, downloadedStr, totalStr, timeLeftStr],
        `Downloading, ${speedStr} - ${downloadedStr}, total ${totalStr}, left ${timeLeftStr}`
      );

      main.appendChild(details);
    }

    if (item.state === "interrupted") {
      const failed = document.createElement("div");
      failed.className = "file-meta";
      failed.textContent = t("hintInterrupted", undefined, "下载中断，可尝试重试");
      main.appendChild(failed);
    }

    const actions = document.createElement("div");
    actions.className = "action-group";

    let primaryAction = null;
    const secondaryActions = [];

    if (item.state === "complete") {
      primaryAction = { label: t("actionOpen", undefined, "打开"), variant: "primary", onClick: () => openFile(item) };
      secondaryActions.push({ label: t("actionShowInFolder", undefined, "定位"), onClick: () => showInFolder(item) });
    }
    if (item.state === "interrupted") {
      primaryAction = { label: t("actionRetry", undefined, "重试"), variant: "primary", onClick: () => retryDownload(item) };
    }
    if (isDownloading) {
      primaryAction = { label: t("actionCancel", undefined, "取消"), variant: "danger", onClick: () => cancelDownload(item) };
    }

    secondaryActions.push({ label: t("actionRemove", undefined, "移除"), variant: "danger", onClick: () => removeDownload(item) });

    if (primaryAction) {
      actions.append(buildActionButton(primaryAction.label, primaryAction.variant, primaryAction.onClick));
    } else {
      actions.append(buildActionButton(t("actionRemove", undefined, "移除"), "", () => removeDownload(item)));
      secondaryActions.length = 0;
    }

    if (secondaryActions.length > 0) {
      actions.append(buildActionMenu(secondaryActions));
    }

    card.append(icon, main, actions);
    elements.downloadList.appendChild(card);
  });
}

function updateDownloadIndicator() {
  const downloadingCount = state.downloads.filter((item) => item.state === "in_progress" || item.state === "downloading").length;
  if (downloadingCount > 0) {
    elements.downloadIndicator.classList.remove("hidden");
    elements.downloadIndicatorText.innerHTML = `${escapeHtml(t("downloadingLabel", undefined, "下载中"))} <span class="count">${downloadingCount}</span>`;
  } else {
    elements.downloadIndicator.classList.add("hidden");
    elements.downloadIndicatorText.textContent = t("labelDownloadingIdle", undefined, "正在下载");
  }
}

function buildActionButton(label, variant, onClick) {
  const button = document.createElement("button");
  button.className = `action-button ${variant}`.trim();
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", () => {
    button.disabled = true;
    onClick().finally(() => {
      button.disabled = false;
    });
  });
  return button;
}

function buildActionMenu(actions) {
  const wrapper = document.createElement("div");
  wrapper.className = "action-menu";

  const trigger = document.createElement("button");
  trigger.className = "action-menu-trigger";
  trigger.type = "button";
  trigger.setAttribute("aria-label", t("actionMore", undefined, "更多操作"));
  trigger.textContent = "⋯";

  const panel = document.createElement("div");
  panel.className = "action-menu-panel";

  actions.forEach((item) => {
    const button = document.createElement("button");
    button.className = `action-menu-item ${item.variant || ""}`.trim();
    button.type = "button";
    button.textContent = item.label;
    button.addEventListener("click", () => {
      button.disabled = true;
      wrapper.classList.remove("open");
      item.onClick().finally(() => {
        button.disabled = false;
      });
    });
    panel.appendChild(button);
  });

  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    closeActionMenus();
    wrapper.classList.toggle("open");
  });

  wrapper.append(trigger, panel);
  return wrapper;
}

function closeActionMenus() {
  document.querySelectorAll(".action-menu.open").forEach((menu) => {
    menu.classList.remove("open");
  });
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
  if (action === "view-stats") {
    showStatisticsModal();
    return;
  }
  if (action === "export-json") {
    exportData("json");
    return;
  }
  if (action === "export-csv") {
    exportData("csv");
    return;
  }
  if (action === "clear-complete") {
    clearByState("complete", t("toastClearCompleteSuccess", undefined, "已完成记录已清理"));
    return;
  }
  if (action === "clear-failed") {
    clearByState("interrupted", t("toastClearFailedSuccess", undefined, "失败记录已清理"));
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
    console.error("open downloads page failed", error);
    showToast(t("toastOpenDownloadsFailed", undefined, "打开下载页失败"), false);
  }
}

async function openOptionsPage() {
  try {
    await chromeRuntimeOpenOptions();
  } catch (error) {
    console.error("open options page failed", error);
    showToast(t("toastOpenOptionsFailed", undefined, "打开设置失败"), false);
  }
}

async function openFile(item) {
  try {
    await chromeDownloadsOpen(item.id);
  } catch (error) {
    console.error("open file failed", error);
    showToast(t("toastOpenFileFailed", undefined, "文件可能已移动或删除"), false);
  }
}

async function showInFolder(item) {
  try {
    await chromeDownloadsShow(item.id);
  } catch (error) {
    console.error("show in folder failed", error);
    showToast(t("toastOpenFolderFailed", undefined, "无法打开所在文件夹"), false);
  }
}

async function retryDownload(item) {
  try {
    // resume() 只能恢复暂停的下载，不能重新开始已取消/中断的下载
    if (item.state === "paused" || item.canResume) {
      await chromeDownloadsResume(item.id);
      showToast(t("toastResumeSuccess", undefined, "已恢复下载"), false);
    } else if (item.url) {
      // 对于中断/取消的下载，使用原始 URL 重新下载
      await chromeDownloadsDownload({ url: item.url });
      showToast(t("toastRestartSuccess", undefined, "已重新开始下载"), false);
      loadDownloads(); // 刷新列表显示新下载
    } else {
      showToast(t("toastRetryMissingUrl", undefined, "无法重试：缺少下载链接"), false);
    }
  } catch (error) {
    console.error("retry download failed", error);
    showToast(t("toastRetryFailed", undefined, "重试失败"), false);
  }
}

async function cancelDownload(item) {
  try {
    await chromeDownloadsCancel(item.id);
    showToast(t("toastCancelSuccess", undefined, "已取消下载"), false);
  } catch (error) {
    console.error("cancel download failed", error);
    showToast(t("toastCancelFailed", undefined, "取消失败"), false);
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
      showToast(t("toastDeleteFileAndRecordSuccess", undefined, "已删除文件和记录"), false);
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
        showToast(t("toastRemoveRecordSuccess", undefined, "已移除下载记录"), true, () => undoRemove(item.id));
      } else {
        showToast(t("toastRemoveRecordSuccess", undefined, "已移除下载记录"), false);
      }
    }
  } catch (error) {
    console.error("remove download failed", error);
    showToast(t("toastRemoveFailed", undefined, "移除失败"), false);
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
    showToast(t("toastUndoFailed", undefined, "撤销失败：记录已被删除"), false);
    return;
  }

  // 清除定时器，阻止真正删除
  clearTimeout(pending.timerId);

  // 从待删除队列移除
  state.pendingDeletes.delete(downloadId);

  // 刷新列表（恢复显示该记录）
  applyFilters();

  showToast(t("toastUndoSuccess", undefined, "已恢复记录"), false);
}

async function clearByState(stateValue, message) {
  const confirmed = window.confirm(t("confirmBulkClear", undefined, "确认批量清理记录？"));
  if (!confirmed) {
    return;
  }
  try {
    const items = await chromeDownloadsSearch({ state: stateValue });
    await Promise.all(items.map((item) => chromeDownloadsErase({ id: item.id })));
    showToast(message, false);
    loadDownloads();
  } catch (error) {
    console.error("bulk clear failed", error);
    showToast(t("toastBulkClearFailed", undefined, "批量清理失败"), false);
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
    return parts[parts.length - 1] || t("labelUnknownFile", undefined, "未知文件");
  }
  const url = item.finalUrl || item.url || "";
  try {
    const parsed = new URL(url);
    const segment = parsed.pathname.split("/").pop();
    return segment || parsed.hostname || t("labelUnknownFile", undefined, "未知文件");
  } catch (error) {
    console.error("parse file name failed", error);
    return t("labelUnknownFile", undefined, "未知文件");
  }
}

function getDomain(item) {
  const url = item.finalUrl || item.url || "";
  try {
    if (!url || url.startsWith("file:") || url.startsWith("blob:")) {
      return t("labelUnknownSource", undefined, "本地/未知来源");
    }
    const parsed = new URL(url);
    return parsed.hostname || t("labelUnknownSource", undefined, "本地/未知来源");
  } catch (error) {
    console.error("parse domain failed", error);
    return t("labelUnknownSource", undefined, "本地/未知来源");
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
    console.error("format time failed", error);
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

  return t("timeRemainingCalculating", undefined, "计算中...");
}

/**
 * 格式化时长 (毫秒转可读字符串)
 */
function formatDuration(ms) {
  if (ms <= 0) return t("timeRemainingSoon", undefined, "即将完成");

  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return t("timeSeconds", [String(seconds)], `${seconds}秒`);

  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return t("timeMinutes", [String(minutes)], `${minutes}分钟`);

  const hours = Math.ceil(minutes / 60);
  return t("timeHoursApprox", [String(hours)], `约 ${hours} 小时`);
}

function statusLabel(state) {
  const map = {
    in_progress: t("statusDownloading", undefined, "下载中"),
    downloading: t("statusDownloading", undefined, "下载中"),
    interrupted: t("statusInterrupted", undefined, "已失败"),
    complete: t("statusComplete", undefined, "已完成"),
    paused: t("statusPaused", undefined, "已暂停")
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
  elements.toastAction.textContent = t("buttonUndo", undefined, "撤销");

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
    showToast(t("toastInputDownloadUrls", undefined, "请输入下载地址"), false);
    return;
  }

  const lines = text.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
  if (lines.length === 0) {
    showToast(t("toastInputDownloadUrls", undefined, "请输入下载地址"), false);
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
    showToast(t("toastNoValidHttpUrls", undefined, "没有有效的 HTTP/HTTPS 地址"), false);
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
      console.error("create new download failed", url, error);
      failCount += 1;
    }
  }

  let message = t("toastAddTasksResult", [String(successCount)], `已添加 ${successCount} 个下载任务`);
  if (failCount > 0) {
    message += t("toastAddTasksFailSuffix", [String(failCount)], `，${failCount} 个失败`);
  }
  if (invalidUrls.length > 0) {
    message += t("toastAddTasksInvalidSuffix", [String(invalidUrls.length)], `，${invalidUrls.length} 个地址无效`);
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

// ========== Statistics Dashboard ==========

function calculateStats(items) {
  const stats = {
    totalCount: items.length,
    totalSize: 0,
    completeCount: 0,
    failedCount: 0,
    typeDistribution: {},
    domainDistribution: {}
  };

  items.forEach((item) => {
    // 总大小
    stats.totalSize += item.fileSize || item.totalBytes || 0;

    // 状态统计
    if (item.state === "complete") {
      stats.completeCount += 1;
    } else if (item.state === "interrupted") {
      stats.failedCount += 1;
    }

    // 类型分布
    const type = detectFileType(item);
    stats.typeDistribution[type] = (stats.typeDistribution[type] || 0) + 1;

    // 域名分布
    const domain = getDomain(item);
    stats.domainDistribution[domain] = (stats.domainDistribution[domain] || 0) + 1;
  });

  return stats;
}

function renderStats(stats) {
  // 更新数值卡片
  elements.statTotalCount.textContent = stats.totalCount;
  elements.statTotalSize.textContent = formatBytes(stats.totalSize);
  elements.statCompleteCount.textContent = stats.completeCount;
  elements.statFailedCount.textContent = stats.failedCount;

  // 渲染文件类型分布图
  elements.statsTypeChart.innerHTML = "";
  const maxTypeCount = Math.max(...Object.values(stats.typeDistribution), 1);
  const typeLabels = {
    document: t("typeDocument", undefined, "文档"),
    spreadsheet: t("typeSpreadsheet", undefined, "表格"),
    image: t("typeImage", undefined, "图片"),
    archive: t("typeArchive", undefined, "压缩包"),
    installer: t("typeInstaller", undefined, "安装包"),
    other: t("typeOther", undefined, "其他")
  };

  Object.entries(stats.typeDistribution)
    .sort((a, b) => b[1] - a[1])
    .forEach(([type, count]) => {
      const row = document.createElement("div");
      row.className = "stats-chart-row";

      const label = document.createElement("span");
      label.className = "stats-chart-label";
      label.textContent = typeLabels[type] || type;

      const barContainer = document.createElement("div");
      barContainer.className = "stats-chart-bar-container";

      const bar = document.createElement("div");
      bar.className = "stats-chart-bar";
      bar.style.width = `${(count / maxTypeCount) * 100}%`;
      bar.style.background = TYPE_COLORS[type] || TYPE_COLORS.other;

      const countSpan = document.createElement("span");
      countSpan.className = "stats-chart-count";
      countSpan.textContent = count;

      bar.appendChild(countSpan);
      barContainer.appendChild(bar);
      row.append(label, barContainer);
      elements.statsTypeChart.appendChild(row);
    });

  // 渲染 Top 5 域名
  elements.statsTopDomains.innerHTML = "";
  const topDomains = Object.entries(stats.domainDistribution)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  topDomains.forEach(([domain, count]) => {
    const li = document.createElement("li");
    const nameSpan = document.createElement("span");
    nameSpan.className = "domain-name";
    nameSpan.textContent = domain;
    const countSpan = document.createElement("span");
    countSpan.className = "domain-count";
    countSpan.textContent = count;
    li.append(nameSpan, countSpan);
    elements.statsTopDomains.appendChild(li);
  });

  if (topDomains.length === 0) {
    const li = document.createElement("li");
    li.textContent = t("statsNoData", undefined, "暂无数据");
    li.style.justifyContent = "center";
    li.style.color = "var(--muted)";
    elements.statsTopDomains.appendChild(li);
  }
}

function showStatisticsModal() {
  const stats = calculateStats(state.downloads);
  renderStats(stats);
  elements.statisticsModal.classList.remove("hidden");

  // 绑定关闭事件
  const closeHandler = () => {
    elements.statisticsModal.classList.add("hidden");
    elements.statsCloseBtn.removeEventListener("click", closeHandler);
    elements.statisticsModal.removeEventListener("click", overlayClickHandler);
  };

  const overlayClickHandler = (event) => {
    if (event.target === elements.statisticsModal) {
      closeHandler();
    }
  };

  elements.statsCloseBtn.addEventListener("click", closeHandler);
  elements.statisticsModal.addEventListener("click", overlayClickHandler);
}

// ========== Export Functions ==========

function exportData(format) {
  if (state.downloads.length === 0) {
    showToast(t("toastNoExportData", undefined, "没有可导出的数据"), false);
    return;
  }

  let content = "";
  let filename = "";
  const timestamp = new Date().toISOString().slice(0, 10);

  if (format === "json") {
    const exportItems = state.downloads.map((item) => ({
      id: item.id,
      filename: getFileName(item),
      url: item.finalUrl || item.url || "",
      size: item.fileSize || item.totalBytes || 0,
      state: item.state,
      startTime: item.startTime,
      endTime: item.endTime,
      domain: getDomain(item),
      type: detectFileType(item)
    }));
    content = JSON.stringify(exportItems, null, 2);
    filename = `downloads_${timestamp}.json`;
  } else if (format === "csv") {
    const headers = [
      t("csvHeaderId", undefined, "ID"),
      t("csvHeaderFilename", undefined, "文件名"),
      t("csvHeaderUrl", undefined, "URL"),
      t("csvHeaderSize", undefined, "大小(字节)"),
      t("csvHeaderState", undefined, "状态"),
      t("csvHeaderStartTime", undefined, "开始时间"),
      t("csvHeaderEndTime", undefined, "结束时间"),
      t("csvHeaderDomain", undefined, "来源域名"),
      t("csvHeaderType", undefined, "类型")
    ];
    const rows = state.downloads.map((item) => [
      item.id,
      `"${getFileName(item).replace(/"/g, '""')}"`,
      `"${(item.finalUrl || item.url || "").replace(/"/g, '""')}"`,
      item.fileSize || item.totalBytes || 0,
      item.state,
      item.startTime || "",
      item.endTime || "",
      getDomain(item),
      detectFileType(item)
    ]);
    content = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
    // Add BOM for Excel to correctly recognize UTF-8
    content = "\uFEFF" + content;
    filename = `downloads_${timestamp}.csv`;
  }

  triggerFileDownload(content, filename, format === "json" ? "application/json" : "text/csv;charset=utf-8");
  showToast(t("toastExportedCount", [String(state.downloads.length)], `已导出 ${state.downloads.length} 条记录`), false);
}

function triggerFileDownload(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ========== Cloud Sync Storage ==========

function chromeSyncStorageGet(keys) {
  return new Promise((resolve, reject) => {
    try {
      if (!chromeApi || !chromeApi.storage || !chromeApi.storage.sync) {
        reject(new Error("同步存储 API 不可用"));
        return;
      }
      chromeApi.storage.sync.get(keys, (items) => {
        const error = chromeApi.runtime.lastError;
        if (error) {
          console.error("storage.sync.get 失败", error.message);
          reject(error);
          return;
        }
        resolve(items || {});
      });
    } catch (error) {
      console.error("storage.sync.get 异常", error);
      reject(error);
    }
  });
}

function chromeSyncStorageSet(items) {
  return new Promise((resolve, reject) => {
    try {
      if (!chromeApi || !chromeApi.storage || !chromeApi.storage.sync) {
        reject(new Error("同步存储 API 不可用"));
        return;
      }
      chromeApi.storage.sync.set(items, () => {
        const error = chromeApi.runtime.lastError;
        if (error) {
          console.error("storage.sync.set 失败", error.message);
          reject(error);
          return;
        }
        resolve();
      });
    } catch (error) {
      console.error("storage.sync.set 异常", error);
      reject(error);
    }
  });
}

// ========== Smart Tags ==========

/**
 * 生成智能标签
 * 基于元数据 (时间、域名) 生成标签
 */
function generateTags(item) {
  const tags = [];
  const config = state.settings && state.settings.smartTags ? state.settings.smartTags : DEFAULT_SETTINGS.smartTags;
  if (!config.enabled) {
    return tags;
  }
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // 时间标签
  if (config.showTime && item.startTime) {
    const startDate = new Date(item.startTime);
    const startOfStartDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const diffDays = (startOfToday - startOfStartDay) / (1000 * 60 * 60 * 24);
    const windowDays = Number(config.timeWindowDays) || 7;

    if (diffDays === 0 && windowDays >= 1) {
      tags.push({ label: t("tagToday", undefined, "今天"), class: "today" });
    } else if (diffDays > 0 && diffDays < windowDays) {
      const label = windowDays <= 7
        ? t("tagThisWeek", undefined, "本周")
        : t("tagRecentDays", [String(windowDays)], `近${windowDays}天`);
      tags.push({ label, class: "last-week" });
    }
  }

  // 域名标签 - 识别常见平台
  if (config.showDomain) {
    const domain = getDomain(item).toLowerCase();
    const workDomains = normalizeDomainList(config.workDomains);
    const socialDomains = normalizeDomainList(config.socialDomains);

    if (domain && workDomains.some((d) => domain.includes(d))) {
      tags.push({ label: t("tagWork", undefined, "办公"), class: "work" });
    }
    if (domain && socialDomains.some((d) => domain.includes(d))) {
      tags.push({ label: t("tagSocial", undefined, "社交"), class: "social" });
    }
  }

  return tags;
}

function normalizeDomainList(list) {
  if (!Array.isArray(list)) {
    return [];
  }
  return list
    .map((value) => String(value).trim().toLowerCase())
    .filter(Boolean);
}

/**
 * 构建智能标签 HTML 元素
 */
function buildSmartTagElements(item) {
  const tags = generateTags(item);
  const fragment = document.createDocumentFragment();

  tags.forEach((tag) => {
    const span = document.createElement("span");
    span.className = `smart-tag ${tag.class}`;
    span.textContent = tag.label;
    fragment.appendChild(span);
  });

  return fragment;
}
