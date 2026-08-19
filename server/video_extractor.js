/**
 * Nitro Download Manager (NDM) - Video & Media Stream Extractor Engine
 * Uses yt-dlp + ffmpeg with 16-chunk parallel acceleration
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class VideoExtractor {
    static isVideoPlatform(url) {
        if (!url) return false;
        const videoDomains = [
            'youtube.com', 'youtu.be', 'vimeo.com', 'dailymotion.com',
            'facebook.com', 'fb.watch', 'instagram.com', 'tiktok.com',
            'twitter.com', 'x.com', 'twitch.tv', 'bilibili.com',
            'soundcloud.com', 'linkedin.com', 'licdn.com', 'threads.net',
            'reddit.com', 'pinterest.com', 'snapchat.com', 'rumble.com',
            'streamable.com', 'loom.com', 'bitchute.com', 'm3u8', '.mpd'
        ];
        return videoDomains.some(d => url.toLowerCase().includes(d));
    }

    static getFormats(url) {
        return new Promise((resolve, reject) => {
            const args = [
                '-m', 'yt_dlp',
                '--extractor-args', 'youtube:player_client=android,web',
                '--dump-json',
                '--no-playlist',
                url
            ];

            const child = spawn('python', args, {
                env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
            });

            let stdout = '';
            let stderr = '';

            child.stdout.on('data', data => stdout += data.toString('utf-8'));
            child.stderr.on('data', data => stderr += data.toString('utf-8'));

            child.on('close', code => {
                if (code !== 0) {
                    return reject(new Error(stderr || 'Failed to extract video information'));
                }

                try {
                    const data = JSON.parse(stdout);
                    const title = data.title || 'video';
                    const thumbnail = data.thumbnail || '';
                    const duration = data.duration || 0;

                    const cleanQualities = [
                        { label: '1080p Full HD (MP4)', height: 1080, format: 'bestvideo[height<=1080]+bestaudio/best[height<=1080]/best', isAudio: false },
                        { label: '720p HD (MP4)', height: 720, format: 'bestvideo[height<=720]+bestaudio/best[height<=720]/best', isAudio: false },
                        { label: '480p (MP4)', height: 480, format: 'bestvideo[height<=480]+bestaudio/best[height<=480]/best', isAudio: false },
                        { label: '360p (MP4)', height: 360, format: 'bestvideo[height<=360]+bestaudio/best[height<=360]/best', isAudio: false },
                        { label: 'Audio MP3 (High Quality)', height: 0, format: 'bestaudio/best', isAudio: true }
                    ];

                    resolve({
                        title,
                        thumbnail,
                        duration,
                        url,
                        qualities: cleanQualities
                    });
                } catch (err) {
                    reject(new Error('Failed to parse video metadata: ' + err.message));
                }
            });

            child.on('error', reject);
        });
    }

    static isPlaylist(url) {
        if (!url) return false;
        return url.includes('list=') || url.includes('/playlist') || url.includes('/sets/');
    }

    static getPlaylist(url) {
        return new Promise((resolve, reject) => {
            const args = [
                '-m', 'yt_dlp',
                '--flat-playlist',
                '--dump-single-json',
                url
            ];

            const child = spawn('python', args, {
                env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
            });

            let stdout = '';
            let stderr = '';

            child.stdout.on('data', data => stdout += data.toString('utf-8'));
            child.stderr.on('data', data => stderr += data.toString('utf-8'));

            child.on('close', code => {
                if (code !== 0) {
                    return reject(new Error(stderr || 'Failed to extract playlist information'));
                }

                try {
                    const data = JSON.parse(stdout);
                    const title = data.title || 'Playlist';
                    const entries = data.entries || [];
                    const videos = entries.map(item => ({
                        id: item.id,
                        title: item.title || `Video ${item.id}`,
                        url: item.url || `https://www.youtube.com/watch?v=${item.id}`,
                        duration: item.duration || 0,
                        thumbnail: item.thumbnails?.[0]?.url || ''
                    }));

                    resolve({
                        title,
                        count: videos.length,
                        videos
                    });
                } catch (err) {
                    reject(new Error('Failed to parse playlist: ' + err.message));
                }
            });

            child.on('error', reject);
        });
    }

    static download({ url, format, isAudio, saveDir, filename, speedLimit, onProgress, onComplete, onError }) {
        const cleanName = (filename || '%(title)s').replace(/[<>:"/\\|?*]/g, '_');
        const outTemplate = path.join(saveDir, `${cleanName}.%(ext)s`);
        
        const args = [
            '-m', 'yt_dlp',
            '--extractor-args', 'youtube:player_client=android,web',
            '--newline',
            '--no-playlist',
            '--concurrent-fragments', '16',
            '-N', '16',
            '--http-chunk-size', '10M',
            '--buffer-size', '16M',
            '--windows-filenames',
            '-o', outTemplate
        ];

        if (speedLimit && speedLimit > 0) {
            // Convert bytes/sec to yt-dlp format (e.g. 500K, 2M)
            const kbs = Math.round(speedLimit / 1024);
            args.push('--limit-rate', `${kbs}K`);
        }

        if (isAudio) {
            args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
        } else if (format) {
            args.push('-f', format, '--merge-output-format', 'mp4');
        } else {
            args.push('-f', 'bestvideo+bestaudio/best', '--merge-output-format', 'mp4');
        }

        args.push(url);

        const child = spawn('python', args, {
            env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
        });

        let finalPath = '';
        let wasAborted = false;

        child.abort = () => {
            wasAborted = true;
            try { child.kill('SIGTERM'); } catch (_) {}
            try { child.kill('SIGKILL'); } catch (_) {}
        };

        child.stdout.on('data', data => {
            if (wasAborted) return;
            const lines = data.toString('utf-8').split('\n');
            for (const line of lines) {
                const destMatch = line.match(/\[(?:download|Merger|ExtractAudio)\] Destination: (.+)/);
                if (destMatch) {
                    finalPath = destMatch[1].trim();
                }

                // e.g. [download]  45.2% of ~ 80.00MiB at  14.50MiB/s ETA 00:04
                const progressMatch = line.match(/\[download\]\s+([\d\.]+)%\s+of\s+~?([\d\.]+\w+)\s+at\s+([\d\.]+\w+\/s)\s+ETA\s+([\d:]+)/);
                if (progressMatch) {
                    const percent = parseFloat(progressMatch[1]);
                    const totalStr = progressMatch[2];
                    const speedStr = progressMatch[3];
                    const etaStr = progressMatch[4];

                    // Convert totalStr (e.g. 180.50MiB) to bytes
                    let totalBytes = 0;
                    const sizeMatch = totalStr.match(/([\d\.]+)(\w+)/);
                    if (sizeMatch) {
                        const num = parseFloat(sizeMatch[1]);
                        const unit = sizeMatch[2].toLowerCase();
                        let mult = 1024 * 1024;
                        if (unit.startsWith('g')) mult = 1024 * 1024 * 1024;
                        if (unit.startsWith('k')) mult = 1024;
                        totalBytes = Math.round(num * mult);
                    }

                    onProgress({
                        percent,
                        totalBytes,
                        totalStr,
                        speedStr,
                        etaStr
                    });
                }
            }
        });

        child.on('close', code => {
            if (wasAborted) return;
            if (code === 0) {
                onComplete({ finalPath });
            } else {
                onError(new Error(`yt-dlp exited with code ${code}`));
            }
        });

        child.on('error', err => {
            if (wasAborted) return;
            onError(err);
        });

        return child;
    }
}

module.exports = VideoExtractor;
