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

const ALLOWED_STATUS_FILTERS = new Set(["all", "in_progress", "complete", "interrupted"]);
const ALLOWED_LIST_SIZES = new Set([20, 50, 100]);

const elements = {
  form: document.getElementById("settingsForm"),
  listSize: document.getElementById("listSize"),
  defaultStatusFilter: document.getElementById("defaultStatusFilter"),
  showSpeed: document.getElementById("showSpeed"),
  undoRemove: document.getElementById("undoRemove"),
  enableNotifications: document.getElementById("enableNotifications"),
  enableSmartTags: document.getElementById("enableSmartTags"),
  smartTagsShowTime: document.getElementById("smartTagsShowTime"),
  smartTagsTimeWindow: document.getElementById("smartTagsTimeWindow"),
  smartTagsShowDomain: document.getElementById("smartTagsShowDomain"),
  smartTagsWorkDomains: document.getElementById("smartTagsWorkDomains"),
  smartTagsSocialDomains: document.getElementById("smartTagsSocialDomains"),
  scheduleEnabled: document.getElementById("scheduleEnabled"),
  scheduleTime: document.getElementById("scheduleTime"),
  scheduleUrls: document.getElementById("scheduleUrls"),
  takeoverEnabled: document.getElementById("takeoverEnabled"),
  openShortcutsPage: document.getElementById("openShortcutsPage"),
  status: document.getElementById("status")
};

init();

function normalizeStatusFilter(value) {
  if (value === "downloading") {
    return "in_progress";
  }
  return ALLOWED_STATUS_FILTERS.has(value) ? value : "all";
}

function normalizeListSize(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_SETTINGS.listSize;
  }
  return ALLOWED_LIST_SIZES.has(parsed) ? parsed : DEFAULT_SETTINGS.listSize;
}

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
  } catch (error) {
    console.error("applyI18n failed", error);
  }
}

function init() {
  try {
    applyI18n();
    if (!chromeApi || !chromeApi.storage) {
      elements.status.textContent = t("statusOpenInExtension", undefined, "请在扩展环境中打开设置页");
      elements.form.querySelectorAll("input, select, button, textarea").forEach((el) => {
        el.disabled = true;
      });
      return;
    }

    loadSettings();
    elements.form.addEventListener("submit", handleSubmit);
    bindControls();

    if (elements.openShortcutsPage) {
      elements.openShortcutsPage.addEventListener("click", (event) => {
        event.preventDefault();
        if (chromeApi && chromeApi.tabs) {
          chromeApi.tabs.create({ url: "chrome://extensions/shortcuts" });
        }
      });
    }
  } catch (error) {
    console.error("init failed", error);
  }
}

function bindControls() {
  elements.enableSmartTags.addEventListener("change", updateSmartTagControls);
  elements.smartTagsShowTime.addEventListener("change", updateSmartTagControls);
  elements.smartTagsShowDomain.addEventListener("change", updateSmartTagControls);
  elements.scheduleEnabled.addEventListener("change", updateScheduleControls);
}

function updateSmartTagControls() {
  const enabled = Boolean(elements.enableSmartTags.checked);
  elements.smartTagsShowTime.disabled = !enabled;
  elements.smartTagsTimeWindow.disabled = !enabled || !elements.smartTagsShowTime.checked;
  elements.smartTagsShowDomain.disabled = !enabled;
  elements.smartTagsWorkDomains.disabled = !enabled || !elements.smartTagsShowDomain.checked;
  elements.smartTagsSocialDomains.disabled = !enabled || !elements.smartTagsShowDomain.checked;
}

function updateScheduleControls() {
  const enabled = Boolean(elements.scheduleEnabled.checked);
  elements.scheduleTime.disabled = !enabled;
  elements.scheduleUrls.disabled = !enabled;
}

