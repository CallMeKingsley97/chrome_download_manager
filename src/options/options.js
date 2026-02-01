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
  }
};

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
  openShortcutsPage: document.getElementById("openShortcutsPage"),
  status: document.getElementById("status")
};

init();

function init() {
  try {
    if (!chromeApi || !chromeApi.storage) {
      elements.status.textContent = "请在扩展环境中打开设置页";
      elements.form.querySelectorAll("input, select, button").forEach((el) => {
        el.disabled = true;
      });
      return;
    }
    loadSettings();
    elements.form.addEventListener("submit", handleSubmit);
    bindSmartTagControls();

    // 快捷键设置页面链接
    if (elements.openShortcutsPage) {
      elements.openShortcutsPage.addEventListener("click", (e) => {
        e.preventDefault();
        if (chromeApi && chromeApi.tabs) {
          chromeApi.tabs.create({ url: "chrome://extensions/shortcuts" });
        }
      });
    }
  } catch (error) {
    console.error("初始化失败", error);
  }
}

function bindSmartTagControls() {
  if (!elements.enableSmartTags) {
    return;
  }
  elements.enableSmartTags.addEventListener("change", updateSmartTagControls);
  elements.smartTagsShowTime.addEventListener("change", updateSmartTagControls);
  elements.smartTagsShowDomain.addEventListener("change", updateSmartTagControls);
}

function updateSmartTagControls() {
  const enabled = Boolean(elements.enableSmartTags.checked);
  elements.smartTagsShowTime.disabled = !enabled;
  elements.smartTagsTimeWindow.disabled = !enabled || !elements.smartTagsShowTime.checked;
  elements.smartTagsShowDomain.disabled = !enabled;
  elements.smartTagsWorkDomains.disabled = !enabled || !elements.smartTagsShowDomain.checked;
  elements.smartTagsSocialDomains.disabled = !enabled || !elements.smartTagsShowDomain.checked;
}

function mergeSettings(storedSettings) {
  const settings = storedSettings ? { ...DEFAULT_SETTINGS, ...storedSettings } : { ...DEFAULT_SETTINGS };
  settings.smartTags = { ...DEFAULT_SETTINGS.smartTags, ...(storedSettings && storedSettings.smartTags ? storedSettings.smartTags : {}) };
  return settings;
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

async function loadSettings() {
  try {
    let stored = {};
    try {
      stored = await chromeSyncStorageGet(["settings"]);
    } catch (syncError) {
      console.warn("同步存储读取失败，回退到本地存储", syncError);
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
    updateSmartTagControls();
  } catch (error) {
    console.error("读取设置失败", error);
    elements.status.textContent = "读取设置失败";
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  const settings = {
    listSize: Number(elements.listSize.value),
    defaultStatusFilter: elements.defaultStatusFilter.value,
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
    }
  };
  try {
    try {
      await chromeSyncStorageSet({ settings });
    } catch (syncError) {
      console.warn("同步存储保存失败，回退到本地存储", syncError);
      await chromeStorageSet({ settings });
    }
    elements.status.textContent = "已保存";
    setTimeout(() => {
      elements.status.textContent = "";
    }, 2000);
  } catch (error) {
    console.error("保存设置失败", error);
    elements.status.textContent = "保存失败";
  }
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

function chromeStorageSet(items) {
  return new Promise((resolve, reject) => {
    try {
      if (!chromeApi || !chromeApi.storage) {
        reject(new Error("存储 API 不可用"));
        return;
      }
      chromeApi.storage.local.set(items, () => {
        const error = chromeApi.runtime.lastError;
        if (error) {
          console.error("storage.set 失败", error.message);
          reject(error);
          return;
        }
        resolve();
      });
    } catch (error) {
      console.error("storage.set 异常", error);
      reject(error);
    }
  });
}
