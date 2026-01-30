// Background Service Worker for Download Manager
// 监听下载状态变化，更新扩展徽章显示
// 提供系统通知、右键菜单、快捷键命令功能

const chromeApi = typeof chrome !== "undefined" ? chrome : null;

// ============================================
// 默认设置 (与 options.js 保持同步)
// ============================================
const DEFAULT_SETTINGS = {
    listSize: 50,
    defaultStatusFilter: "all",
    showSpeed: false,
    undoRemove: true,
    enableNotifications: true
};

// 获取设置
async function getSettings() {
    try {
        if (!chromeApi || !chromeApi.storage) {
            return DEFAULT_SETTINGS;
        }
        return new Promise((resolve) => {
            chromeApi.storage.local.get(["settings"], (result) => {
                if (chromeApi.runtime.lastError) {
                    console.error("读取设置失败", chromeApi.runtime.lastError);
                    resolve(DEFAULT_SETTINGS);
                    return;
                }
                resolve(result.settings ? { ...DEFAULT_SETTINGS, ...result.settings } : DEFAULT_SETTINGS);
            });
        });
    } catch (error) {
        console.error("获取设置异常", error);
        return DEFAULT_SETTINGS;
    }
}

// ============================================
// 徽章功能
// ============================================
function initBadge() {
    if (!chromeApi || !chromeApi.action) {
        console.error("Action API 不可用");
        return;
    }
    chromeApi.action.setBadgeBackgroundColor({ color: "#007AFF" });
}

async function updateBadge() {
    try {
        if (!chromeApi || !chromeApi.downloads || !chromeApi.action) {
            return;
        }

        const downloads = await new Promise((resolve, reject) => {
            chromeApi.downloads.search({ state: "in_progress" }, (items) => {
                const error = chromeApi.runtime.lastError;
                if (error) {
                    reject(error);
                    return;
                }
                resolve(items || []);
            });
        });

        const count = downloads.length;
        if (count > 0) {
            await chromeApi.action.setBadgeText({ text: String(count) });
        } else {
            await chromeApi.action.setBadgeText({ text: "" });
        }
    } catch (error) {
        console.error("更新徽章失败", error);
    }
}

// ============================================
// 系统通知功能
// ============================================
async function showDownloadCompleteNotification(downloadId) {
    try {
        const settings = await getSettings();
        if (!settings.enableNotifications) {
            return;
        }

        if (!chromeApi || !chromeApi.downloads || !chromeApi.notifications) {
            return;
        }

        // 获取下载项详情
        const downloads = await new Promise((resolve) => {
            chromeApi.downloads.search({ id: downloadId }, (items) => {
                if (chromeApi.runtime.lastError) {
                    console.error("获取下载项失败", chromeApi.runtime.lastError);
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
        const fileName = item.filename ? item.filename.split(/[/\\]/).pop() : "未知文件";
        const fileSize = formatBytes(item.fileSize || item.totalBytes || 0);

        // 创建通知
        chromeApi.notifications.create(`download-complete-${downloadId}`, {
            type: "basic",
            iconUrl: "src/icons/icon128.svg",
            title: "下载完成",
            message: `${fileName}\n大小: ${fileSize}`,
            priority: 1,
            requireInteraction: false
        }, (notificationId) => {
            if (chromeApi.runtime.lastError) {
                console.error("创建通知失败", chromeApi.runtime.lastError);
            }
        });
    } catch (error) {
        console.error("显示下载完成通知失败", error);
    }
}

// 格式化字节数
function formatBytes(bytes) {
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + units[i];
}

// 监听通知点击事件 - 打开文件
if (chromeApi && chromeApi.notifications && chromeApi.notifications.onClicked) {
    chromeApi.notifications.onClicked.addListener((notificationId) => {
        // 解析 notificationId 获取 downloadId
        if (notificationId.startsWith("download-complete-")) {
            const downloadId = parseInt(notificationId.replace("download-complete-", ""), 10);
            if (!isNaN(downloadId)) {
                chromeApi.downloads.open(downloadId);
            }
        }
        // 关闭通知
        chromeApi.notifications.clear(notificationId);
    });
}

// ============================================
// 右键菜单功能
// ============================================
function createContextMenus() {
    if (!chromeApi || !chromeApi.contextMenus) {
        console.error("ContextMenus API 不可用");
        return;
    }

    // 先清除已有菜单项，避免重复创建
    chromeApi.contextMenus.removeAll(() => {
        // 创建主菜单项 - 链接
        chromeApi.contextMenus.create({
            id: "download-link",
            title: "使用下载管理器下载链接",
            contexts: ["link"]
        });

        // 创建主菜单项 - 图片
        chromeApi.contextMenus.create({
            id: "download-image",
            title: "使用下载管理器下载图片",
            contexts: ["image"]
        });

        // 创建主菜单项 - 视频
        chromeApi.contextMenus.create({
            id: "download-video",
            title: "使用下载管理器下载视频",
            contexts: ["video"]
        });

        // 创建主菜单项 - 音频
        chromeApi.contextMenus.create({
            id: "download-audio",
            title: "使用下载管理器下载音频",
            contexts: ["audio"]
        });
    });
}

// 监听右键菜单点击事件
if (chromeApi && chromeApi.contextMenus && chromeApi.contextMenus.onClicked) {
    chromeApi.contextMenus.onClicked.addListener((info, tab) => {
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

        if (url) {
            chromeApi.downloads.download({ url }, (downloadId) => {
                if (chromeApi.runtime.lastError) {
                    console.error("下载失败", chromeApi.runtime.lastError);
                } else {
                    console.log("开始下载:", url, "downloadId:", downloadId);
                }
            });
        }
    });
}

// ============================================
// 快捷键命令功能
// ============================================
async function clearDownloadsByState(stateValue) {
    try {
        if (!chromeApi || !chromeApi.downloads) {
            return;
        }

        const items = await new Promise((resolve) => {
            chromeApi.downloads.search({ state: stateValue }, (results) => {
                if (chromeApi.runtime.lastError) {
                    console.error("搜索下载项失败", chromeApi.runtime.lastError);
                    resolve([]);
                    return;
                }
                resolve(results || []);
            });
        });

        // 批量删除
        for (const item of items) {
            await new Promise((resolve) => {
                chromeApi.downloads.erase({ id: item.id }, () => {
                    if (chromeApi.runtime.lastError) {
                        console.error("删除下载记录失败", chromeApi.runtime.lastError);
                    }
                    resolve();
                });
            });
        }

        console.log(`已清理 ${items.length} 条 ${stateValue} 状态的记录`);
    } catch (error) {
        console.error("批量清理失败", error);
    }
}

// 监听快捷键命令
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

// ============================================
// 下载事件监听
// ============================================
if (chromeApi && chromeApi.downloads && chromeApi.downloads.onChanged) {
    chromeApi.downloads.onChanged.addListener((delta) => {
        // 当下载状态变化时更新徽章
        if (delta.state || delta.paused || delta.canResume) {
            updateBadge();
        }

        // 下载完成时发送通知
        if (delta.state && delta.state.current === "complete") {
            showDownloadCompleteNotification(delta.id);
        }
    });
}

if (chromeApi && chromeApi.downloads && chromeApi.downloads.onCreated) {
    chromeApi.downloads.onCreated.addListener(() => {
        updateBadge();
    });
}

if (chromeApi && chromeApi.downloads && chromeApi.downloads.onErased) {
    chromeApi.downloads.onErased.addListener(() => {
        updateBadge();
    });
}

// ============================================
// Service Worker 初始化
// ============================================
initBadge();
updateBadge();
createContextMenus();
