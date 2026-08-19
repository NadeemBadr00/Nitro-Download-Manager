/**
 * Nitro Download Manager (NDM) - Frontend Client Logic
 * Enhanced with Bottom-Right Floating Download Notifications, Chime, and Open in Folder
 */

(function () {
    'use strict';

    const state = {
        tasks: [],
        currentFilter: 'all',
        currentCategory: null,
        searchQuery: '',
        selectedTaskId: null,
        totalSpeed: 0,
        activeCount: 0,
        theme: localStorage.getItem('ndm-theme') || 'dark',
        sidebarCollapsed: localStorage.getItem('ndm-sidebar') === 'true',
        lastProbedIsVideo: false,
        notifiedTaskIds: new Set()
    };

    const elements = {
        html: document.documentElement,
        shell: document.getElementById('consoleShell'),
        sidebar: document.getElementById('sidebar'),
        collapseBtn: document.getElementById('collapseBtn'),
        themeToggleBtn: document.getElementById('themeToggleBtn'),
        breadcrumbBar: document.getElementById('breadcrumbBar'),
        workspaceHeader: document.getElementById('workspaceHeader'),
        currentViewName: document.getElementById('currentViewName'),
        headerSubtitle: document.getElementById('headerSubtitle'),
        globalSpeedText: document.getElementById('globalSpeedText'),
        statSpeed: document.getElementById('statSpeed'),
        statThreads: document.getElementById('statThreads'),
        statActiveTasks: document.getElementById('statActiveTasks'),
        statCompleted: document.getElementById('statCompleted'),
        tableBody: document.getElementById('downloadsTableBody'),
        emptyState: document.getElementById('emptyState'),
        downloadSearch: document.getElementById('downloadSearch'),
        sidebarSearch: document.getElementById('sidebarSearch'),
        statusTabs: document.getElementById('statusTabs'),
        navLinks: document.querySelectorAll('.sidebar-nav .nav-link'),
        countAll: document.getElementById('countAll'),
        countActive: document.getElementById('countActive'),
        countCompleted: document.getElementById('countCompleted'),
        countPaused: document.getElementById('countPaused'),
        addDownloadBtn: document.getElementById('addDownloadBtn'),
        emptyAddBtn: document.getElementById('emptyAddBtn'),
        resumeAllBtn: document.getElementById('resumeAllBtn'),
        pauseAllBtn: document.getElementById('pauseAllBtn'),
        clearCompletedBtn: document.getElementById('clearCompletedBtn'),
        extensionInfoBtn: document.getElementById('extensionInfoBtn'),
        sniffClipboardBtn: document.getElementById('sniffClipboardBtn'),
        toastContainer: document.getElementById('toastContainer'),
        // Modals
        addModal: document.getElementById('addModal'),
        addModalBackdrop: document.getElementById('addModalBackdrop'),
        closeAddModalBtn: document.getElementById('closeAddModalBtn'),
        cancelAddBtn: document.getElementById('cancelAddBtn'),
        addDownloadForm: document.getElementById('addDownloadForm'),
        downloadUrlInput: document.getElementById('downloadUrlInput'),
        probeBtn: document.getElementById('probeBtn'),
        probeResultBanner: document.getElementById('probeResultBanner'),
        probeSize: document.getElementById('probeSize'),
        probeSizeRow: document.getElementById('probeSizeRow'),
        probeRanges: document.getElementById('probeRanges'),
        probeCat: document.getElementById('probeCat'),
        videoQualityGroup: document.getElementById('videoQualityGroup'),
        videoQualitySelect: document.getElementById('videoQualitySelect'),
        filenameInput: document.getElementById('filenameInput'),
        threadSelect: document.getElementById('threadSelect'),
        categorySelect: document.getElementById('categorySelect'),
        startImmediatelyCheck: document.getElementById('startImmediatelyCheck'),
        // Details Modal
        detailsModal: document.getElementById('detailsModal'),
        detailsModalBackdrop: document.getElementById('detailsModalBackdrop'),
        closeDetailsBtn: document.getElementById('closeDetailsBtn'),
        closeDetailsFooterBtn: document.getElementById('closeDetailsFooterBtn'),
        detailsFileName: document.getElementById('detailsFileName'),
        detailsStatusBadge: document.getElementById('detailsStatusBadge'),
        detailsUrlText: document.getElementById('detailsUrlText'),
        detailsSavePath: document.getElementById('detailsSavePath'),
        detailsFolderBtn: document.getElementById('detailsFolderBtn'),
        detailsPlayBtn: document.getElementById('detailsPlayBtn'),
        detailsTotalSize: document.getElementById('detailsTotalSize'),
        detailsDownloaded: document.getElementById('detailsDownloaded'),
        detailsSpeed: document.getElementById('detailsSpeed'),
        detailsThreads: document.getElementById('detailsThreads'),
        chunkGridContainer: document.getElementById('chunkGridContainer'),
        // Extension Modal
        extensionModal: document.getElementById('extensionModal'),
        extensionModalBackdrop: document.getElementById('extensionModalBackdrop'),
        closeExtensionBtn: document.getElementById('closeExtensionBtn'),
        closeExtensionFooterBtn: document.getElementById('closeExtensionFooterBtn')
    };

    function playCompletionChime() {
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

    function showDownloadCompleteToast(task) {
        let container = document.getElementById('toastContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toastContainer';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = 'download-toast';
        toast.innerHTML = `
            <div class="download-toast__header">
                <div class="download-toast__status">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                    <span>Download Completed</span>
                </div>
                <button class="download-toast__close" title="Dismiss">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>
            <div class="download-toast__body">
                <div class="download-toast__icon">
                    ${getCategoryIcon(task.category)}
                </div>
                <div class="download-toast__meta">
                    <span class="download-toast__title" title="${task.filename}">${task.filename}</span>
                    <span class="download-toast__info">${formatBytes(task.downloadedBytes || task.totalBytes)} • ${task.category ? task.category.toUpperCase() : 'FILE'}</span>
                </div>
            </div>
            <div class="download-toast__actions">
                <button class="btn btn-primary btn-sm" id="toastPlayBtn">
                    <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    Play Video
                </button>
                <button class="btn btn-secondary btn-sm" id="toastFolderBtn">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                    Show Folder
                </button>
            </div>
            <div class="download-toast__progress"></div>
        `;

        container.appendChild(toast);

        const closeBtn = toast.querySelector('.download-toast__close');
        const playBtn = toast.querySelector('#toastPlayBtn');
        const folderBtn = toast.querySelector('#toastFolderBtn');

        const dismiss = () => {
            toast.classList.add('is-hiding');
            setTimeout(() => toast.remove(), 250);
        };

        closeBtn.addEventListener('click', dismiss);
        playBtn.addEventListener('click', () => {
            window.ndmOpenFile(task.id);
            dismiss();
        });
        folderBtn.addEventListener('click', () => {
            window.ndmOpenFolder(task.id);
            dismiss();
        });

        // Auto dismiss after 8s
        const timer = setTimeout(dismiss, 8000);
        toast.addEventListener('mouseenter', () => clearTimeout(timer));
    }

    window.ndmTestNotification = function (filename = 'Demo Video.mp4') {
        playCompletionChime();
        showDownloadCompleteToast({
            id: 'test',
            filename,
            category: 'video',
            downloadedBytes: 18874368,
            totalBytes: 18874368,
            status: 'completed'
        });
    };

    function formatBytes(bytes, decimals = 2) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    function formatSpeed(bytesPerSec) {
        if (!bytesPerSec || bytesPerSec === 0) return '0.0 KB/s';
        return formatBytes(bytesPerSec) + '/s';
    }

    function formatEta(seconds) {
        if (!seconds || seconds <= 0 || !isFinite(seconds)) return '--';
        if (seconds < 60) return `${seconds}s`;
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        if (mins < 60) return `${mins}m ${secs}s`;
        const hrs = Math.floor(mins / 60);
        return `${hrs}h ${mins % 60}m`;
    }

    function getCategoryIcon(cat) {
        switch (cat) {
            case 'video':
                return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/></svg>`;
            case 'compressed':
                return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>`;
            case 'programs':
                return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/></svg>`;
            case 'audio':
                return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
            case 'documents':
            default:
                return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
        }
    }

    async function apiRequest(endpoint, method = 'GET', body = null) {
        const options = { method, headers: {} };
        if (body) {
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(body);
        }
        try {
            const res = await fetch(endpoint, options);
            return await res.json();
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    const taskStatusMap = new Map();
    let isSseInitialized = false;

    function initEventStream() {
        const evtSource = new EventSource('/api/stats/stream');
        evtSource.onmessage = function (event) {
            try {
                const data = JSON.parse(event.data);
                if (data.tasks) {
                    if (isSseInitialized) {
                        data.tasks.forEach(t => {
                            const prevStatus = taskStatusMap.get(t.id);
                            if (prevStatus && prevStatus !== 'completed' && t.status === 'completed') {
                                console.log('[NDM SSE] Download completed! Showing toast for:', t.filename);
                                playCompletionChime();
                                showDownloadCompleteToast(t);
                            }
                        });
                    } else {
                        console.log('[NDM SSE] Initial load - seeding taskStatusMap with', data.tasks.length, 'tasks');
                        isSseInitialized = true;
                    }

                    data.tasks.forEach(t => taskStatusMap.set(t.id, t.status));
                    state.tasks = data.tasks;
                }
                state.totalSpeed = data.totalSpeed || 0;
                state.activeCount = data.activeCount || 0;
                updateStatsUI();
                renderTable();
                updateDetailsModalIfOpen();
            } catch (err) {
                console.error('[NDM SSE] Parse error:', err);
            }
        };
        evtSource.onerror = function () {
            console.warn('[NDM SSE] Connection lost. Reconnecting in 3s...');
            evtSource.close();
            setTimeout(() => {
                fetchTasks();
                initEventStream();
            }, 3000);
        };
    }

    async function fetchTasks() {
        const res = await apiRequest('/api/downloads');
        if (res.success && res.data) {
            state.tasks = res.data;
            state.tasks.forEach(t => taskStatusMap.set(t.id, t.status));
            updateStatsUI();
            renderTable();
        }
    }

    function updateStatsUI() {
        const total = state.tasks.length;
        const active = state.tasks.filter(t => t.status === 'downloading').length;
        const completed = state.tasks.filter(t => t.status === 'completed').length;
        const paused = state.tasks.filter(t => t.status === 'paused' || t.status === 'queued').length;

        elements.globalSpeedText.textContent = formatSpeed(state.totalSpeed);
        elements.headerSubtitle.textContent = `${active} active tasks`;
        elements.statSpeed.textContent = formatSpeed(state.totalSpeed);
        
        let totalThreads = 0;
        state.tasks.filter(t => t.status === 'downloading').forEach(t => totalThreads += (t.threads || 1));
        elements.statThreads.textContent = `${totalThreads} Chunks`;
        elements.statActiveTasks.textContent = `${active} Tasks downloading`;
        elements.statCompleted.textContent = `${completed} / ${total}`;

        elements.countAll.textContent = total;
        elements.countActive.textContent = active;
        elements.countCompleted.textContent = completed;
        elements.countPaused.textContent = paused;
    }

    function renderTable() {
        let filtered = state.tasks.filter(task => {
            if (state.currentFilter === 'downloading' && task.status !== 'downloading') return false;
            if (state.currentFilter === 'completed' && task.status !== 'completed') return false;
            if (state.currentFilter === 'paused' && (task.status !== 'paused' && task.status !== 'queued')) return false;
            if (state.currentCategory && task.category !== state.currentCategory) return false;

            if (state.searchQuery) {
                const q = state.searchQuery.toLowerCase();
                const matchName = task.filename.toLowerCase().includes(q);
                const matchUrl = task.url.toLowerCase().includes(q);
                if (!matchName && !matchUrl) return false;
            }
            return true;
        });

        if (filtered.length === 0) {
            elements.tableBody.innerHTML = '';
            elements.emptyState.style.display = 'flex';
            return;
        }

        elements.emptyState.style.display = 'none';

        const rowsHtml = filtered.map(task => {
            let percent = 0;
            if (task.totalBytes > 0) {
                percent = Math.min(100, Math.round((task.downloadedBytes / task.totalBytes) * 100));
            } else if (task.status === 'completed') {
                percent = 100;
            }

            let chunkPillsHtml = '';
            if (task.chunks && task.chunks.length > 1) {
                chunkPillsHtml = `<div class="chunk-bar-mini">` + task.chunks.map(c => {
                    const cPercent = c.total > 0 ? Math.min(100, Math.round((c.downloaded / c.total) * 100)) : 0;
                    const isDone = c.status === 'completed' || cPercent >= 100;
                    return `<div class="chunk-pill" title="Chunk #${c.id + 1}: ${cPercent}%"><div class="chunk-pill-fill ${isDone ? 'done' : ''}" style="width: ${cPercent}%"></div></div>`;
                }).join('') + `</div>`;
            } else if (task.isVideoStream) {
                chunkPillsHtml = `<div class="chunk-bar-mini"><div class="chunk-pill"><div class="chunk-pill-fill ${task.status === 'completed' ? 'done' : ''}" style="width: ${percent}%"></div></div></div>`;
            }

            let badgeClass = 'status-badge--paused';
            if (task.status === 'downloading') badgeClass = 'status-badge--downloading';
            if (task.status === 'completed') badgeClass = 'status-badge--completed';
            if (task.status === 'error') badgeClass = 'status-badge--error';

            return `
                <tr data-task-id="${task.id}">
                    <td>
                        <div class="file-cell">
                            <div class="file-icon" onclick="window.ndmOpenDetails('${task.id}')" title="Details">
                                ${getCategoryIcon(task.category)}
                            </div>
                            <div class="file-meta">
                                <span class="file-name" title="${task.filename}" onclick="window.ndmOpenDetails('${task.id}')">${task.filename}</span>
                                <span class="file-category">${task.category} • ${task.threads || 1} threads ${task.isVideoStream ? '(Turbo Stream)' : ''}</span>
                            </div>
                        </div>
                    </td>
                    <td>
                        <strong>${formatBytes(task.downloadedBytes)}</strong> ${task.totalBytes > 0 ? `/ ${formatBytes(task.totalBytes)}` : ''}
                    </td>
                    <td>
                        <div class="progress-cell">
                            <div class="progress-info">
                                <span>${percent}%</span>
                                <span>${task.status === 'downloading' ? 'Active' : task.status}</span>
                            </div>
                            <div class="progress-bar-container">
                                <div class="progress-segment ${task.status === 'completed' ? 'progress-segment--completed' : ''}" style="width: ${percent}%"></div>
                            </div>
                            ${chunkPillsHtml}
                        </div>
                    </td>
                    <td>
                        <strong>${task.status === 'downloading' ? formatSpeed(task.speed) : '--'}</strong>
                    </td>
                    <td>
                        ${task.status === 'downloading' ? formatEta(task.eta) : '--'}
                    </td>
                    <td>
                        <span class="status-badge ${badgeClass}">${task.status}</span>
                    </td>
                    <td class="text-right">
                        <div class="row-actions">
                            ${task.status === 'completed' ? `
                                <button class="icon-button" onclick="window.ndmOpenFile('${task.id}')" title="▶ Play / Open File" style="color: hsl(218, 89%, 73%);">
                                    <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                                </button>
                                <button class="icon-button" onclick="window.ndmOpenFolder('${task.id}')" title="📁 Show in Windows Explorer Folder">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                                </button>
                            ` : ''}

                            ${task.status === 'downloading' ? `
                                <button class="icon-button" onclick="window.ndmPause('${task.id}')" title="Pause Download">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
                                </button>
                            ` : (task.status !== 'completed' ? `
                                <button class="icon-button" onclick="window.ndmResume('${task.id}')" title="Resume Download">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                                </button>
                            ` : '')}

                            <button class="icon-button" onclick="window.ndmOpenDetails('${task.id}')" title="Details">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                            </button>
                            <button class="icon-button" onclick="window.ndmDelete('${task.id}')" title="Remove Task">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        elements.tableBody.innerHTML = rowsHtml;
    }

    function showActionToast(message, icon = '📁') {
        let container = document.getElementById('toastContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toastContainer';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = 'download-toast';
        toast.style.padding = '12px 16px';
        toast.style.borderLeft = '4px solid hsl(218, 89%, 73%)';
        toast.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px; font-size: 0.9rem; font-weight: 600; color: hsl(0, 0%, 95%);">
                <span style="font-size: 1.2rem;">${icon}</span>
                <span>${message}</span>
            </div>
        `;
        container.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('is-hiding');
            setTimeout(() => toast.remove(), 250);
        }, 3000);
    }

    window.ndmOpenFolder = async function (taskId) {
        console.log('%c[NDM Button Click] 📁 Show in Folder clicked for task: ' + taskId, 'background: #2563eb; color: #fff; font-size: 13px; font-weight: bold; padding: 4px 8px; border-radius: 4px;');
        const task = state.tasks.find(t => t.id === taskId);
        const fileName = task ? task.filename : 'File';
        showActionToast(`Opening folder for: ${fileName}`, '📁');

        const result = await apiRequest(`/api/download/${taskId}/open-folder`, 'POST');
        console.log('%c[NDM Server Response] 📁 Open Folder Result:', 'color: #3b82f6; font-weight: bold;', result);
        if (!result.success) {
            console.error('[NDM Error] Open folder failed:', result.error);
            showActionToast(`Failed to open folder: ${result.error || 'Unknown error'}`, '❌');
        }
    };

    window.ndmOpenFile = async function (taskId) {
        console.log('%c[NDM Button Click] ▶ Play File clicked for task: ' + taskId, 'background: #10b981; color: #fff; font-size: 13px; font-weight: bold; padding: 4px 8px; border-radius: 4px;');
        const task = state.tasks.find(t => t.id === taskId);
        const fileName = task ? task.filename : 'Video';
        showActionToast(`Launching player for: ${fileName}`, '▶');

        const result = await apiRequest(`/api/download/${taskId}/open-file`, 'POST');
        console.log('%c[NDM Server Response] ▶ Play File Result:', 'color: #10b981; font-weight: bold;', result);
        if (!result.success) {
            console.error('[NDM Error] Play file failed:', result.error);
            showActionToast(`Failed to play file: ${result.error || 'Unknown error'}`, '❌');
        }
    };

    window.ndmOpenDetails = function (taskId) {
        state.selectedTaskId = taskId;
        const task = state.tasks.find(t => t.id === taskId);
        if (!task) return;

        elements.detailsFileName.textContent = task.filename;
        elements.detailsUrlText.textContent = task.url;
        elements.detailsSavePath.textContent = task.savePath || 'C:\\Users\\DELL\\Downloads\\' + task.filename;
        elements.detailsStatusBadge.textContent = task.status;
        elements.detailsStatusBadge.className = `status-badge status-badge--${task.status}`;

        elements.detailsTotalSize.textContent = task.totalBytes > 0 ? formatBytes(task.totalBytes) : 'Dynamic Stream';
        elements.detailsDownloaded.textContent = task.totalBytes > 0 ? formatBytes(task.downloadedBytes) : `${task.downloadedBytes || 100}%`;
        elements.detailsSpeed.textContent = formatSpeed(task.speed);
        elements.detailsThreads.textContent = `${task.threads || 1} Concurrent Streams`;

        if (task.status === 'completed') {
            elements.detailsPlayBtn.style.display = 'inline-flex';
            elements.detailsFolderBtn.style.display = 'inline-flex';
        } else {
            elements.detailsPlayBtn.style.display = 'none';
            elements.detailsFolderBtn.style.display = 'none';
        }

        renderChunkCards(task);
        elements.detailsModal.classList.add('is-open');
    };

    function updateDetailsModalIfOpen() {
        if (!elements.detailsModal.classList.contains('is-open') || !state.selectedTaskId) return;
        const task = state.tasks.find(t => t.id === state.selectedTaskId);
        if (!task) return;

        elements.detailsDownloaded.textContent = task.totalBytes > 0 ? formatBytes(task.downloadedBytes) : `${task.downloadedBytes}%`;
        elements.detailsSpeed.textContent = formatSpeed(task.speed);
        elements.detailsTotalSize.textContent = task.totalBytes > 0 ? formatBytes(task.totalBytes) : 'Dynamic Stream';
        elements.detailsStatusBadge.textContent = task.status;
        elements.detailsStatusBadge.className = `status-badge status-badge--${task.status}`;
        renderChunkCards(task);
    }

    function renderChunkCards(task) {
        if (!task.chunks || task.chunks.length === 0 || task.isVideoStream) {
            const isDone = task.status === 'completed';
            elements.chunkGridContainer.innerHTML = `
                <div style="grid-column: 1/-1; background: hsl(0, 0%, 12%); border: 1px solid hsl(0, 0%, 20%); border-radius: 8px; padding: 16px; display: flex; align-items: center; justify-content: space-between;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="width: 36px; height: 36px; border-radius: 8px; background: hsl(218, 89%, 73%, 0.15); display: flex; align-items: center; justify-content: center; color: hsl(218, 89%, 73%);">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 20px; height: 20px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                        </div>
                        <div>
                            <strong style="display: block; color: hsl(0, 0%, 95%); font-size: 0.88rem;">16-Chunk Turbo Video Stream Extractor</strong>
                            <span style="font-size: 0.75rem; color: var(--console-text-muted);">Status: ${task.status.toUpperCase()} • Multi-fragment acceleration active</span>
                        </div>
                    </div>
                    <div>
                        <span class="status-badge status-badge--${task.status}">${isDone ? 'Merged & Ready' : task.status}</span>
                    </div>
                </div>
            `;
            return;
        }

        const cardsHtml = task.chunks.map(c => {
            const percent = c.total > 0 ? Math.min(100, Math.round((c.downloaded / c.total) * 100)) : 0;
            const isDone = c.status === 'completed' || percent >= 100;
            return `
                <div class="chunk-card">
                    <div class="chunk-card__header">
                        <span>Chunk #${c.id + 1}</span>
                        <strong style="color: ${isDone ? 'var(--console-success)' : 'var(--console-primary)'}">${percent}%</strong>
                    </div>
                    <div class="chunk-card__bar">
                        <div class="chunk-card__fill ${isDone ? 'done' : ''}" style="width: ${percent}%"></div>
                    </div>
                    <div style="font-size: 0.68rem; color: var(--console-text-muted); font-family: var(--font-mono);">
                        ${formatBytes(c.downloaded)} / ${formatBytes(c.total)}
                    </div>
                </div>
            `;
        }).join('');

        elements.chunkGridContainer.innerHTML = cardsHtml;
    }

    window.ndmPause = async function (id) {
        await apiRequest(`/api/download/${id}/pause`, 'POST');
    };

    window.ndmResume = async function (id) {
        await apiRequest(`/api/download/${id}/resume`, 'POST');
    };

    window.ndmDelete = async function (id) {
        if (confirm('Delete this download task?')) {
            await apiRequest(`/api/download/${id}/delete`, 'POST', { deleteFile: false });
        }
    };

    function setupEventListeners() {
        elements.themeToggleBtn.addEventListener('click', () => {
            state.theme = state.theme === 'dark' ? 'light' : 'dark';
            elements.html.setAttribute('data-theme', state.theme);
            localStorage.setItem('ndm-theme', state.theme);
        });
        elements.html.setAttribute('data-theme', state.theme);

        if (state.sidebarCollapsed) elements.shell.classList.add('is-collapsed');
        elements.collapseBtn.addEventListener('click', () => {
            state.sidebarCollapsed = !state.sidebarCollapsed;
            elements.shell.classList.toggle('is-collapsed', state.sidebarCollapsed);
            localStorage.setItem('ndm-sidebar', state.sidebarCollapsed);
        });

        window.addEventListener('scroll', () => {
            if (window.scrollY > 40) {
                elements.breadcrumbBar.classList.add('is-hidden');
                elements.workspaceHeader.classList.add('is-shrunk');
            } else {
                elements.breadcrumbBar.classList.remove('is-hidden');
                elements.workspaceHeader.classList.remove('is-shrunk');
            }
        });

        elements.statusTabs.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => {
                elements.statusTabs.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                state.currentFilter = tab.dataset.filter;
                state.currentCategory = null;
                elements.currentViewName.textContent = tab.textContent;
                renderTable();
            });
        });

        elements.navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                elements.navLinks.forEach(l => l.classList.remove('active'));
                link.classList.add('active');

                if (link.dataset.filter) {
                    state.currentFilter = link.dataset.filter;
                    state.currentCategory = null;
                    elements.statusTabs.querySelectorAll('.tab').forEach(t => {
                        t.classList.toggle('active', t.dataset.filter === state.currentFilter);
                    });
                } else if (link.dataset.category) {
                    state.currentCategory = link.dataset.category;
                    state.currentFilter = 'all';
                }

                elements.currentViewName.textContent = link.querySelector('span').textContent;
                renderTable();
            });
        });

        elements.downloadSearch.addEventListener('input', (e) => {
            state.searchQuery = e.target.value;
            renderTable();
        });

        elements.sidebarSearch.addEventListener('input', (e) => {
            state.searchQuery = e.target.value;
            elements.downloadSearch.value = e.target.value;
            renderTable();
        });

        elements.resumeAllBtn.addEventListener('click', () => apiRequest('/api/downloads/resume-all', 'POST'));
        elements.pauseAllBtn.addEventListener('click', () => apiRequest('/api/downloads/pause-all', 'POST'));
        elements.clearCompletedBtn.addEventListener('click', () => apiRequest('/api/downloads/clear-completed', 'POST'));

        const openAddModal = () => {
            elements.addModal.classList.add('is-open');
            elements.downloadUrlInput.focus();
        };
        const closeAddModal = () => {
            elements.addModal.classList.remove('is-open');
            elements.addDownloadForm.reset();
            elements.probeResultBanner.classList.add('is-hidden');
            elements.videoQualityGroup.style.display = 'none';
            state.lastProbedIsVideo = false;
        };

        elements.addDownloadBtn.addEventListener('click', openAddModal);
        elements.emptyAddBtn.addEventListener('click', openAddModal);
        elements.closeAddModalBtn.addEventListener('click', closeAddModal);
        elements.cancelAddBtn.addEventListener('click', closeAddModal);
        elements.addModalBackdrop.addEventListener('click', closeAddModal);

        const closeDetails = () => elements.detailsModal.classList.remove('is-open');
        elements.closeDetailsBtn.addEventListener('click', closeDetails);
        elements.closeDetailsFooterBtn.addEventListener('click', closeDetails);
        elements.detailsModalBackdrop.addEventListener('click', closeDetails);

        // Details Modal Actions
        elements.detailsFolderBtn.addEventListener('click', () => {
            if (state.selectedTaskId) window.ndmOpenFolder(state.selectedTaskId);
        });
        elements.detailsPlayBtn.addEventListener('click', () => {
            if (state.selectedTaskId) window.ndmOpenFile(state.selectedTaskId);
        });

        elements.extensionInfoBtn.addEventListener('click', () => elements.extensionModal.classList.add('is-open'));
        const closeExt = () => elements.extensionModal.classList.remove('is-open');
        elements.closeExtensionBtn.addEventListener('click', closeExt);
        elements.closeExtensionFooterBtn.addEventListener('click', closeExt);
        elements.extensionModalBackdrop.addEventListener('click', closeExt);

        elements.probeBtn.addEventListener('click', async () => {
            const url = elements.downloadUrlInput.value.trim();
            if (!url) return;

            elements.probeBtn.textContent = 'Probing...';
            elements.probeBtn.disabled = true;

            const res = await apiRequest('/api/download/probe', 'POST', { url });
            elements.probeBtn.textContent = 'Probe Link';
            elements.probeBtn.disabled = false;

            if (res.success && res.data) {
                elements.probeResultBanner.classList.remove('is-hidden');
                
                if (res.data.isVideoStream) {
                    state.lastProbedIsVideo = true;
                    elements.probeRanges.textContent = '🎬 Video Stream (16 Turbo Chunks)';
                    elements.probeSize.textContent = 'Calculated live during extraction';
                    elements.probeCat.textContent = 'VIDEO / STREAM';
                    elements.videoQualityGroup.style.display = 'flex';
                    elements.categorySelect.value = 'video';
                } else {
                    state.lastProbedIsVideo = false;
                    elements.videoQualityGroup.style.display = 'none';
                    elements.probeRanges.textContent = res.data.acceptRanges ? '✅ Multi-chunk (16+ Threads)' : '⚠️ Single connection';
                    elements.probeSize.textContent = res.data.totalBytes ? formatBytes(res.data.totalBytes) : 'Unknown';
                    elements.probeCat.textContent = res.data.category.toUpperCase();
                    if (res.data.category) elements.categorySelect.value = res.data.category;
                }

                if (res.data.filename) {
                    elements.filenameInput.value = res.data.filename;
                }
            } else {
                alert('Probe failed: ' + (res.error || 'Check URL'));
            }
        });

        elements.addDownloadForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const url = elements.downloadUrlInput.value.trim();
            if (!url) return;

            const isAudio = elements.videoQualitySelect.value === 'audio_mp3';
            const payload = {
                url,
                filename: elements.filenameInput.value.trim() || undefined,
                threads: parseInt(elements.threadSelect.value, 10) || 8,
                category: elements.categorySelect.value || (state.lastProbedIsVideo ? 'video' : undefined),
                format: state.lastProbedIsVideo && !isAudio ? elements.videoQualitySelect.value : undefined,
                isAudio: isAudio,
                startImmediately: elements.startImmediatelyCheck.checked
            };

            const res = await apiRequest('/api/download/add', 'POST', payload);
            if (res.success) {
                closeAddModal();
                fetchTasks();
            } else {
                alert('Failed to add download: ' + (res.error || 'Unknown error'));
            }
        });

        elements.sniffClipboardBtn.addEventListener('click', async () => {
            try {
                const text = await navigator.clipboard.readText();
                if (text && (text.startsWith('http://') || text.startsWith('https://'))) {
                    elements.downloadUrlInput.value = text;
                    openAddModal();
                    elements.probeBtn.click();
                } else {
                    alert('Clipboard sniffer: Copy any download/video URL and click here.');
                }
            } catch (err) {
                alert('Clipboard access denied: ' + err.message);
            }
        });
    }

    setupEventListeners();
    initEventStream();
    fetchTasks();

})();
