/**
 * Nitro DM - In-Page Video Sniffer & Floating Download Notification
 * Uses background message proxying to bypass Chrome Mixed Content security
 */

(function () {
    'use strict';

    if (window !== window.top) return;

    let floatingBtnContainer = null;
    let qualityDropdown = null;
    let isFloatingBtnEnabled = true;

    // Load user settings
    chrome.storage.local.get(['showFloatingButton', 'showToastNotifications'], (res) => {
        isFloatingBtnEnabled = res.showFloatingButton !== false;
        checkVideosOnPage();
    });

    // Bridge from localhost:3000 Web UI to Extension Native APIs
    window.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'NDM_OPEN_FOLDER') {
            console.log('[NDM Extension ContentScript] Forwarding OPEN_FOLDER to background service worker');
            chrome.runtime.sendMessage({ action: 'OPEN_FOLDER', taskId: event.data.taskId });
        }
        if (event.data && event.data.type === 'NDM_OPEN_FILE') {
            console.log('[NDM Extension ContentScript] Forwarding OPEN_FILE to background service worker');
            chrome.runtime.sendMessage({ action: 'OPEN_FILE', taskId: event.data.taskId });
        }
    });

    // Listen for toggle updates or download completions from background service worker
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg.type === 'NDM_TOGGLE_FLOATING_BTN') {
            isFloatingBtnEnabled = !!msg.enabled;
            if (floatingBtnContainer) {
                floatingBtnContainer.style.display = isFloatingBtnEnabled ? 'block' : 'none';
            }
            if (isFloatingBtnEnabled) checkVideosOnPage();
        }

        if (msg.type === 'NDM_DOWNLOAD_COMPLETED' && msg.task) {
            chrome.storage.local.get(['showToastNotifications'], (res) => {
                if (res.showToastNotifications !== false) {
                    playCompletionSound();
                    showFloatingToastCard(msg.task);
                }
            });
        }
    });

    function playCompletionSound() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(587.33, ctx.currentTime);
            osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.18, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.45);
        } catch (_) {}
    }

    function createFloatingButton() {
        if (!isFloatingBtnEnabled) return;
        if (document.getElementById('ndm-floating-sniff-btn')) return;

        const container = document.createElement('div');
        container.id = 'ndm-floating-sniff-btn';
        container.className = 'ndm-sniff-container';
        container.innerHTML = `
            <button class="ndm-sniff-btn" id="ndmSniffActionBtn" title="Download this video with Nitro DM">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v14M19 10l-7 7-7-7"/><path d="M2 18v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2"/></svg>
                <span>Download Video</span>
            </button>
            <div class="ndm-dropdown is-hidden" id="ndmQualityDropdown">
                <div class="ndm-dropdown-header">
                    <span id="ndmVideoTitle">Select Quality</span>
                </div>
                <div class="ndm-dropdown-list" id="ndmQualityList">
                    <div class="ndm-loading">Loading formats...</div>
                </div>
            </div>
        `;

        document.body.appendChild(container);
        floatingBtnContainer = container;

        const actionBtn = container.querySelector('#ndmSniffActionBtn');
        qualityDropdown = container.querySelector('#ndmQualityDropdown');

        actionBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleQualityDropdown();
        });

        document.addEventListener('click', (e) => {
            if (!container.contains(e.target)) {
                qualityDropdown.classList.add('is-hidden');
            }
        });
    }

    async function toggleQualityDropdown() {
        const isHidden = qualityDropdown.classList.contains('is-hidden');
        if (!isHidden) {
            qualityDropdown.classList.add('is-hidden');
            return;
        }

        qualityDropdown.classList.remove('is-hidden');
        const qualityList = document.getElementById('ndmQualityList');
        qualityList.innerHTML = '<div class="ndm-loading">Fetching available qualities...</div>';

        const pageUrl = window.location.href;

        // Use background message proxy to bypass Mixed Content
        chrome.runtime.sendMessage({ action: 'GET_VIDEO_FORMATS', url: pageUrl }, (data) => {
            if (chrome.runtime.lastError || !data || !data.success) {
                qualityList.innerHTML = `
                    <div class="ndm-error">
                        <p>⚠️ Nitro DM Server not responding on localhost:3000.</p>
                        <small>Please ensure the Nitro DM server is running.</small>
                    </div>
                `;
                return;
            }

            const info = data.data;
            document.getElementById('ndmVideoTitle').textContent = info.title || 'Choose Quality';
            
            const qualities = info.qualities || [
                { label: '1080p Full HD (MP4)', format: 'bestvideo[height<=1080]+bestaudio/best', isAudio: false },
                { label: '720p HD (MP4)', format: 'bestvideo[height<=720]+bestaudio/best', isAudio: false },
                { label: '480p (MP4)', format: 'bestvideo[height<=480]+bestaudio/best', isAudio: false },
                { label: '360p (MP4)', format: 'bestvideo[height<=360]+bestaudio/best', isAudio: false },
                { label: 'Audio Only (MP3)', format: 'bestaudio/best', isAudio: true }
            ];

            qualityList.innerHTML = qualities.map((q, idx) => `
                <button class="ndm-quality-item" data-idx="${idx}">
                    <span>${q.label}</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                </button>
            `).join('');

            qualityList.querySelectorAll('.ndm-quality-item').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const selected = qualities[parseInt(btn.dataset.idx, 10)];
                    startDownloadFromPage(pageUrl, selected);
                });
            });
        });
    }

    function startDownloadFromPage(url, qualityOption) {
        qualityDropdown.classList.add('is-hidden');
        showFloatingToastCard({
            filename: `Starting: ${qualityOption.label}...`,
            status: 'downloading'
        });

        // Use background message proxy
        chrome.runtime.sendMessage({
            action: 'ADD_DOWNLOAD',
            payload: {
                url,
                format: qualityOption.format,
                isAudio: qualityOption.isAudio,
                category: qualityOption.isAudio ? 'audio' : 'video',
                threads: 16,
                startImmediately: true
            }
        }, (result) => {
            if (result && result.success) {
                showFloatingToastCard({
                    id: result.data.id,
                    filename: result.data.filename,
                    status: 'downloading'
                });
            }
        });
    }

    function showFloatingToastCard(task) {
        const oldToast = document.getElementById('ndm-floating-bottom-toast');
        if (oldToast) oldToast.remove();

        const toast = document.createElement('div');
        toast.id = 'ndm-floating-bottom-toast';
        toast.className = 'ndm-toast-card';

        const isCompleted = task.status === 'completed';

        toast.innerHTML = `
            <div class="ndm-toast-card__header">
                <span>${isCompleted ? '✅ Download Completed' : '⚡ Nitro DM Started'}</span>
                <button class="ndm-toast-card__close" id="ndmToastCloseBtn" title="Dismiss">✕</button>
            </div>
            <div class="ndm-toast-card__body">
                <span class="ndm-toast-card__title" title="${task.filename}">${task.filename}</span>
                <span class="ndm-toast-card__sub">${isCompleted ? 'Saved to Downloads' : 'Accelerating download...'}</span>
            </div>
            ${isCompleted ? `
                <div class="ndm-toast-card__actions">
                    <button class="ndm-btn-primary" id="ndmToastPlayBtn">▶ Play Video</button>
                    <button class="ndm-btn-secondary" id="ndmToastFolderBtn">📁 Show Folder</button>
                </div>
            ` : ''}
        `;

        document.body.appendChild(toast);

        const closeBtn = toast.querySelector('#ndmToastCloseBtn');
        const playBtn = toast.querySelector('#ndmToastPlayBtn');
        const folderBtn = toast.querySelector('#ndmToastFolderBtn');

        const dismiss = () => {
            toast.classList.add('is-hiding');
            setTimeout(() => toast.remove(), 250);
        };

        closeBtn?.addEventListener('click', dismiss);
        
        // Use background message proxying to trigger open-file and open-folder
        playBtn?.addEventListener('click', () => {
            chrome.runtime.sendMessage({ action: 'OPEN_FILE', taskId: task.id });
            dismiss();
        });

        folderBtn?.addEventListener('click', () => {
            chrome.runtime.sendMessage({ action: 'OPEN_FOLDER', taskId: task.id });
            dismiss();
        });

        setTimeout(dismiss, isCompleted ? 14000 : 4000);
    }

    function checkVideosOnPage() {
        if (!isFloatingBtnEnabled) return;
        const hasVideo = document.querySelector('video') || window.location.host.includes('youtube.com') || window.location.host.includes('facebook.com');
        if (hasVideo) {
            createFloatingButton();
        }
    }

    setInterval(checkVideosOnPage, 2000);
    checkVideosOnPage();

})();
