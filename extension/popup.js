/**
 * Nitro DM - Extension Popup Logic
 * Includes Video Sniffing & Feature Toggles
 */

const NDM_SERVER = 'http://localhost:3000';

document.addEventListener('DOMContentLoaded', async () => {
    const serverStatus = document.getElementById('serverStatus');
    const interceptCheck = document.getElementById('interceptCheck');
    const floatingBtnCheck = document.getElementById('floatingBtnCheck');
    const notificationsCheck = document.getElementById('notificationsCheck');
    const videoSniffBox = document.getElementById('videoSniffBox');
    const tabVideoTitle = document.getElementById('tabVideoTitle');
    const qualitiesList = document.getElementById('qualitiesList');
    const popupMsg = document.getElementById('popupMsg');

    // 1. Load preferences
    chrome.storage.local.get(['autoIntercept', 'showFloatingButton', 'showToastNotifications'], (res) => {
        interceptCheck.checked = !!res.autoIntercept;
        floatingBtnCheck.checked = res.showFloatingButton !== false;
        notificationsCheck.checked = res.showToastNotifications !== false;
    });

    interceptCheck.addEventListener('change', (e) => {
        chrome.storage.local.set({ autoIntercept: e.target.checked });
        showMessage(e.target.checked ? 'Auto-interception ON' : 'Auto-interception OFF');
    });

    floatingBtnCheck.addEventListener('change', (e) => {
        chrome.storage.local.set({ showFloatingButton: e.target.checked });
        showMessage(e.target.checked ? 'Video button ON' : 'Video button OFF');
        // Notify tabs
        chrome.tabs.query({}, (tabs) => {
            tabs.forEach(t => chrome.tabs.sendMessage(t.id, { type: 'NDM_TOGGLE_FLOATING_BTN', enabled: e.target.checked }).catch(() => {}));
        });
    });

    notificationsCheck.addEventListener('change', (e) => {
        chrome.storage.local.set({ showToastNotifications: e.target.checked });
        showMessage(e.target.checked ? 'Notifications ON' : 'Notifications OFF');
    });

    function showMessage(msg) {
        popupMsg.textContent = msg;
        popupMsg.style.display = 'block';
        setTimeout(() => popupMsg.style.display = 'none', 2500);
    }

    // 2. Check Server Health
    try {
        const pingRes = await fetch(`${NDM_SERVER}/api/system`, { signal: AbortSignal.timeout(2000) });
        if (pingRes.ok) {
            serverStatus.textContent = 'Active (3000)';
            serverStatus.style.color = 'hsl(140, 37%, 65%)';
        }
    } catch (_) {
        serverStatus.textContent = 'Offline';
        serverStatus.style.color = 'hsl(5, 81%, 73%)';
    }

    // 3. Inspect Active Tab for Video URL
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.url && (tab.url.includes('youtube.com') || tab.url.includes('youtu.be') || tab.url.includes('facebook.com') || tab.url.includes('vimeo.com'))) {
            videoSniffBox.style.display = 'block';
            tabVideoTitle.textContent = tab.title || 'Detecting formats...';

            const res = await fetch(`${NDM_SERVER}/api/video/formats`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: tab.url })
            });

            const data = await res.json();
            if (data.success && data.data) {
                const info = data.data;
                tabVideoTitle.textContent = info.title;
                qualitiesList.innerHTML = info.qualities.map((q, idx) => `
                    <button class="quality-btn" data-idx="${idx}">${q.label.replace(' (MP4)', '')}</button>
                `).join('');

                qualitiesList.querySelectorAll('.quality-btn').forEach(btn => {
                    btn.addEventListener('click', async () => {
                        const sel = info.qualities[parseInt(btn.dataset.idx, 10)];
                        btn.textContent = 'Starting...';
                        btn.disabled = true;

                        await fetch(`${NDM_SERVER}/api/download/add`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                url: tab.url,
                                format: sel.format,
                                isAudio: sel.isAudio,
                                category: sel.isAudio ? 'audio' : 'video',
                                threads: 16,
                                startImmediately: true
                            })
                        });

                        showMessage(`⚡ Downloading ${sel.label}!`);
                        setTimeout(() => btn.textContent = sel.label.replace(' (MP4)', ''), 2000);
                        btn.disabled = false;
                    });
                });
            }
        }
    } catch (err) {
        console.warn('Popup sniff info:', err.message);
    }
});
