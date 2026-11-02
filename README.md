# Doodle Tools

A Vue 3 + Vite hub with a local Node processing server. Open `index.html` through the server, rather than directly from the filesystem.

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

- PDF: pdf-lib copies vector pages without rendering. Merge ordered documents, extract page ranges into one PDF, or split selected pages into individual PDFs. Encrypted PDFs fail explicitly. Form fields, bookmarks, annotations and digital signatures are not guaranteed to survive page copying.
- Video: native FFmpeg, two-pass H.264 + AAC, with adaptive resolution and retries. Uses decimal MB and verifies actual bytes before returning a successful result. No oversized result is returned. Impossible budgets return an explanation. Smaller targets reduce quality. Audio is preserved unless muted.
- GIF: FFmpeg palettegen/paletteuse with Lanczos scaling. Trims up to 60 seconds and progressively reduces dimensions and fps to fit an optional cap (5 MB by default). GIF output loops and has no audio.
- Images: native Sharp/libvips handles JPEG, PNG, WebP, AVIF, TIFF, SVG, and other formats supported by the installed decoder. HEIC/RAW/BMP are not universally supported; unsupported images produce individual errors. Animated and multipage files are skipped instead of losing frames. AVIF/WebP/JPEG or palette PNG output. Corrects EXIF orientation, removes metadata, preserves aspect ratio and avoids upscaling. JPEG transparency is flattened on white. Conversion is not guaranteed to reduce size; original bytes are kept when compatible with requested format and width and smaller.
- Batch: up to 200 files, 1 GB per file. Folder selection via browser folder picker. Unique numbered filenames prevent collisions; ZIP outputs are flattened. Individual downloads are also available.

## Limits and privacy

This is a local application, not a multi-user internet service. Do not expose the server publicly without authentication, TLS, quotas, process isolation and a hardened media sandbox. Files are processed on the computer running Node, never uploaded to a third-party conversion service. Twitter fetching contacts X through yt-dlp. Google Fonts is optional; system fallback fonts work offline.

Jobs run sequentially to avoid simultaneous encoders exhausting memory. Job IDs are random UUIDs. Files expire one hour after completion/cancellation. Cancellation kills the active subprocess; a current PDF/Sharp operation may finish before cancellation is acknowledged. Processing has a 30-minute subprocess timeout, and images have a 100-megapixel decode limit. Large PDFs/batches still require enough available RAM/disk. Do not feed untrusted media to an outdated processing stack.

Results are temporary. Restarting the server clears job tracking; temporary directories left by a crash may remain in the OS temp folder. Browser reload loses the visible job state. Progress reflects processing stages, not an exact ETA.

## Verify

```
npm test
npm run build
```

Tests cover invalid ranges, page ordering, size-input validation, post URL restrictions and filename safety. The smoke test generates actual PDF, PNG and MP4 fixtures and processes all four tools through the HTTP API.

Technology references: https://www.ffmpeg.org/ffmpeg-all.html and https://sharp.pixelplumbing.com/api-output/.


Run `npm run test:smoke` while the server is running. `node tests/browser.mjs` runs desktop/mobile UI checks with Microsoft Edge on Windows and writes screenshots to `artifacts/`.

This project uses native media subprocesses and requires a Node host that supports them. It cannot run as a static-only site or in a Cloudflare Worker without a separate media processing service.

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
