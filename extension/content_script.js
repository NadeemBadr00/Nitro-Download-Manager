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

    function safeSendMessage(message, callback) {
        try {
            if (!chrome.runtime || !chrome.runtime.id) {
                console.warn('[NDM] Extension reloaded. Please refresh this tab to reconnect.');
                return;
            }
            chrome.runtime.sendMessage(message, (res) => {
                if (chrome.runtime.lastError) {
                    // Silently ignore disconnected port warnings on reloaded tabs
                }
                if (typeof callback === 'function') callback(res);
            });
        } catch (_) {}
    }

    // Load user settings safely
    try {
        if (chrome.storage && chrome.storage.local) {
            chrome.storage.local.get(['showFloatingButton', 'showToastNotifications'], (res) => {
                if (res) isFloatingBtnEnabled = res.showFloatingButton !== false;
                checkVideosOnPage();
            });
        }
    } catch (_) {}

    // Bridge from localhost:3000 Web UI to Extension Native APIs
    window.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'NDM_OPEN_FOLDER') {
            safeSendMessage({ action: 'OPEN_FOLDER', taskId: event.data.taskId });
        }
        if (event.data && event.data.type === 'NDM_OPEN_FILE') {
            safeSendMessage({ action: 'OPEN_FILE', taskId: event.data.taskId });
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

    function getBestVideoTargetUrl(videoEl) {
        const currentUrl = window.location.href;
        
        // 1. If currently directly on a video permalink page, use it
        if (
            currentUrl.includes('/reel/') || 
            currentUrl.includes('/watch') || 
            currentUrl.includes('/shorts/') || 
            currentUrl.includes('/video/') || 
            currentUrl.includes('/status/') ||
            (currentUrl.includes('/p/') && !currentUrl.includes('/explore/'))
        ) {
            return currentUrl;
        }

        // 2. Helper to find video link inside an element container
        const findLinkInContainer = (container) => {
            if (!container) return null;
            const link = container.querySelector('a[href*="/reel/"], a[href*="/watch"], a[href*="/videos/"], a[href*="fb.watch"], a[href*="/shorts/"], a[href*="/video/"], a[href*="/status/"], a[href*="/p/"], a[href*="/feed/update/urn:li:activity:"], a[href*="/posts/"]');
            if (link && link.href) {
                // Strip tracking params for clean yt-dlp handling
                try {
                    const u = new URL(link.href);
                    if (u.hostname.includes('facebook.com') && u.pathname.includes('/reel/')) {
                        const match = u.pathname.match(/\/reel\/(\d+)/);
                        if (match) return `https://www.facebook.com/reel/${match[1]}`;
                    }
                    if (u.hostname.includes('linkedin.com') && u.pathname.includes('/feed/update/urn:li:activity:')) {
                        return u.origin + u.pathname;
                    }
                    return link.href;
                } catch (_) {
                    return link.href;
                }
            }

            // LinkedIn data-urn attribute on post card
            const urnEl = container.closest('[data-urn*="urn:li:activity:"], [data-id*="urn:li:activity:"]');
            if (urnEl) {
                const urn = urnEl.getAttribute('data-urn') || urnEl.getAttribute('data-id');
                if (urn) return `https://www.linkedin.com/feed/update/${urn}/`;
            }

            return null;
        };

        // 3. If a specific video element is passed, inspect its ancestors
        if (videoEl) {
            let curr = videoEl.parentElement;
            while (curr && curr !== document.body) {
                const found = findLinkInContainer(curr);
                if (found) return found;
                curr = curr.parentElement;
            }
        }

        // 4. Scan all playing or visible videos on the feed
        const allVideos = Array.from(document.querySelectorAll('video'));
        for (const v of allVideos) {
            const rect = v.getBoundingClientRect();
            const isVisible = rect.top >= 0 && rect.bottom <= (window.innerHeight || document.documentElement.clientHeight);
            const isPlaying = !v.paused;

            if (isPlaying || isVisible) {
                let curr = v.parentElement;
                while (curr && curr !== document.body) {
                    const found = findLinkInContainer(curr);
                    if (found) return found;
                    curr = curr.parentElement;
                }
            }
        }

        // 5. Look for any reel/watch link in the main post area
        const postLink = document.querySelector('[role="article"] a[href*="/reel/"], [role="article"] a[href*="/watch"], div[data-pagelet*="FeedUnit"] a[href*="/reel/"]');
        if (postLink && postLink.href) return postLink.href;

        return currentUrl;
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

        // Extract the exact video permalink (e.g. https://www.facebook.com/reel/919737374511893)
        const activeVideoEl = document.querySelector('video:hover') || document.querySelector('video');
        const targetVideoUrl = getBestVideoTargetUrl(activeVideoEl);
        console.log('[NDM Sniffer] Probing video URL:', targetVideoUrl);

        // Use background message proxy to bypass Mixed Content
        safeSendMessage({ action: 'GET_VIDEO_FORMATS', url: targetVideoUrl }, (data) => {
            if (!data || !data.success) {
                qualityList.innerHTML = `
                    <div class="ndm-error">
                        <p>⚠️ Could not fetch video stream from: <br><small style="word-break: break-all;">${targetVideoUrl}</small></p>
                        <button class="ndm-btn-primary" style="margin-top: 8px; width: 100%;" id="ndmFallbackDownloadBtn">Download Best Quality</button>
                    </div>
                `;
                document.getElementById('ndmFallbackDownloadBtn')?.addEventListener('click', () => {
                    startDownloadFromPage(targetVideoUrl, { label: 'Best Available (MP4)', format: 'bestvideo+bestaudio/best', isAudio: false });
                });
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
                    startDownloadFromPage(targetVideoUrl, selected);
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
        safeSendMessage({
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
            safeSendMessage({ action: 'OPEN_FILE', taskId: task.id });
            dismiss();
        });

        folderBtn?.addEventListener('click', () => {
            safeSendMessage({ action: 'OPEN_FOLDER', taskId: task.id });
            dismiss();
        });

        setTimeout(dismiss, isCompleted ? 14000 : 4000);
    }

    function checkVideosOnPage() {
        if (!isFloatingBtnEnabled) return;
        const host = window.location.host.toLowerCase();
        const hasVideo = document.querySelector('video') || 
            host.includes('youtube.com') || 
            host.includes('facebook.com') || 
            host.includes('linkedin.com') || 
            host.includes('tiktok.com') || 
            host.includes('instagram.com') || 
            host.includes('twitter.com') || 
            host.includes('x.com') || 
            host.includes('reddit.com');

        if (hasVideo) {
            createFloatingButton();
        }
    }

    setInterval(checkVideosOnPage, 2000);
    checkVideosOnPage();

})();
