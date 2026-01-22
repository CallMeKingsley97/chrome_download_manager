// Background Service Worker for Download Manager
// 监听下载状态变化，更新扩展徽章显示

const chromeApi = typeof chrome !== "undefined" ? chrome : null;

// 初始化徽章
function initBadge() {
    if (!chromeApi || !chromeApi.action) {
        console.error("Action API 不可用");
        return;
    }
    chromeApi.action.setBadgeBackgroundColor({ color: "#007AFF" });
}

// 更新徽章显示
async function updateBadge() {
    try {
        if (!chromeApi || !chromeApi.downloads || !chromeApi.action) {
            return;
        }

        // 查询所有下载中的任务
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

        // 更新徽章文本
        if (count > 0) {
            await chromeApi.action.setBadgeText({ text: String(count) });
        } else {
            await chromeApi.action.setBadgeText({ text: "" });
        }
    } catch (error) {
        console.error("更新徽章失败", error);
    }
}

// 监听下载事件
if (chromeApi && chromeApi.downloads && chromeApi.downloads.onChanged) {
    chromeApi.downloads.onChanged.addListener((delta) => {
        // 当下载状态变化时更新徽章
        if (delta.state || delta.paused || delta.canResume) {
            updateBadge();
        }
    });
}

// 监听下载创建事件
if (chromeApi && chromeApi.downloads && chromeApi.downloads.onCreated) {
    chromeApi.downloads.onCreated.addListener(() => {
        updateBadge();
    });
}

// 监听下载删除事件
if (chromeApi && chromeApi.downloads && chromeApi.downloads.onErased) {
    chromeApi.downloads.onErased.addListener(() => {
        updateBadge();
    });
}

// Service Worker启动时初始化
initBadge();
updateBadge();
