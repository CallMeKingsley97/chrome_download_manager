const chromeApi = typeof chrome !== "undefined" ? chrome : null;

const DEFAULT_SETTINGS = {
  listSize: 50,
  defaultStatusFilter: "all",
  showSpeed: false,
  undoRemove: true,
  enableNotifications: true
};

const elements = {
  form: document.getElementById("settingsForm"),
  listSize: document.getElementById("listSize"),
  defaultStatusFilter: document.getElementById("defaultStatusFilter"),
  showSpeed: document.getElementById("showSpeed"),
  undoRemove: document.getElementById("undoRemove"),
  enableNotifications: document.getElementById("enableNotifications"),
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

async function loadSettings() {
  try {
    const stored = await chromeStorageGet(["settings"]);
    const settings = stored.settings ? { ...DEFAULT_SETTINGS, ...stored.settings } : DEFAULT_SETTINGS;
    elements.listSize.value = String(settings.listSize);
    elements.defaultStatusFilter.value = settings.defaultStatusFilter;
    elements.showSpeed.checked = Boolean(settings.showSpeed);
    elements.undoRemove.checked = Boolean(settings.undoRemove);
    elements.enableNotifications.checked = Boolean(settings.enableNotifications);
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
    enableNotifications: elements.enableNotifications.checked
  };
  try {
    await chromeStorageSet({ settings });
    elements.status.textContent = "已保存";
    setTimeout(() => {
      elements.status.textContent = "";
    }, 2000);
  } catch (error) {
    console.error("保存设置失败", error);
    elements.status.textContent = "保存失败";
  }
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
