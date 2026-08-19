/**
 * Nitro Download Manager (NDM) - HTTP API & Static Web Server
 * Includes Open-in-Folder, Open-File, and Video Stream Support
 */

process.on('uncaughtException', (err) => {
    console.error('Server Uncaught Exception:', err.message);
});

process.on('unhandledRejection', (reason) => {
    console.error('Server Unhandled Rejection:', reason);
});

const http = require('http');
const fs = require('fs');
const path = require('path');
const DownloadEngine = require('./engine');
const VideoExtractor = require('./video_extractor');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const DOWNLOADS_DIR = path.join(process.env.USERPROFILE || 'C:\\Users\\DELL', 'Downloads');

const engine = new DownloadEngine({
    downloadDir: DOWNLOADS_DIR,
    dbPath: path.join(__dirname, '..', 'downloads_db.json')
});

const sseClients = new Set();

engine.on('stats', (data) => {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    for (const client of sseClients) {
        try {
            if (!client.writableEnded && !client.destroyed) {
                client.write(payload);
            } else {
                sseClients.delete(client);
            }
        } catch (_) {
            sseClients.delete(client);
        }
    }
});

setInterval(() => {
    for (const client of sseClients) {
        try {
            if (!client.writableEnded && !client.destroyed) {
                client.write(':ping\n\n');
            } else {
                sseClients.delete(client);
            }
        } catch (_) {
            sseClients.delete(client);
        }
    }
}, 15000);

function sendJson(res, statusCode, data) {
    const json = JSON.stringify(data);
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Content-Length': Buffer.byteLength(json)
    });
    res.end(json);
}

function parseJsonBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (err) {
                reject(new Error('Invalid JSON payload'));
            }
        });
        req.on('error', reject);
    });
}

function serveStatic(req, res, pathname) {
    let cleanPath = pathname === '/' ? '/index.html' : pathname;
    cleanPath = path.normalize(cleanPath).replace(/^(\.\.[\/\\])+/, '');
    const filePath = path.join(PUBLIC_DIR, cleanPath);

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('404 Not Found');
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon'
    };

    const contentType = mimeTypes[ext] || 'application/octet-stream';
    const content = fs.readFileSync(filePath);

    res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': content.length,
        'Cache-Control': 'no-cache'
    });
    res.end(content);
}

