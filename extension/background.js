/**
 * Nitro DM - Browser Extension Service Worker
 * Intercepts downloads, handles background API proxying, and triggers Windows notifications
 */

const NDM_SERVER = 'http://localhost:3000';
const NDM_API = `${NDM_SERVER}/api/download/add`;
const knownCompletedTasks = new Set();
let isFirstCheck = true;

// Context menu for right-clicking any link or media
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: 'ndm-download-link',
        title: '⚡ Download with Nitro DM (Turbo Multi-Chunk)',
        contexts: ['link', 'image', 'video', 'audio']
    });
});

chrome.contextMenus.onClicked.addListener(async (info) => {
    const targetUrl = info.linkUrl || info.srcUrl;
    if (!targetUrl) return;

    try {
        await fetch(NDM_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: targetUrl,
                threads: 16,
                startImmediately: true
            })
        });
    } catch (err) {
        console.error('Failed to send download to NDM:', err);
    }
});

// Intercept browser downloads
chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
    chrome.storage.local.get(['autoIntercept'], async (res) => {
        if (res.autoIntercept) {
            try {
                await fetch(NDM_API, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        url: downloadItem.url,
                        filename: downloadItem.filename,
                        threads: 16,
                        startImmediately: true
                    })
                });

                chrome.downloads.cancel(downloadItem.id);
            } catch (err) {
                suggest();
            }
        } else {
            suggest();
        }
    });
    return true;
});

// Message Listener from Content Scripts (Bypasses Chrome Mixed Content Security)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'OPEN_FILE' && msg.taskId) {
        fetch(`${NDM_SERVER}/api/download/${msg.taskId}/open-file`, { method: 'POST' }).catch(() => {});
        sendResponse({ success: true });
        return false;
    }

    if (msg.action === 'OPEN_FOLDER') {
        try {
            chrome.downloads.showDefaultFolder();
        } catch (e) {
            console.warn('showDefaultFolder error:', e);
        }
        if (msg.taskId) {
            fetch(`${NDM_SERVER}/api/download/${msg.taskId}/open-folder`, { method: 'POST' }).catch(() => {});
        }
        sendResponse({ success: true });
        return false;
    }

    if (msg.action === 'GET_VIDEO_FORMATS' && msg.url) {
        fetch(`${NDM_SERVER}/api/video/formats`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: msg.url })
        })
        .then(r => r.json())
        .then(data => sendResponse(data))
        .catch(err => sendResponse({ success: false, error: err.message }));
        return true; // Keep message channel open for async response
    }

    if (msg.action === 'ADD_DOWNLOAD' && msg.payload) {
        fetch(`${NDM_SERVER}/api/download/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(msg.payload)
        })
        .then(r => r.json())
        .then(data => sendResponse(data))
        .catch(err => sendResponse({ success: false, error: err.message }));
        return true; // Keep message channel open for async response
    }
});

// Notification Button Click (Windows Native Action Center)
chrome.notifications?.onButtonClicked.addListener((notifId, btnIdx) => {
    if (btnIdx === 0) {
        fetch(`${NDM_SERVER}/api/download/${notifId}/open-file`, { method: 'POST' }).catch(() => {});
    } else if (btnIdx === 1) {
        fetch(`${NDM_SERVER}/api/download/${notifId}/open-folder`, { method: 'POST' }).catch(() => {});
    }
});

// Click notification body to open file
chrome.notifications?.onClicked.addListener((notifId) => {
    fetch(`${NDM_SERVER}/api/download/${notifId}/open-file`, { method: 'POST' }).catch(() => {});
});

// Background Monitor for Completed Tasks -> Broadcast to Active Tab & Windows Native Notification
async function checkDownloadStatus() {
    try {
        const res = await fetch(`${NDM_SERVER}/api/downloads`, { signal: AbortSignal.timeout(3000) });
        if (!res.ok) return;

        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
            if (isFirstCheck) {
                json.data.filter(t => t.status === 'completed').forEach(t => knownCompletedTasks.add(t.id));
                isFirstCheck = false;
                return;
            }

            for (const task of json.data) {
                if (task.status === 'completed' && !knownCompletedTasks.has(task.id)) {
                    knownCompletedTasks.add(task.id);
                    
                    // 1. Broadcast to in-page active tab
                    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                        if (tabs && tabs[0]) {
                            chrome.tabs.sendMessage(tabs[0].id, {
                                type: 'NDM_DOWNLOAD_COMPLETED',
                                task
                            }).catch(() => {});
                        }
                    });

                    // 2. Trigger Windows OS Native Notification in Bottom-Right
                    chrome.storage.local.get(['showToastNotifications'], (res) => {
                        if (res.showToastNotifications !== false) {
                            try {
                                chrome.notifications.create(task.id, {
                                    type: 'basic',
                                    iconUrl: 'icon.png',
                                    title: '⚡ Nitro DM • Download Completed',
                                    message: `${task.filename}\nSaved in Downloads`,
                                    buttons: [
                                        { title: '▶ Open / Play Video' },
                                        { title: '📁 Show in Folder' }
                                    ],
                                    priority: 2,
                                    requireInteraction: false
                                }, () => {});
                            } catch (_) {}
                        }
                    });
                }
            }
        }
    } catch (_) {}
}

setInterval(checkDownloadStatus, 1500);
checkDownloadStatus();
