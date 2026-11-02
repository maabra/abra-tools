# Abra Tools

A Vue 3 + Vite hub. PDF and image tools run entirely in the browser, in a dedicated worker. Video and GIF tools use a Node processing server. Serve the app over HTTP rather than opening index.html directly.

Or use https://abra-tools.onrender.com

## Run

Requires Node.js 22.12+ and npm. On Windows use `npm.cmd` if PowerShell blocks npm.ps1.

```
npm install
npm run dev
```

Open http://localhost:3000. For a production build:

```
npm run build
```

Then set `NODE_ENV=production` and run `npm start`. The server binds to 127.0.0.1 intentionally. `PORT` defaults to 3000.

Twitter/X post links require the external yt-dlp executable:

```
python -m pip install --target .tools --upgrade yt-dlp
```

The server detects this project-local installation automatically (requires `python` on PATH). Alternatively install yt-dlp globally, or set `YTDLP_BIN` to its executable path. X can block public downloads or require authentication; upload the downloaded MP4 in that case. No account cookies are collected.

## Processing

- PDF: the default Organize pages tab shows real PDF.js thumbnails for each document. Drag pages to reorder (or use arrows / Alt+Left/Right), uncheck pages to exclude, rotate by 90 degrees, remove pages, undo edits, reset the layout and enlarge a page preview. Add multiple PDFs to combine their pages in one output. Previews render only near the viewport and release offscreen canvases; the visual organizer supports up to 2,000 pages and 300 MB per batch. Export uses browser-local pdf-lib to copy original vector pages with the chosen order/rotation, rather than rasterizing previews. The Merge/Extract/Separate tabs remain available. Encrypted PDFs must be unlocked first. Form fields, bookmarks, annotations and digital signatures are not guaranteed to survive page copying. PDF.js workers, fonts, CMaps and codecs are served from this app, with no external document uploads.
- Video: native FFmpeg, two-pass H.264 + AAC, with adaptive resolution and retries. Uses decimal MB and verifies actual bytes before returning a successful result. No oversized result is returned. Impossible budgets return an explanation. Smaller targets reduce quality. Audio is preserved unless muted.
- GIF: FFmpeg palettegen/paletteuse with Lanczos scaling. On file selection or a pasted public X/Twitter post URL, the app automatically uploads/downloads once, probes duration, rotation-aware pixel dimensions and average frame rate, and fills the controls. Defaults use the full source up to 60 seconds, width up to 1280 px and fps up to 30. Unknown frame rate is labelled and defaults to 15. You can override settings or reset them to source defaults. The inspected source is reused for conversion for up to one hour; use Read source again after expiry or server restart. Empty controls use the source-derived defaults on the server. Size limiting can further reduce width/fps. GIF output loops and has no audio.
- Images: browser-local decoding and OffscreenCanvas encoding for WebP/JPEG/lossless PNG; a lazy-loaded, single-threaded jSquash/libavif WebAssembly encoder produces AVIF. Uses browser EXIF orientation and removes source metadata, preserves aspect ratio and avoids upscaling. SVG is rasterized locally. JPEG transparency is flattened on white. PNG ignores the quality slider. Input support depends on browser decoders: TIFF, HEIC and RAW are not supported; GIF and animated PNG/WebP/AVIF are skipped to avoid losing frames. Unsupported files produce individual warnings while the rest of the batch continues. Conversion may increase file size.
- Batch: up to 200 files. Browser batches are capped at 300 MB input/output and decoded images at 40 megapixels. Video/GIF uploads remain capped at 1 GB per file. Folder selection via browser folder picker. Unique numbered filenames prevent collisions; ZIP outputs are flattened. Individual downloads and ZIPs are browser-generated for PDFs/images.

## Limits and privacy

PDF and image files never leave the browser. Video/GIF files are uploaded to the configured processing server. Do not expose the processing server publicly without appropriate authentication, TLS, quotas and process isolation. Twitter fetching contacts X through yt-dlp. Google Fonts is optional; system fallback fonts work offline.

