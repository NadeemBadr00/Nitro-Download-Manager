/**
 * Nitro Download Manager (NDM) - Core Multi-Part Download Engine
 * Features:
 * - Auto-increment duplicate filenames (e.g. video.mp4, video (1).mp4, video (2).mp4)
 * - Rock-Solid UTF-16 Base64 PowerShell integration for Unicode/Emoji/Hashtags
 * - Foreground Explorer Show-In-Folder & Native Media Player launch
 * - Default Save Folder: C:\Users\DELL\Downloads
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { spawn } = require('child_process');
const crypto = require('crypto');
const VideoExtractor = require('./video_extractor');

const DEFAULT_DOWNLOADS_DIR = path.join(process.env.USERPROFILE || 'C:\\Users\\DELL', 'Downloads');

class DownloadEngine extends EventEmitter {
    constructor(options = {}) {
        super();
        this.downloadDir = options.downloadDir || DEFAULT_DOWNLOADS_DIR;
        this.dbPath = options.dbPath || path.join(__dirname, '..', 'downloads_db.json');
        this.tasks = new Map();
        this.activeWorkers = new Map();
        this.maxConcurrentDownloads = options.maxConcurrentDownloads || 3;
        this.speedLimit = 0; // 0 = unlimited, in bytes/s
        this.scheduler = {
            enabled: false,
            startAt: null,
            autoShutdown: false,
            shutdownArmed: false
        };
        
        if (!fs.existsSync(this.downloadDir)) {
            fs.mkdirSync(this.downloadDir, { recursive: true });
        }

        this.loadTasks();
        this.startSpeedTicker();
        this.startSchedulerTicker();
    }

    startSchedulerTicker() {
        setInterval(() => {
            // 1. Check Scheduled Start Time
            if (this.scheduler.enabled && this.scheduler.startAt) {
                const startTime = new Date(this.scheduler.startAt).getTime();
                if (!isNaN(startTime) && Date.now() >= startTime) {
                    console.log('[NDM Scheduler] Scheduled time reached! Starting all queued downloads...');
                    this.scheduler.enabled = false;
                    this.resumeAll();
                    this.emit('schedulerTriggered');
                }
            }

            // 2. Check Auto-Shutdown Condition
            if (this.scheduler.autoShutdown && !this.scheduler.shutdownArmed) {
                const allTasks = Array.from(this.tasks.values());
                const active = allTasks.filter(t => t.status === 'downloading' || t.status === 'queued');
                const completed = allTasks.filter(t => t.status === 'completed');

                if (allTasks.length > 0 && completed.length > 0 && active.length === 0) {
                    this.scheduler.shutdownArmed = true;
                    console.log('[NDM AutoShutdown] All tasks finished! Executing Windows shutdown in 60s...');
                    const { exec } = require('child_process');
                    exec('shutdown /s /t 60 /c "Nitro DM completed all downloads. System shutting down in 60 seconds."');
                    this.emit('autoShutdownArmed');
                }
            }
        }, 2000);
    }

    cancelAutoShutdown() {
        this.scheduler.autoShutdown = false;
        this.scheduler.shutdownArmed = false;
        const { exec } = require('child_process');
        exec('shutdown /a');
        console.log('[NDM AutoShutdown] Shutdown aborted by user');
    }

    setSpeedLimit(limit) {
        this.speedLimit = Math.max(0, parseInt(limit, 10) || 0);
        console.log(`[NDM Engine] Global speed limit updated to: ${this.speedLimit} B/s`);
        return this.speedLimit;
    }

    setScheduler(config = {}) {
        if (config.enabled !== undefined) this.scheduler.enabled = !!config.enabled;
        if (config.startAt !== undefined) this.scheduler.startAt = config.startAt;
        if (config.autoShutdown !== undefined) {
            this.scheduler.autoShutdown = !!config.autoShutdown;
            if (!this.scheduler.autoShutdown && this.scheduler.shutdownArmed) {
                this.cancelAutoShutdown();
            }
        }
        console.log('[NDM Engine] Scheduler configuration updated:', this.scheduler);
        return this.scheduler;
    }

    async addBatchTasks(items = []) {
        const results = [];
        for (const item of items) {
            try {
                const task = await this.addTask({
                    url: item.url,
                    filename: item.filename,
                    threads: item.threads || 16,
                    category: item.category,
                    format: item.format,
                    isAudio: item.isAudio,
                    startImmediately: item.startImmediately !== false
                });
                results.push({ success: true, data: task });
            } catch (err) {
                results.push({ success: false, error: err.message, url: item.url });
            }
        }
        return results;
    }

    static getUniqueFilename(dir, baseFilename) {
        const cleanBase = (baseFilename || 'download_file').replace(/[<>:"/\\|?*]/g, '_');
        const ext = path.extname(cleanBase);
        const nameWithoutExt = path.basename(cleanBase, ext) || 'download';
        let finalName = cleanBase;
        let counter = 1;

        while (
            fs.existsSync(path.join(dir, finalName)) ||
            fs.existsSync(path.join(dir, `${finalName}.part`)) ||
            fs.existsSync(path.join(dir, `${finalName}.part_0`))
        ) {
            finalName = `${nameWithoutExt} (${counter})${ext}`;
            counter++;
        }
        return finalName;
    }

    static executePowerShell(psScript) {
        try {
            const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
            const child = spawn('powershell.exe', [
                '-NoProfile',
                '-NonInteractive',
                '-ExecutionPolicy', 'Bypass',
                '-EncodedCommand', encoded
            ], {
                detached: true,
                stdio: 'ignore'
            });
            child.unref();
            return true;
        } catch (err) {
            console.error('Failed to execute PowerShell command:', err);
            return false;
        }
    }

    static categorize(filename, mime = '') {
        const ext = path.extname(filename).toLowerCase().replace('.', '');
        const categories = {
            video: ['mp4', 'mkv', 'webm', 'avi', 'mov', 'flv', 'wmv', 'm4v', 'ts', '3gp'],
            audio: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma', 'opus'],
            compressed: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso', 'dmg'],
            programs: ['exe', 'msi', 'apk', 'deb', 'rpm', 'appimage', 'bat', 'cmd', 'ps1'],
            documents: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'epub', 'csv', 'md']
        };

        for (const [cat, exts] of Object.entries(categories)) {
            if (exts.includes(ext)) return cat;
        }

        if (mime.startsWith('video/')) return 'video';
        if (mime.startsWith('audio/')) return 'audio';
        if (mime.startsWith('image/')) return 'documents';
        return 'others';
    }

    async probeUrl(rawUrl, headers = {}, maxRedirects = 5) {
        if (VideoExtractor.isVideoPlatform(rawUrl)) {
            try {
                const videoInfo = await VideoExtractor.getFormats(rawUrl);
                const safeName = videoInfo.title.replace(/[<>:"/\\|?*]/g, '_') + '.mp4';
                return {
                    url: rawUrl,
                    finalUrl: rawUrl,
                    isVideoStream: true,
                    filename: safeName,
                    title: videoInfo.title,
                    thumbnail: videoInfo.thumbnail,
                    duration: videoInfo.duration,
                    totalBytes: 0,
                    acceptRanges: true,
                    contentType: 'video/mp4',
                    category: 'video',
                    qualities: videoInfo.qualities
                };
            } catch (err) {
                console.warn('Video probe fallback to direct probe:', err.message);
            }
        }

        if (maxRedirects <= 0) throw new Error('Too many redirects');

        const parsedUrl = new URL(rawUrl);
        const protocol = parsedUrl.protocol === 'https:' ? https : http;

        return new Promise((resolve, reject) => {
            const reqOptions = {
                method: 'HEAD',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                    ...headers
                }
            };

            const req = protocol.request(rawUrl, reqOptions, async (res) => {
                if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
                    const redirectUrl = new URL(res.headers.location, rawUrl).toString();
                    try {
                        const result = await this.probeUrl(redirectUrl, headers, maxRedirects - 1);
                        return resolve(result);
                    } catch (err) {
                        return reject(err);
                    }
                }

                if (res.statusCode === 405 || res.statusCode === 403) {
                    try {
                        const fallbackResult = await this.probeUrlWithGet(rawUrl, headers);
                        return resolve(fallbackResult);
                    } catch (err) {
                        return reject(err);
                    }
                }

                const contentLength = parseInt(res.headers['content-length'] || '0', 10);
                const acceptRanges = res.headers['accept-ranges'] === 'bytes' || !!res.headers['content-range'];
                const contentType = res.headers['content-type'] || 'application/octet-stream';
                
                let filename = '';
                const disposition = res.headers['content-disposition'];
                if (disposition && disposition.includes('filename=')) {
                    const match = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
                    if (match && match[1]) {
                        filename = match[1].replace(/['"]/g, '').trim();
                    }
                }
                if (!filename) {
                    const pathname = parsedUrl.pathname;
                    filename = path.basename(pathname) || 'download_file';
                }

                filename = filename.replace(/[<>:"/\\|?*]/g, '_');

                resolve({
                    url: rawUrl,
                    finalUrl: rawUrl,
                    isVideoStream: false,
                    filename,
                    totalBytes: contentLength,
                    acceptRanges,
                    contentType,
                    category: DownloadEngine.categorize(filename, contentType)
                });
            });

            req.on('error', reject);
            req.setTimeout(10000, () => req.destroy(new Error('Connection timed out while probing URL')));
            req.end();
        });
    }

    async probeUrlWithGet(rawUrl, headers = {}) {
        const parsedUrl = new URL(rawUrl);
        const protocol = parsedUrl.protocol === 'https:' ? https : http;

        return new Promise((resolve, reject) => {
            const req = protocol.request(rawUrl, {
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                    'Range': 'bytes=0-0',
                    ...headers
                }
            }, (res) => {
                const isPartial = res.statusCode === 206;
                const rangeHeader = res.headers['content-range'];
                let totalBytes = 0;

                if (rangeHeader) {
                    const match = rangeHeader.match(/\/(\d+)/);
                    if (match) totalBytes = parseInt(match[1], 10);
                } else if (res.headers['content-length']) {
                    totalBytes = parseInt(res.headers['content-length'], 10);
                }

                let filename = path.basename(parsedUrl.pathname) || 'download_file';
                filename = filename.replace(/[<>:"/\\|?*]/g, '_');
                const contentType = res.headers['content-type'] || 'application/octet-stream';

                req.destroy();

                resolve({
                    url: rawUrl,
                    finalUrl: rawUrl,
                    isVideoStream: false,
                    filename,
                    totalBytes,
                    acceptRanges: isPartial,
                    contentType,
                    category: DownloadEngine.categorize(filename, contentType)
                });
            });

            req.on('error', reject);
            req.setTimeout(10000, () => req.destroy(new Error('Probe timeout')));
            req.end();
        });
    }

    async addTask({ url, filename, threads = 8, category, format, isAudio, startImmediately = true }) {
        const probe = await this.probeUrl(url);
        const taskId = crypto.randomBytes(8).toString('hex');
        
        // Auto-increment filename if duplicate already exists on disk
        const rawFilename = filename || probe.filename;
        const uniqueFilename = DownloadEngine.getUniqueFilename(this.downloadDir, rawFilename);
        const savePath = path.join(this.downloadDir, uniqueFilename);

        const isVideoStream = probe.isVideoStream || VideoExtractor.isVideoPlatform(url);
        const threadCount = isVideoStream ? 16 : ((probe.acceptRanges && probe.totalBytes > 1024 * 100) ? Math.min(threads, 32) : 1);
        
        const chunks = [];
        if (!isVideoStream && threadCount > 1 && probe.totalBytes > 0) {
            const chunkSize = Math.floor(probe.totalBytes / threadCount);
            for (let i = 0; i < threadCount; i++) {
                const start = i * chunkSize;
                const end = (i === threadCount - 1) ? probe.totalBytes - 1 : (start + chunkSize - 1);
                chunks.push({
                    id: i,
                    start,
                    end,
                    total: (end - start + 1),
                    downloaded: 0,
                    status: 'pending'
                });
            }
        } else {
            chunks.push({
                id: 0,
                start: 0,
                end: probe.totalBytes > 0 ? probe.totalBytes - 1 : 0,
                total: probe.totalBytes,
                downloaded: 0,
                status: 'pending'
            });
        }

        const task = {
            id: taskId,
            url,
            filename: uniqueFilename,
            savePath,
            totalBytes: probe.totalBytes,
            downloadedBytes: 0,
            status: 'queued',
            threads: threadCount,
            acceptRanges: probe.acceptRanges,
            contentType: probe.contentType,
            category: category || probe.category,
            isVideoStream,
            videoFormat: format || null,
            isAudio: !!isAudio,
            thumbnail: probe.thumbnail || null,
            chunks,
            speed: 0,
            eta: 0,
            lastBytes: 0,
            createdAt: new Date().toISOString(),
            completedAt: null,
            error: null
        };

        this.tasks.set(taskId, task);
        this.saveTasks();
        this.emit('taskAdded', task);

        if (startImmediately) {
            this.startDownload(taskId);
        }

        return task;
    }

    async startDownload(taskId) {
        const task = this.tasks.get(taskId);
        if (!task) throw new Error('Task not found');
        if (task.status === 'downloading' || task.status === 'completed') return;

        task.status = 'downloading';
        task.error = null;
        this.saveTasks();
        this.emit('taskUpdated', task);

        if (task.isVideoStream) {
            this.downloadVideoStream(task);
            return;
        }

        const workerContext = {
            activeRequests: [],
            isAborted: false
        };
        this.activeWorkers.set(taskId, workerContext);

        try {
            if (task.threads > 1 && task.acceptRanges) {
                await this.downloadMultiThread(task, workerContext);
            } else {
                await this.downloadSingleThread(task, workerContext);
            }

            if (!workerContext.isAborted) {
                task.status = 'completed';
                task.completedAt = new Date().toISOString();
                task.speed = 0;
                task.eta = 0;
                if (fs.existsSync(task.savePath)) {
                    task.totalBytes = fs.statSync(task.savePath).size;
                    task.downloadedBytes = task.totalBytes;
                }
                this.activeWorkers.delete(taskId);
                this.saveTasks();
                this.emit('taskCompleted', task);
            }
        } catch (err) {
            if (!workerContext.isAborted) {
                task.status = 'error';
                task.error = err.message || 'Download failed';
                task.speed = 0;
                this.activeWorkers.delete(taskId);
                this.saveTasks();
                this.emit('taskError', task);
            }
        }
    }

    downloadVideoStream(task) {
        const workerContext = {
            process: null,
            isAborted: false
        };
        this.activeWorkers.set(task.id, workerContext);

        // Pass unique filename without extension to yt-dlp
        const ext = path.extname(task.filename);
        const nameWithoutExt = path.basename(task.filename, ext);

        const child = VideoExtractor.download({
            url: task.url,
            format: task.videoFormat,
            isAudio: task.isAudio,
            saveDir: this.downloadDir,
            filename: nameWithoutExt,
            speedLimit: this.speedLimit,
            onProgress: (p) => {
                if (workerContext.isAborted) return;
                task.status = 'downloading';
                if (p.totalBytes) {
                    task.totalBytes = p.totalBytes;
                    task.downloadedBytes = Math.round((p.percent / 100) * p.totalBytes);
                } else if (p.percent) {
                    if (task.totalBytes <= 0) task.totalBytes = 100;
                    task.downloadedBytes = p.percent;
                }
                if (p.speedStr) {
                    const match = p.speedStr.match(/([\d\.]+)(\w+)\/s/);
                    if (match) {
                        const num = parseFloat(match[1]);
                        const unit = match[2].toLowerCase();
                        let mult = 1024 * 1024;
                        if (unit.startsWith('k')) mult = 1024;
                        if (unit.startsWith('g')) mult = 1024 * 1024 * 1024;
                        task.speed = num * mult;
                    }
                }
                this.emit('taskUpdated', task);
            },
            onComplete: ({ finalPath }) => {
                if (workerContext.isAborted) return;
                task.status = 'completed';
                task.completedAt = new Date().toISOString();
                task.speed = 0;
                task.eta = 0;
                
                if (finalPath && fs.existsSync(finalPath)) {
                    task.savePath = finalPath;
                    task.filename = path.basename(finalPath);
                    const fileSize = fs.statSync(finalPath).size;
                    task.totalBytes = fileSize;
                    task.downloadedBytes = fileSize;
                } else if (fs.existsSync(task.savePath)) {
                    const fileSize = fs.statSync(task.savePath).size;
                    task.totalBytes = fileSize;
                    task.downloadedBytes = fileSize;
                }

                this.activeWorkers.delete(task.id);
                this.saveTasks();
                this.emit('taskCompleted', task);
            },
            onError: (err) => {
                if (workerContext.isAborted) return;
                task.status = 'error';
                task.error = err.message || 'Stream extraction failed';
                task.speed = 0;
                this.activeWorkers.delete(task.id);
                this.saveTasks();
                this.emit('taskError', task);
            }
        });

        workerContext.process = child;
    }

    async downloadMultiThread(task, workerContext) {
        const chunkPromises = task.chunks.map(chunk => {
            if (chunk.downloaded >= chunk.total && chunk.total > 0) {
                chunk.status = 'completed';
                return Promise.resolve();
            }
            return this.downloadChunk(task, chunk, workerContext);
        });

        await Promise.all(chunkPromises);
        if (workerContext.isAborted) return;
        await this.assembleChunks(task);
    }

    downloadChunk(task, chunk, workerContext) {
        return new Promise((resolve, reject) => {
            if (workerContext.isAborted) return resolve();

            const chunkFile = `${task.savePath}.part_${chunk.id}`;
            const startByte = chunk.start + chunk.downloaded;
            const endByte = chunk.end;

            if (startByte > endByte) {
                chunk.status = 'completed';
                return resolve();
            }

            chunk.status = 'downloading';
            const parsedUrl = new URL(task.url);
            const protocol = parsedUrl.protocol === 'https:' ? https : http;

            const writeStream = fs.createWriteStream(chunkFile, {
                flags: chunk.downloaded > 0 ? 'a' : 'w'
            });

            const req = protocol.request(task.url, {
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                    'Range': `bytes=${startByte}-${endByte}`
                }
            }, (res) => {
                if (res.statusCode !== 206 && res.statusCode !== 200) {
                    writeStream.close();
                    return reject(new Error(`Server returned HTTP ${res.statusCode} for chunk ${chunk.id}`));
                }

                res.on('data', (data) => {
                    if (workerContext.isAborted) return;
                    chunk.downloaded += data.length;
                    task.downloadedBytes += data.length;
                });

                res.pipe(writeStream);
                writeStream.on('finish', () => {
                    chunk.status = 'completed';
                    resolve();
                });
                writeStream.on('error', reject);
            });

            req.on('error', (err) => {
                if (workerContext.isAborted) return resolve();
                chunk.status = 'error';
                reject(err);
            });

            workerContext.activeRequests.push(req);
            req.end();
        });
    }

    downloadSingleThread(task, workerContext) {
        return new Promise((resolve, reject) => {
            if (workerContext.isAborted) return resolve();

            const parsedUrl = new URL(task.url);
            const protocol = parsedUrl.protocol === 'https:' ? https : http;
            const writeStream = fs.createWriteStream(task.savePath, { flags: 'w' });

            const req = protocol.request(task.url, {
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
                }
            }, (res) => {
                if (res.statusCode !== 200 && res.statusCode !== 206) {
                    writeStream.close();
                    return reject(new Error(`Server returned HTTP ${res.statusCode}`));
                }

                if (!task.totalBytes && res.headers['content-length']) {
                    task.totalBytes = parseInt(res.headers['content-length'], 10);
                }

                res.on('data', (data) => {
                    if (workerContext.isAborted) return;
                    task.downloadedBytes += data.length;
                    if (task.chunks[0]) {
                        task.chunks[0].downloaded += data.length;
                    }
                });

                res.pipe(writeStream);
                writeStream.on('finish', resolve);
                writeStream.on('error', reject);
            });

            req.on('error', (err) => {
                if (workerContext.isAborted) return resolve();
                reject(err);
            });

            workerContext.activeRequests.push(req);
            req.end();
        });
    }

    async assembleChunks(task) {
        const destStream = fs.createWriteStream(task.savePath, { flags: 'w' });

        for (let i = 0; i < task.chunks.length; i++) {
            const chunkFile = `${task.savePath}.part_${i}`;
            if (!fs.existsSync(chunkFile)) continue;

            await new Promise((resolve, reject) => {
                const srcStream = fs.createReadStream(chunkFile);
                srcStream.pipe(destStream, { end: false });
                srcStream.on('end', () => {
                    srcStream.close();
                    try { fs.unlinkSync(chunkFile); } catch (_) {}
                    resolve();
                });
                srcStream.on('error', reject);
            });
        }

        destStream.end();
    }

    resolveTaskPath(task) {
        let targetFile = task.savePath;
        if (!targetFile || !fs.existsSync(targetFile)) {
            const fallback = path.join(this.downloadDir, task.filename);
            if (fs.existsSync(fallback)) targetFile = fallback;
        }
        return targetFile;
    }

    openFileFolder(taskId) {
        const task = this.tasks.get(taskId);
        if (!task) {
            console.log('[NDM openFileFolder] Task not found:', taskId);
            return false;
        }
        
        const targetFile = this.resolveTaskPath(task);
        const fileExists = targetFile && fs.existsSync(targetFile);
        const folder = fileExists ? path.dirname(targetFile) : this.downloadDir;

        console.log(`[NDM openFileFolder] Task: ${taskId}, File: "${targetFile}", Exists: ${fileExists}`);

        const { spawn, exec } = require('child_process');

        if (fileExists) {
            // Highlight and select the exact file in Windows Explorer
            try {
                const child = spawn('explorer.exe', [`/select,"${targetFile}"`], {
                    windowsVerbatimArguments: true,
                    detached: true,
                    stdio: 'ignore'
                });
                child.unref();
            } catch (err) {
                console.error('[NDM openFileFolder] select spawn error:', err.message);
                try { exec(`start "" "${folder}"`); } catch (_) {}
            }
        } else {
            // Fallback to opening folder if file was moved or deleted
            try {
                const child = spawn('explorer.exe', [folder], {
                    detached: true,
                    stdio: 'ignore'
                });
                child.unref();
            } catch (_) {
                try { exec(`start "" "${folder}"`); } catch (_) {}
            }
        }

        return true;
    }

    openFile(taskId) {
        const task = this.tasks.get(taskId);
        if (!task) {
            console.log('[NDM openFile] Task not found:', taskId);
            return false;
        }

        const targetFile = this.resolveTaskPath(task);
        console.log(`[NDM openFile] Task: ${taskId}, Target: "${targetFile}", Exists: ${targetFile ? fs.existsSync(targetFile) : false}`);

        if (!targetFile || !fs.existsSync(targetFile)) return false;

        const { exec } = require('child_process');
        exec(`start "" "${targetFile}"`);
        return true;
    }

    pauseTask(taskId) {
        const task = this.tasks.get(taskId);
        if (!task || task.status !== 'downloading') return false;

        const worker = this.activeWorkers.get(taskId);
        if (worker) {
            worker.isAborted = true;
            if (worker.process && worker.process.abort) {
                worker.process.abort();
            }
            if (worker.activeRequests) {
                worker.activeRequests.forEach(req => {
                    try { req.destroy(); } catch (_) {}
                });
            }
            this.activeWorkers.delete(taskId);
        }

        task.status = 'paused';
        task.speed = 0;
        task.eta = 0;
        this.saveTasks();
        this.emit('taskUpdated', task);
        return true;
    }

    resumeTask(taskId) {
        const task = this.tasks.get(taskId);
        if (!task || task.status === 'downloading' || task.status === 'completed') return false;
        
        if (!task.isVideoStream) {
            task.downloadedBytes = task.chunks.reduce((acc, c) => acc + c.downloaded, 0);
        }
        this.startDownload(taskId);
        return true;
    }

    deleteTask(taskId, deleteFile = false) {
        this.pauseTask(taskId);
        const task = this.tasks.get(taskId);
        if (!task) return false;

        if (deleteFile) {
            if (fs.existsSync(task.savePath)) {
                try { fs.unlinkSync(task.savePath); } catch (_) {}
            }
            task.chunks.forEach(c => {
                const partFile = `${task.savePath}.part_${c.id}`;
                if (fs.existsSync(partFile)) {
                    try { fs.unlinkSync(partFile); } catch (_) {}
                }
            });
        }

        this.tasks.delete(taskId);
        this.saveTasks();
        this.emit('taskDeleted', taskId);
        return true;
    }

    startSpeedTicker() {
        setInterval(() => {
            let totalSpeed = 0;
            let activeCount = 0;

            for (const task of this.tasks.values()) {
                if (task.status === 'downloading') {
                    activeCount++;
                    if (!task.isVideoStream) {
                        const diff = task.downloadedBytes - (task.lastBytes || 0);
                        task.speed = Math.max(0, diff);
                        task.lastBytes = task.downloadedBytes;
                        
                        if (task.totalBytes > 0 && task.speed > 0) {
                            const remaining = task.totalBytes - task.downloadedBytes;
                            task.eta = Math.ceil(remaining / task.speed);
                        } else {
                            task.eta = 0;
                        }
                    }
                    totalSpeed += (task.speed || 0);
                } else {
                    task.speed = 0;
                    task.eta = 0;
                    task.lastBytes = task.downloadedBytes;
                }
            }

            this.emit('stats', {
                totalSpeed,
                activeCount,
                tasks: Array.from(this.tasks.values())
            });
        }, 1000);
    }

    saveTasks() {
        try {
            const data = JSON.stringify(Array.from(this.tasks.values()), null, 2);
            fs.writeFileSync(this.dbPath, data, 'utf-8');
        } catch (err) {
            console.error('Failed to persist tasks:', err.message);
        }
    }

    loadTasks() {
        try {
            if (fs.existsSync(this.dbPath)) {
                const raw = fs.readFileSync(this.dbPath, 'utf-8');
                const list = JSON.parse(raw);
                list.forEach(t => {
                    if (t.status === 'downloading') t.status = 'paused';
                    t.speed = 0;
                    if (t.savePath && !fs.existsSync(t.savePath)) {
                        const inUserDownloads = path.join(this.downloadDir, t.filename);
                        if (fs.existsSync(inUserDownloads)) {
                            t.savePath = inUserDownloads;
                        }
                    }
                    this.tasks.set(t.id, t);
                });
            }
        } catch (err) {
            console.error('Failed to load tasks db:', err.message);
        }
    }
}

module.exports = DownloadEngine;
