# ⚡ Nitro Download Manager (NDM Pro)
> High-performance, multi-threaded open-source alternative to IDM (Internet Download Manager).

## 🌟 Key Features
- **🚀 Segmented Multi-Thread Engine**: Divides files into 4, 8, 16, or 32 concurrent chunks via HTTP `Range` headers to saturate available bandwidth.
- **⏸️ Pause & Resume Guarantee**: Checkpoint persistence with chunk-level state so interrupted downloads can resume instantly without data loss.
- **📊 Real-Time Visual Chunk Map**: Dynamic UI displaying live per-thread downloading progress, just like IDM.
- **🎨 Modern Dark Mode Console**: 3-column enterprise design system (Google Blue HSL palette, collapsible sidebar, utility rail, responsive layout).
- **🌐 Browser Extension Included**: Chrome/Edge Manifest V3 extension with context-menu capture and download routing.
- **🎬 Smart Auto-Categorization**: Automatic routing into Videos, Compressed, Programs, Music, and Documents.

## 🚀 Getting Started

### 1. Start the Server
```bash
cd subdomains/idm
node server/server.js
```
Open **http://localhost:3000** in your browser.

### 2. Install Browser Extension
1. Open `chrome://extensions` in Chrome or Edge.
2. Enable **Developer mode** in the top right.
3. Click **Load unpacked** and select `subdomains/idm/extension`.
