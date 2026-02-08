const chromeApi = typeof chrome !== "undefined" ? chrome : null;

const DEFAULT_SETTINGS = {
  listSize: 50,
  defaultStatusFilter: "all",
  showSpeed: false,
  undoRemove: true,
  enableNotifications: true,
  scheduledDownload: {
    enabled: false,
    time: "02:00",
    urls: []
  },
  takeover: {
    enabled: false
  }
};

const ALARM_ID = "scheduled-download-default";
const COMPLETE_NOTIFICATION_PREFIX = "download-complete-";
const TAKEOVER_NOTIFICATION_ID = "takeover-open-manager";

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

function normalizeScheduledDownload(value) {
  const scheduledDownload = value && typeof value === "object" ? value : {};
  const urls = Array.isArray(scheduledDownload.urls)
    ? scheduledDownload.urls.map((item) => String(item).trim()).filter(Boolean)
    : [];
  return {
    enabled: Boolean(scheduledDownload.enabled),
    time: typeof scheduledDownload.time === "string" && /^([01]\d|2[0-3]):([0-5]\d)$/.test(scheduledDownload.time)
      ? scheduledDownload.time
      : "02:00",
    urls
  };
}

function normalizeTakeover(value) {
  const takeover = value && typeof value === "object" ? value : {};
  return {
    enabled: Boolean(takeover.enabled)
  };
}

function mergeSettings(storedSettings) {
  const merged = storedSettings ? { ...DEFAULT_SETTINGS, ...storedSettings } : { ...DEFAULT_SETTINGS };
  merged.scheduledDownload = normalizeScheduledDownload(storedSettings && storedSettings.scheduledDownload);
  merged.takeover = normalizeTakeover(storedSettings && storedSettings.takeover);
  return merged;
}

function readSettingsFromStorageArea(areaName) {
  return new Promise((resolve, reject) => {
    try {
      if (!chromeApi || !chromeApi.storage || !chromeApi.storage[areaName]) {
        reject(new Error("Storage API unavailable"));
        return;
      }
      chromeApi.storage[areaName].get(["settings"], (result) => {
        const error = chromeApi.runtime && chromeApi.runtime.lastError;
        if (error) {
          reject(error);
          return;
        }
        resolve(result || {});
      });
    } catch (error) {
      reject(error);
    }
  });
}

async function getSettings() {
  try {
    if (!chromeApi || !chromeApi.storage) {
      return { ...DEFAULT_SETTINGS };
    }

    try {
      const syncResult = await readSettingsFromStorageArea("sync");
      return mergeSettings(syncResult.settings);
    } catch (syncError) {
      console.warn("storage.sync read failed, fallback to local", syncError);
      const localResult = await readSettingsFromStorageArea("local");
      return mergeSettings(localResult.settings);
    }
  } catch (error) {
    console.error("getSettings failed", error);
    return { ...DEFAULT_SETTINGS };
  }
}

function initBadge() {
  try {
    if (!chromeApi || !chromeApi.action) {
      console.error("Action API unavailable");
      return;
    }
    chromeApi.action.setBadgeBackgroundColor({ color: "#007AFF" });
  } catch (error) {
    console.error("initBadge failed", error);
  }
}

async function updateBadge() {
  try {
    if (!chromeApi || !chromeApi.downloads || !chromeApi.action) {
      return;
    }

    const downloads = await new Promise((resolve, reject) => {
      chromeApi.downloads.search({ state: "in_progress" }, (items) => {
        const error = chromeApi.runtime && chromeApi.runtime.lastError;
        if (error) {
          reject(error);
          return;
        }
        resolve(items || []);
      });
    });

    const count = downloads.length;
    await chromeApi.action.setBadgeText({ text: count > 0 ? String(count) : "" });
  } catch (error) {
    console.error("updateBadge failed", error);
  }
}