const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        });
        return res.end();
    }

    const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = reqUrl.pathname;

    try {
        if (req.method === 'GET' && pathname === '/api/downloads') {
            return sendJson(res, 200, {
                success: true,
                data: Array.from(engine.tasks.values())
            });
        }

        if (req.method === 'POST' && pathname === '/api/download/probe') {
            const body = await parseJsonBody(req);
            if (!body.url) return sendJson(res, 400, { success: false, error: 'URL is required' });
            
            try {
                const probe = await engine.probeUrl(body.url);
                return sendJson(res, 200, { success: true, data: probe });
            } catch (probeErr) {
                return sendJson(res, 400, { success: false, error: probeErr.message || 'Failed to probe URL' });
            }
        }

        if (req.method === 'POST' && pathname === '/api/video/formats') {
            const body = await parseJsonBody(req);
            if (!body.url) return sendJson(res, 400, { success: false, error: 'URL is required' });

            try {
                const info = await VideoExtractor.getFormats(body.url);
                return sendJson(res, 200, { success: true, data: info });
            } catch (vErr) {
                return sendJson(res, 400, { success: false, error: vErr.message || 'Failed to extract video formats' });
            }
        }

        if (req.method === 'POST' && pathname === '/api/download/add') {
            const body = await parseJsonBody(req);
            if (!body.url) return sendJson(res, 400, { success: false, error: 'URL is required' });

            try {
                const task = await engine.addTask({
                    url: body.url,
                    filename: body.filename,
                    threads: parseInt(body.threads, 10) || 8,
                    category: body.category,
                    format: body.format,
                    isAudio: !!body.isAudio,
                    startImmediately: body.startImmediately !== false
                });
                return sendJson(res, 201, { success: true, data: task });
            } catch (addErr) {
                return sendJson(res, 400, { success: false, error: addErr.message || 'Failed to start download' });
            }
        }

        // Open in Windows Explorer Folder
        const openFolderMatch = pathname.match(/^\/api\/download\/([a-zA-Z0-9_-]+)\/open-folder$/);
        if (req.method === 'POST' && openFolderMatch) {
            const taskId = openFolderMatch[1];
            const ok = engine.openFileFolder(taskId);
            return sendJson(res, ok ? 200 : 404, { success: ok, taskId });
        }

        // Open/Play File
        const openFileMatch = pathname.match(/^\/api\/download\/([a-zA-Z0-9_-]+)\/open-file$/);
        if (req.method === 'POST' && openFileMatch) {
            const taskId = openFileMatch[1];
            const ok = engine.openFile(taskId);
            return sendJson(res, ok ? 200 : 404, { success: ok, taskId });
        }

        const pauseMatch = pathname.match(/^\/api\/download\/([a-zA-Z0-9_-]+)\/pause$/);
        if (req.method === 'POST' && pauseMatch) {
            const taskId = pauseMatch[1];
            const ok = engine.pauseTask(taskId);
            return sendJson(res, ok ? 200 : 404, { success: ok, taskId });
        }

        const resumeMatch = pathname.match(/^\/api\/download\/([a-zA-Z0-9_-]+)\/resume$/);
        if (req.method === 'POST' && resumeMatch) {
            const taskId = resumeMatch[1];
            const ok = engine.resumeTask(taskId);
            return sendJson(res, ok ? 200 : 404, { success: ok, taskId });
        }

        const deleteMatch = pathname.match(/^\/api\/download\/([a-zA-Z0-9_-]+)\/delete$/);
        if (req.method === 'POST' && deleteMatch) {
            const taskId = deleteMatch[1];
            const body = await parseJsonBody(req);
            const ok = engine.deleteTask(taskId, !!body.deleteFile);
            return sendJson(res, ok ? 200 : 404, { success: ok, taskId });
        }

        // Video Playlist Prober
        if (req.method === 'POST' && pathname === '/api/video/playlist') {
            const body = await parseJsonBody(req);
            if (!body.url) return sendJson(res, 400, { success: false, error: 'URL is required' });
            try {
                const playlistData = await VideoExtractor.getPlaylist(body.url);
                return sendJson(res, 200, { success: true, data: playlistData });
            } catch (err) {
                return sendJson(res, 400, { success: false, error: err.message || 'Failed to extract playlist' });
            }
        }

        // Batch Add Downloads (e.g. from Playlist or Multi-select)
        if (req.method === 'POST' && pathname === '/api/download/batch-add') {
            const body = await parseJsonBody(req);
            if (!Array.isArray(body.items) || body.items.length === 0) {
                return sendJson(res, 400, { success: false, error: 'items array is required' });
            }
            try {
                const results = await engine.addBatchTasks(body.items);
                return sendJson(res, 201, { success: true, data: results });
            } catch (err) {
                return sendJson(res, 400, { success: false, error: err.message || 'Failed to add batch downloads' });
            }
        }

        // Speed Limit Settings
        if (req.method === 'GET' && pathname === '/api/settings/speed-limit') {
            return sendJson(res, 200, { success: true, data: { speedLimit: engine.speedLimit } });
        }
        if (req.method === 'POST' && pathname === '/api/settings/speed-limit') {
            const body = await parseJsonBody(req);
            const limit = engine.setSpeedLimit(body.speedLimit);
            return sendJson(res, 200, { success: true, data: { speedLimit: limit } });
        }

        // Scheduler Settings
        if (req.method === 'GET' && pathname === '/api/settings/scheduler') {
            return sendJson(res, 200, { success: true, data: engine.scheduler });
        }
        if (req.method === 'POST' && pathname === '/api/settings/scheduler') {
            const body = await parseJsonBody(req);
            const scheduler = engine.setScheduler(body);
            return sendJson(res, 200, { success: true, data: scheduler });
        }
        if (req.method === 'POST' && pathname === '/api/settings/scheduler/cancel-shutdown') {
            engine.cancelAutoShutdown();
            return sendJson(res, 200, { success: true, message: 'Shutdown aborted' });
        }

        if (req.method === 'POST' && pathname === '/api/downloads/pause-all') {
            for (const task of engine.tasks.values()) {
                if (task.status === 'downloading') engine.pauseTask(task.id);
            }
            return sendJson(res, 200, { success: true });
        }

        if (req.method === 'POST' && pathname === '/api/downloads/resume-all') {
            for (const task of engine.tasks.values()) {
                if (task.status === 'paused' || task.status === 'queued') engine.resumeTask(task.id);
            }
            return sendJson(res, 200, { success: true });
        }

        if (req.method === 'POST' && pathname === '/api/downloads/clear-completed') {
            for (const [id, task] of engine.tasks.entries()) {
                if (task.status === 'completed') engine.tasks.delete(id);
            }
            engine.saveTasks();
            return sendJson(res, 200, { success: true });
        }

        if (req.method === 'GET' && pathname === '/api/stats/stream') {
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no',
                'Access-Control-Allow-Origin': '*'
            });
            const initPayload = `data: ${JSON.stringify({
                tasks: Array.from(engine.tasks.values()),
                totalSpeed: 0,
                activeCount: 0,
                speedLimit: engine.speedLimit,
                scheduler: engine.scheduler
            })}\n\n`;
            res.write(initPayload);
            sseClients.add(res);

            req.on('close', () => sseClients.delete(res));
            req.on('error', () => sseClients.delete(res));
            return;
        }

        if (req.method === 'GET' && pathname === '/api/system') {
            return sendJson(res, 200, {
                success: true,
                data: {
                    downloadDir: DOWNLOADS_DIR,
                    version: '1.2.0',
                    platform: process.platform,
                    nodeVersion: process.version
                }
            });
        }

        return serveStatic(req, res, pathname);

    } catch (err) {
        console.error('Server error:', err);
        return sendJson(res, 500, { success: false, error: err.message || 'Internal Server Error' });
    }
});

server.listen(PORT, () => {
    console.log(`⚡ Nitro Download Manager Server running on http://localhost:${PORT}`);
});