Browser jobs run in a worker so the UI stays responsive. Cancel immediately terminates the worker, including PDF, AVIF and ZIP work. Browser download URLs are revoked when selecting a tool, adding a batch, rerunning, cancelling or closing the workbench. Reloading the page loses local results. Files and output archives still require sufficient device memory; start with smaller batches on phones. Asset downloads (worker code, PDF library, AVIF WASM) are normal static requests, not file uploads.

Server jobs run sequentially. Job IDs are random UUIDs. Server files expire one hour after completion/cancellation and processing has a 30-minute subprocess timeout. Backend PDF/image API endpoints are retained for compatibility but are never used by the frontend.

Results are temporary. Restarting the server clears job tracking; temporary directories left by a crash may remain in the OS temp folder. Browser reload loses the visible job state. Progress reflects processing stages, not an exact ETA.

## Verify

```
npm test
npm run build
```

Tests cover invalid ranges, page ordering, size-input validation, post URL restrictions and filename safety. The smoke test generates actual PDF, PNG and MP4 fixtures and processes all four tools through the HTTP API.

Technology references: https://www.ffmpeg.org/ffmpeg-all.html and https://sharp.pixelplumbing.com/api-output/.


Run `npm run test:smoke` while the server is running. `node tests/browser.mjs` runs desktop/mobile UI checks with Microsoft Edge on Windows and writes screenshots to `artifacts/`.

The built dist directory can be served by a static host: PDFs and images work without any backend. Video/GIF tools still require the native Node processing server at the same origin's /api routes. When serving the entire app through one Render Web Service, the initial page and asset load can still wake that service. Independent static hosting (and a same-origin /api proxy) is required to avoid that initial cold start for the whole site.

Run `npm run build` then `npm run test:browser-local` to test PDFs, image codecs and ZIP contents on a static-only server with all /api requests blocked. The test checks desktop and mobile layouts and verifies zero backend requests. Set BROWSER_PATH to a Chromium executable if Microsoft Edge is not installed at its default Windows path.

## Render deployment

Deploy the frontend and API together as one **Web Service**, using the repository-root Dockerfile. This avoids cross-origin setup: the Vue frontend already sends all uploads, job polls and downloads to relative `/api/...` URLs.

1. Push the project to your GitHub repository (including Dockerfile, package-lock.json, server, src, index.html and vite.config.js).
2. In Render choose New > Web Service and connect that repository. If your existing service is a Static Site, create a Web Service instead.
3. Select Docker runtime, repository root directory, Free instance, and health check `/healthz`. Leave Docker Command empty so the Dockerfile CMD is used. Docker builds the frontend and installs Node dependencies, Python and yt-dlp.
4. Render provides PORT and RENDER_EXTERNAL_URL automatically. HOST=0.0.0.0 and NODE_ENV=production are set in the Dockerfile. You do not need to set a frontend API URL or enable CORS.
5. Deploy, then visit your HTTPS onrender.com URL. `/healthz` should return `{"ok":true}`. Test a small image upload first.

Alternatively use New > Blueprint with render.yaml. Do not create both a Blueprint and another service for the same deployment.

For a custom domain set PUBLIC_ORIGIN to the full HTTPS origin, e.g. https://tools.example.com (no path). The API then accepts that hostname/origin. Use that domain consistently for the frontend and API.

If you already created a native Node Web Service, `npm ci --include=dev && npm run build` is the build command and `npm start` the start command; set NODE_ENV=production and HOST=0.0.0.0. This runs file uploads/conversions, but Twitter URL downloading additionally needs Python and yt-dlp installed in that environment. Docker packages both automatically.

Render free instances sleep on inactivity and have limited CPU/RAM. Large media can exhaust resources; uploaded/results files and queued jobs disappear when the instance restarts. The one-hour result expiry is a maximum retention window, not guaranteed persistence. This setup does not add user authentication or per-user quotas; restrict access before allowing broad public use. Local tests do not verify a deployment in your Render account.