function formatBytes(bytes) {
  if (!bytes) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  const k = 1024;
  const index = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, index)).toFixed(1))} ${units[index]}`;
}

async function showDownloadCompleteNotification(downloadId) {
  try {
    const settings = await getSettings();
    if (!settings.enableNotifications) {
      return;
    }

    if (!chromeApi || !chromeApi.downloads || !chromeApi.notifications) {
      return;
    }

    const downloads = await new Promise((resolve) => {
      chromeApi.downloads.search({ id: downloadId }, (items) => {
        if (chromeApi.runtime && chromeApi.runtime.lastError) {
          console.error("query download by id failed", chromeApi.runtime.lastError);
          resolve([]);
          return;
        }
        resolve(items || []);
      });
    });

    if (downloads.length === 0) {
      return;
    }

    const item = downloads[0];
    const fileName = item.filename ? item.filename.split(/[/\\]/).pop() : t("labelUnknownFile", undefined, "未知文件");
    const fileSize = formatBytes(item.fileSize || item.totalBytes || 0);
    const iconUrl = chromeApi.runtime.getURL("src/icons/icon128.png");
    const message = t("notificationDownloadCompleteMessage", [fileName, fileSize], `${fileName}\nSize: ${fileSize}`);

    chromeApi.notifications.create(
      `${COMPLETE_NOTIFICATION_PREFIX}${downloadId}`,
      {
        type: "basic",
        iconUrl,
        title: t("notificationDownloadCompleteTitle", undefined, "下载完成"),
        message,
        priority: 1,
        requireInteraction: false
      },
      () => {
        if (chromeApi.runtime && chromeApi.runtime.lastError) {
          console.error("create complete notification failed", chromeApi.runtime.lastError);
        }
      }
    );
  } catch (error) {
    console.error("showDownloadCompleteNotification failed", error);
  }
}

async function showTakeoverNotification() {
  try {
    if (!chromeApi || !chromeApi.notifications) {
      return;
    }
    const iconUrl = chromeApi.runtime.getURL("src/icons/icon128.png");
    chromeApi.notifications.create(
      TAKEOVER_NOTIFICATION_ID,
      {
        type: "basic",
        iconUrl,
        title: t("notificationTakeoverTitle", undefined, "下载已接管"),
        message: t("notificationTakeoverMessage", undefined, "已由扩展接管下载流程，点击打开下载管理页"),
        priority: 0,
        requireInteraction: false
      },
      () => {
        if (chromeApi.runtime && chromeApi.runtime.lastError) {
          console.error("create takeover notification failed", chromeApi.runtime.lastError);
        }
      }
    );
  } catch (error) {
    console.error("showTakeoverNotification failed", error);
  }
}

async function showScheduleNotification(successCount) {
  try {
    if (!chromeApi || !chromeApi.notifications || successCount <= 0) {
      return;
    }
    const iconUrl = chromeApi.runtime.getURL("src/icons/icon128.png");
    chromeApi.notifications.create(
      `schedule-run-${Date.now()}`,
      {
        type: "basic",
        iconUrl,
        title: t("notificationScheduleTitle", undefined, "计划任务已执行"),
        message: t("notificationScheduleMessage", [String(successCount)], `${successCount} downloads started`),
        priority: 0,
        requireInteraction: false
      },
      () => {
        if (chromeApi.runtime && chromeApi.runtime.lastError) {
          console.error("create schedule notification failed", chromeApi.runtime.lastError);
        }
      }
    );
  } catch (error) {
    console.error("showScheduleNotification failed", error);
  }
}

function createContextMenus() {
  try {
    if (!chromeApi || !chromeApi.contextMenus) {
      console.error("ContextMenus API unavailable");
      return;
    }

    chromeApi.contextMenus.removeAll(() => {
      chromeApi.contextMenus.create({
        id: "download-link",
        title: t("contextMenuDownloadLink", undefined, "使用下载管理器下载链接"),
        contexts: ["link"]
      });

      chromeApi.contextMenus.create({
        id: "download-image",
        title: t("contextMenuDownloadImage", undefined, "使用下载管理器下载图片"),
        contexts: ["image"]
      });

      chromeApi.contextMenus.create({
        id: "download-video",
        title: t("contextMenuDownloadVideo", undefined, "使用下载管理器下载视频"),
        contexts: ["video"]
      });

      chromeApi.contextMenus.create({
        id: "download-audio",
        title: t("contextMenuDownloadAudio", undefined, "使用下载管理器下载音频"),
        contexts: ["audio"]
      });
    });
  } catch (error) {
    console.error("createContextMenus failed", error);
  }
}

async function clearDownloadsByState(stateValue) {
  try {
    if (!chromeApi || !chromeApi.downloads) {
      return;
    }

    const items = await new Promise((resolve) => {
      chromeApi.downloads.search({ state: stateValue }, (results) => {
        if (chromeApi.runtime && chromeApi.runtime.lastError) {
          console.error("search downloads failed", chromeApi.runtime.lastError);
          resolve([]);
          return;
        }
        resolve(results || []);
      });
    });

    for (const item of items) {
      await new Promise((resolve) => {
        chromeApi.downloads.erase({ id: item.id }, () => {
          if (chromeApi.runtime && chromeApi.runtime.lastError) {
            console.error("erase download failed", chromeApi.runtime.lastError);
          }
          resolve();
        });
      });
    }
  } catch (error) {
    console.error("clearDownloadsByState failed", error);
  }
}

function computeNextRunTimestamp(timeString) {
  const [hourPart, minutePart] = String(timeString).split(":");
  const hour = Number(hourPart);
  const minute = Number(minutePart);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    return null;
  }

  const now = new Date();
  const target = new Date();
  target.setHours(hour, minute, 0, 0);
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  return target.getTime();
}

function isValidHttpUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch (error) {
    return false;
  }
}

async function syncScheduledAlarm(settings) {
  try {
    if (!chromeApi || !chromeApi.alarms) {
      return;
    }

    const config = normalizeScheduledDownload(settings && settings.scheduledDownload);
    
    // Clear and create in the same callback to minimize race condition window
    await new Promise((resolve) => {
      chromeApi.alarms.clear(ALARM_ID, () => {
        if (config.enabled && config.urls.length > 0) {
          const when = computeNextRunTimestamp(config.time);
          if (when) {
            chromeApi.alarms.create(ALARM_ID, {
              when,
              periodInMinutes: 24 * 60
            });
          }
        }
        resolve();
      });
    });
  } catch (error) {
    console.error("syncScheduledAlarm failed", error);
  }
}

async function executeScheduledDownload() {
  try {
    if (!chromeApi || !chromeApi.downloads) {
      return;
    }

    const settings = await getSettings();
    const schedule = normalizeScheduledDownload(settings.scheduledDownload);
    if (!schedule.enabled || schedule.urls.length === 0) {
      return;
    }

    let successCount = 0;
    for (const url of schedule.urls) {
      if (!isValidHttpUrl(url)) {
        continue;
      }
      await new Promise((resolve) => {
        chromeApi.downloads.download({ url }, () => {
          if (chromeApi.runtime && chromeApi.runtime.lastError) {
            console.error("scheduled download failed", url, chromeApi.runtime.lastError);
          } else {
            successCount += 1;
          }
          resolve();
        });
      });
    }

    await showScheduleNotification(successCount);
  } catch (error) {
    console.error("executeScheduledDownload failed", error);
  }
}

async function applyTakeoverMode(settings) {
  try {
    if (!chromeApi || !chromeApi.downloads) {
      return;
    }
    const takeover = normalizeTakeover(settings && settings.takeover);
    if (typeof chromeApi.downloads.setShelfEnabled !== "function") {
      console.warn("downloads.setShelfEnabled unavailable on this Chrome version");
      return;
    }
    await new Promise((resolve) => {
      chromeApi.downloads.setShelfEnabled(!takeover.enabled, () => {
        const error = chromeApi.runtime && chromeApi.runtime.lastError;
        if (error) {
          console.warn("downloads.setShelfEnabled failed", error.message);
        }
        resolve();
      });
    });
  } catch (error) {
    console.error("applyTakeoverMode failed", error);
  }
}

async function applyRuntimeSettings() {
  try {
    const settings = await getSettings();
    await applyTakeoverMode(settings);
    await syncScheduledAlarm(settings);
  } catch (error) {
    console.error("applyRuntimeSettings failed", error);
  }
}

if (chromeApi && chromeApi.notifications && chromeApi.notifications.onClicked) {
  chromeApi.notifications.onClicked.addListener((notificationId) => {
    try {
      if (notificationId.startsWith(COMPLETE_NOTIFICATION_PREFIX)) {
        const downloadId = Number(notificationId.replace(COMPLETE_NOTIFICATION_PREFIX, ""));
        if (!Number.isNaN(downloadId) && chromeApi.downloads) {
          chromeApi.downloads.open(downloadId);
        }
      } else if (notificationId === TAKEOVER_NOTIFICATION_ID) {
        if (chromeApi.tabs && chromeApi.runtime) {
          chromeApi.tabs.create({ url: chromeApi.runtime.getURL("src/popup/popup.html") });
        }
      }
      chromeApi.notifications.clear(notificationId);
    } catch (error) {
      console.error("notification click handler failed", error);
    }
  });
}

if (chromeApi && chromeApi.contextMenus && chromeApi.contextMenus.onClicked) {
  chromeApi.contextMenus.onClicked.addListener((info) => {
    try {
      let url = null;
      switch (info.menuItemId) {
        case "download-link":
          url = info.linkUrl;
          break;
        case "download-image":
        case "download-video":
        case "download-audio":
          url = info.srcUrl;
          break;
      }

      if (!url || !chromeApi.downloads) {
        return;
      }

      chromeApi.downloads.download({ url }, () => {
        if (chromeApi.runtime && chromeApi.runtime.lastError) {
          console.error("context menu download failed", chromeApi.runtime.lastError);
        }
      });
    } catch (error) {
      console.error("contextMenus.onClicked failed", error);
    }
  });
}

if (chromeApi && chromeApi.commands && chromeApi.commands.onCommand) {
  chromeApi.commands.onCommand.addListener((command) => {
    switch (command) {
      case "clear-completed":
        clearDownloadsByState("complete");
        break;
      case "clear-failed":
        clearDownloadsByState("interrupted");
        break;
    }
  });
}

if (chromeApi && chromeApi.downloads && chromeApi.downloads.onChanged) {
  chromeApi.downloads.onChanged.addListener((delta) => {
    try {
      if (delta.state || delta.paused || delta.canResume) {
        updateBadge();
      }
      if (delta.state && delta.state.current === "complete") {
        showDownloadCompleteNotification(delta.id);
      }
    } catch (error) {
      console.error("downloads.onChanged failed", error);
    }
  });
}

if (chromeApi && chromeApi.downloads && chromeApi.downloads.onCreated) {
  chromeApi.downloads.onCreated.addListener(async (item) => {
    try {
      updateBadge();
      const settings = await getSettings();
      const takeover = normalizeTakeover(settings.takeover);
      if (!takeover.enabled) {
        return;
      }
      const currentExtId = chromeApi.runtime && chromeApi.runtime.id ? chromeApi.runtime.id : "";
      if (item && item.byExtensionId && item.byExtensionId === currentExtId) {
        return;
      }
      showTakeoverNotification();
    } catch (error) {
      console.error("downloads.onCreated handler failed", error);
    }
  });
}

if (chromeApi && chromeApi.downloads && chromeApi.downloads.onErased) {
  chromeApi.downloads.onErased.addListener(() => {
    updateBadge();
  });
}

if (chromeApi && chromeApi.alarms && chromeApi.alarms.onAlarm) {
  chromeApi.alarms.onAlarm.addListener((alarm) => {
    try {
      if (alarm && alarm.name === ALARM_ID) {
        executeScheduledDownload();
      }
    } catch (error) {
      console.error("alarms.onAlarm failed", error);
    }
  });
}

if (chromeApi && chromeApi.storage && chromeApi.storage.onChanged) {
  let debounceTimer = null;
  chromeApi.storage.onChanged.addListener((changes, areaName) => {
    try {
      if (areaName !== "sync" && areaName !== "local") {
        return;
      }
      if (!changes.settings) {
        return;
      }
      // Debounce to avoid duplicate processing when both sync and local trigger
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        applyRuntimeSettings();
        createContextMenus();
      }, 100);
    } catch (error) {
      console.error("storage.onChanged failed", error);
    }
  });
}

if (chromeApi && chromeApi.runtime && chromeApi.runtime.onInstalled) {
  chromeApi.runtime.onInstalled.addListener(() => {
    initBadge();
    updateBadge();
    createContextMenus();
    applyRuntimeSettings();
  });
}

if (chromeApi && chromeApi.runtime && chromeApi.runtime.onStartup) {
  chromeApi.runtime.onStartup.addListener(() => {
    initBadge();
    updateBadge();
    createContextMenus();
    applyRuntimeSettings();
  });
}

initBadge();
updateBadge();
createContextMenus();
applyRuntimeSettings();
