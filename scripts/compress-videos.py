#!/usr/bin/env python3
"""
Re-encode videos that cannot reasonably load in Quest Browser over local HTTPS.

360 videos (filename contains _360 or 360_): keep equirectangular resolution + filename.
  Re-encode only if size > 80 MB or bitrate > 8 Mbps.

Other mp4: re-encode if size > 25 MB. Cap long edge at 1280. Keep filename.
"""
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
SKIP_DIRS = {"node_modules", ".git", "tmp", "_compressed"}
LOG = os.path.join(ROOT, "tmp", "video-optimize.jsonl")
os.makedirs(os.path.join(ROOT, "tmp"), exist_ok=True)

# 360s this large cannot load in Quest Browser (GB-scale H.264).
PANO_SIZE = 80 * 1024 * 1024
PANO_BPS = 8_000_000
FLAT_SIZE = 25 * 1024 * 1024


def probe(path):
    out = subprocess.check_output(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration,bit_rate,size:stream=codec_type,codec_name,width,height,bit_rate",
            "-of",
            "json",
            path,
        ],
        text=True,
    )
    data = json.loads(out)
    fmt = data.get("format") or {}
    streams = data.get("streams") or []
    v = next((s for s in streams if s.get("codec_type") == "video"), {})
    a = next((s for s in streams if s.get("codec_type") == "audio"), None)
    return {
        "duration": float(fmt.get("duration") or 0),
        "bit_rate": int(fmt.get("bit_rate") or 0),
        "size": int(fmt.get("size") or os.path.getsize(path)),
        "width": int(v.get("width") or 0),
        "height": int(v.get("height") or 0),
        "vcodec": v.get("codec_name"),
        "has_audio": a is not None,
    }


def is_360(path):
    name = os.path.basename(path).lower()
    return "360" in name


def encode(src, dst, pano, info):
    args = [
        "ffmpeg",
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-stats",
        "-i",
        src,
        "-map",
        "0:v:0",
    ]
    if info["has_audio"]:
        args += ["-map", "0:a:0?"]
    # VideoToolbox is hardware H.264 on macOS — same 4K/equirect resolution, much faster than libx264.
    vbitrate = "8M" if pano else "2.5M"
    args += [
        "-c:v",
        "h264_videotoolbox",
        "-b:v",
        vbitrate,
        "-maxrate",
        "10M" if pano else "3.5M",
        "-bufsize",
        "16M" if pano else "5M",
        "-pix_fmt",
        "yuv420p",
        "-profile:v",
        "high",
        "-movflags",
        "+faststart",
        "-map_metadata",
        "0",
    ]
    if not pano:
        # Keep look; just cap oversized 2D instructional clips.
        w, h = info["width"], info["height"]
        if max(w, h) > 1280:
            args += ["-vf", "scale='if(gt(iw,ih),min(1280,iw),-2)':'if(gt(ih,iw),min(1280,ih),-2)'"]
    if info["has_audio"]:
        args += ["-c:a", "aac", "-b:a", "128k", "-ac", "2"]
    else:
        args += ["-an"]
    args.append(dst)
    subprocess.check_call(args)


def main():
    files = []
    for dirpath, dirnames, filenames in os.walk("."):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for name in filenames:
            if not name.lower().endswith(".mp4"):
                continue
            p = os.path.join(dirpath, name)
            files.append(p)
    files.sort(key=lambda p: -os.path.getsize(p))
    saved = 0
    with open(LOG, "a") as log:
        for p in files:
            rel = p[2:] if p.startswith("./") else p
            before = os.path.getsize(p)
            try:
                info = probe(p)
            except Exception as e:
                row = {"path": rel, "status": "probe-failed", "error": str(e), "before": before}
                log.write(json.dumps(row) + "\n")
                print("PROBE FAIL", rel, e)
                continue
            pano = is_360(p)
            if pano:
                needed = before >= PANO_SIZE or info["bit_rate"] > PANO_BPS
            else:
                needed = before >= FLAT_SIZE
            if not needed:
                print(f"SKIP {rel} ({before/1e6:.1f} MB)")
                log.write(json.dumps({"path": rel, "before": before, "status": "skip-ok"}) + "\n")
                continue
            tmp = p + ".tmp.mp4"
            print(f"ENCODE {'360' if pano else '2D'} {rel}  {before/1e6:.1f} MB  {info['width']}x{info['height']}  {info['bit_rate']//1000} kbps")
            try:
                encode(p, tmp, pano, info)
            except Exception as e:
                print("  FAIL", e)
                if os.path.exists(tmp):
                    os.unlink(tmp)
                log.write(json.dumps({"path": rel, "before": before, "status": "failed", "error": str(e)}) + "\n")
                continue
            after = os.path.getsize(tmp)
            if after < 64 or after >= before * 0.97:
                print(f"  no savings {after/1e6:.1f} MB — keep original")
                os.unlink(tmp)
                log.write(json.dumps({"path": rel, "before": before, "after": after, "status": "skipped-no-savings"}) + "\n")
                continue
            os.replace(tmp, p)
            saved += before - after
            print(f"  {before/1e6:.1f} → {after/1e6:.1f} MB")
            log.write(
                json.dumps(
                    {
                        "path": rel,
                        "before": before,
                        "after": after,
                        "status": "replaced",
                        "pano": pano,
                        "width": info["width"],
                        "height": info["height"],
                    }
                )
                + "\n"
            )
    print(f"Videos saved ~{saved/1e6:.1f} MB")


if __name__ == "__main__":
    sys.exit(main() or 0)
