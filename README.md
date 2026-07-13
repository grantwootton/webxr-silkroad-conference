# Silk Road — WebXR Training Conference Room

Production-ready A-Frame WebXR experience for travel and personal safety training. Deploy as a static site on [Vercel](https://vercel.com).

## Features

- **Conference room** with Draco-ready GLB models and environment lighting
- **Model Viewer** — click IFAK / grab-bag items for drag-rotate, arrow rotate, scroll zoom, info panel, reset, close
- **Albert Thomson** pop-out video (lazy-loaded on first open)
- **360° video dome** — enter via glowing ball; exit returns you to the room
- **Smart Screen** — desktop full-screen iframe of Rise content; VR floating panel with “open in browser”
- **Corridor portals** — hover feedback; “coming soon” toast (modules can be wired later)
- **Quest / Meta Touch** — laser pointer + thumbstick locomotion; reduced shadows in VR

## Quick start

```bash
npm install
npm run dev
```

Open **http://localhost:3000** in a Chromium-based browser (Chrome / Edge).

### HTTPS for Quest / WebXR

Quest Browser requires **HTTPS** (self-signed is fine on a home LAN):

```bash
npm run https:certs   # once (regenerate if your Wi‑Fi IP changes)
npm run https
```

Then on the headset (same Wi‑Fi as this Mac):

1. Open **Quest Browser**
2. Go to `https://<your-mac-lan-ip>:8443` (printed in the terminal)
3. Accept the certificate warning: **Advanced → Proceed** (or equivalent)
4. Tap **Enter VR**

If your Mac’s IP changes, run `npm run https:certs` again so the cert SAN matches.

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` / `npm start` | HTTP static server on port 3000 |
| `npm run https` | HTTPS static server on port 8443 (Quest / WebXR) |
| `npm run https:certs` | Regenerate self-signed `cert.crt` / `cert.key` |
| `npm run compress:models` | Re-run Draco + texture optimize on all `assets/models/*.glb` |

## Deploy on Vercel

1. Push this repo to GitHub (or import the folder in the Vercel dashboard).
2. Framework preset: **Other** (static).
3. Build command: leave empty. Output directory: `.` (project root).
4. Deploy.

`vercel.json` sets long-cache headers for assets and correct content types for `.glb` / `.mp4`. **COOP/COEP are intentionally not enabled** so A-Frame CDN scripts load without CORP failures.

### Size notes

- Hobby plans often limit files to **~100 MB**. Re-encode large videos before deploy (see below).
- `.vercelignore` excludes `node_modules`, duplicate `assets/lib`, and temp compress folders.

## Asset pipeline

Models should use **Draco** mesh compression (decoder path is configured on the scene). Compress with:

```bash
npm run compress:models
```

Videos (example FFmpeg):

```bash
# 360 equirect (smaller for Vercel)
ffmpeg -i assets/videos/360_Demo_360.mp4 \
  -vf "scale=1920:960" -c:v libx264 -b:v 2.8M -c:a aac -b:a 96k \
  -movflags +faststart assets/videos/360_out.mp4

# Talking-head clip
ffmpeg -i assets/videos/albert.mp4 \
  -vf "scale='min(1280,iw)':-2" -c:v libx264 -crf 26 -c:a aac \
  -movflags +faststart assets/videos/albert_out.mp4
```

Corridor JPEGs should stay around **max edge 2048** for Quest texture memory.

## Controls

| Platform | Move | Look / select |
|----------|------|----------------|
| Desktop | W-A-S-D or arrows | Mouse look; click interactables |
| VR | Thumbsticks | Laser + trigger on right controller |

**Escape** closes (in order): Smart Screen overlay → Model Viewer → Albert video → 360 mode.

## Project layout

```
index.html          # Full experience (A-Frame scene + app logic)
vercel.json         # Headers / caching for production
assets/
  models/           # GLB props & room
  videos/           # Albert + 360 dome
  images/           # Corridor frames, logo, carpet
  content/          # Rise “Travel and Personal Safety” package
  sounds/           # Ambient + click
scripts/
  compress-models.js
```

## Quest Pro checklist

1. Deploy over HTTPS (Vercel).
2. Open in **Meta Quest Browser**.
3. Enter VR; confirm laser hits Model Viewer buttons and Smart Screen panel.
4. Open one IFAK item, close, enter 360 briefly, exit.
5. If frame rate drops: ensure models are Draco-compressed and videos are not multi‑GB.

## License

ISC (project scaffolding). Training media and Rise package content remain property of their respective owners.