function mergeSettings(storedSettings) {
  const settings = storedSettings ? { ...DEFAULT_SETTINGS, ...storedSettings } : { ...DEFAULT_SETTINGS };
  settings.listSize = normalizeListSize(settings.listSize);
  settings.defaultStatusFilter = normalizeStatusFilter(settings.defaultStatusFilter);
  settings.smartTags = {
    ...DEFAULT_SETTINGS.smartTags,
    ...(storedSettings && storedSettings.smartTags ? storedSettings.smartTags : {})
  };
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

async function persistSettings(settings) {
  try {
    await chromeSyncStorageSet({ settings });
  } catch (syncError) {
    console.warn("sync storage save failed, fallback to local", syncError);
    await chromeStorageSet({ settings });
  }
}

function formatDomainList(list) {
  return Array.isArray(list) ? list.join("\n") : "";
}

function parseDomainList(text) {
  return String(text || "")
    .split(/[\n,]+/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function isValidHttpUrl(value) {
  try {
    const parsed = new URL(String(value).trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch (error) {
    return false;
  }
}

function parseScheduleUrls(text) {
  return String(text || "")
    .split(/[\n,]+/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .filter((value) => isValidHttpUrl(value));
}

function normalizeTimeInput(value) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(String(value || "")) ? value : "02:00";
}

async function loadSettings() {
  try {
    let stored = {};
    try {
      stored = await chromeSyncStorageGet(["settings"]);
    } catch (syncError) {
      console.warn("sync storage read failed, fallback to local", syncError);
      stored = await chromeStorageGet(["settings"]);
    }

    const settings = mergeSettings(stored.settings);
    elements.listSize.value = String(settings.listSize);
    elements.defaultStatusFilter.value = settings.defaultStatusFilter;
    elements.showSpeed.checked = Boolean(settings.showSpeed);
    elements.undoRemove.checked = Boolean(settings.undoRemove);
    elements.enableNotifications.checked = Boolean(settings.enableNotifications);

    elements.enableSmartTags.checked = Boolean(settings.smartTags.enabled);
    elements.smartTagsShowTime.checked = Boolean(settings.smartTags.showTime);
    elements.smartTagsTimeWindow.value = String(settings.smartTags.timeWindowDays || 7);
    elements.smartTagsShowDomain.checked = Boolean(settings.smartTags.showDomain);
    elements.smartTagsWorkDomains.value = formatDomainList(settings.smartTags.workDomains);
    elements.smartTagsSocialDomains.value = formatDomainList(settings.smartTags.socialDomains);

    elements.scheduleEnabled.checked = Boolean(settings.scheduledDownload.enabled);
    elements.scheduleTime.value = normalizeTimeInput(settings.scheduledDownload.time);
    elements.scheduleUrls.value = formatDomainList(settings.scheduledDownload.urls);

    elements.takeoverEnabled.checked = Boolean(settings.takeover.enabled);

    updateSmartTagControls();
    updateScheduleControls();

    const hasStoredSettings = Boolean(stored && stored.settings);
    const rawStatusFilter = hasStoredSettings ? stored.settings.defaultStatusFilter : DEFAULT_SETTINGS.defaultStatusFilter;
    const rawListSize = hasStoredSettings ? stored.settings.listSize : DEFAULT_SETTINGS.listSize;
    const statusFilterNeedsMigration = normalizeStatusFilter(rawStatusFilter) !== rawStatusFilter;
    const listSizeNeedsMigration = normalizeListSize(rawListSize) !== Number(rawListSize);
    if (hasStoredSettings && (statusFilterNeedsMigration || listSizeNeedsMigration)) {
      await persistSettings(settings);
    }
  } catch (error) {
    console.error("loadSettings failed", error);
    elements.status.textContent = t("statusLoadFailed", undefined, "读取设置失败");
  }
}

async function handleSubmit(event) {
  event.preventDefault();

  const settings = {
    listSize: normalizeListSize(elements.listSize.value),
    defaultStatusFilter: normalizeStatusFilter(elements.defaultStatusFilter.value),
    showSpeed: elements.showSpeed.checked,
    undoRemove: elements.undoRemove.checked,
    enableNotifications: elements.enableNotifications.checked,
    smartTags: {
      enabled: elements.enableSmartTags.checked,
      showTime: elements.smartTagsShowTime.checked,
      timeWindowDays: Number(elements.smartTagsTimeWindow.value) || 7,
      showDomain: elements.smartTagsShowDomain.checked,
      workDomains: parseDomainList(elements.smartTagsWorkDomains.value),
      socialDomains: parseDomainList(elements.smartTagsSocialDomains.value)
    },
    scheduledDownload: {
      enabled: elements.scheduleEnabled.checked,
      time: normalizeTimeInput(elements.scheduleTime.value),
      urls: parseScheduleUrls(elements.scheduleUrls.value)
    },
    takeover: {
      enabled: elements.takeoverEnabled.checked
    }
  };

  try {
    await persistSettings(settings);

    elements.status.textContent = t("statusSaved", undefined, "已保存");
    setTimeout(() => {
      elements.status.textContent = "";
    }, 2000);
  } catch (error) {
    console.error("save settings failed", error);
    elements.status.textContent = t("statusSaveFailed", undefined, "保存失败");
  }
}

function chromeSyncStorageGet(keys) {
  return new Promise((resolve, reject) => {
    try {
      if (!chromeApi || !chromeApi.storage || !chromeApi.storage.sync) {
        reject(new Error("sync storage API unavailable"));
        return;
      }
      chromeApi.storage.sync.get(keys, (items) => {
        const error = chromeApi.runtime.lastError;
        if (error) {
          console.error("storage.sync.get failed", error.message);
          reject(error);
          return;
        }
        resolve(items || {});
      });
    } catch (error) {
      console.error("storage.sync.get exception", error);
      reject(error);
    }
  });
}

function chromeSyncStorageSet(items) {
  return new Promise((resolve, reject) => {
    try {
      if (!chromeApi || !chromeApi.storage || !chromeApi.storage.sync) {
        reject(new Error("sync storage API unavailable"));
        return;
      }
      chromeApi.storage.sync.set(items, () => {
        const error = chromeApi.runtime.lastError;
        if (error) {
          console.error("storage.sync.set failed", error.message);
          reject(error);
          return;
        }
        resolve();
      });
    } catch (error) {
      console.error("storage.sync.set exception", error);
      reject(error);
    }
  });
}

function chromeStorageGet(keys) {
  return new Promise((resolve, reject) => {
    try {
      if (!chromeApi || !chromeApi.storage) {
        reject(new Error("storage API unavailable"));
        return;
      }
      chromeApi.storage.local.get(keys, (items) => {
        const error = chromeApi.runtime.lastError;
        if (error) {
          console.error("storage.get failed", error.message);
          reject(error);
          return;
        }
        resolve(items || {});
      });
    } catch (error) {
      console.error("storage.get exception", error);
      reject(error);
    }
  });
}

function chromeStorageSet(items) {
  return new Promise((resolve, reject) => {
    try {
      if (!chromeApi || !chromeApi.storage) {
        reject(new Error("storage API unavailable"));
        return;
      }
      chromeApi.storage.local.set(items, () => {
        const error = chromeApi.runtime.lastError;
        if (error) {
          console.error("storage.set failed", error.message);
          reject(error);
          return;
        }
        resolve();
      });
    } catch (error) {
      console.error("storage.set exception", error);
      reject(error);
    }
  });
}
