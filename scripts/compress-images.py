#!/usr/bin/env python3
"""Compress large PNG/JPG in place. Keeps filename + alpha. Does not convert format."""
import json
import os
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

SKIP_DIRS = {"node_modules", ".git", "tmp", "_compressed", "originals"}
EXTS = {".png", ".jpg", ".jpeg"}
MIN_BYTES = int(1.2 * 1024 * 1024)
MAX_EDGE = 2048
JPEG_Q = "4"  # ffmpeg q:v ~ high quality
LOG = os.path.join(ROOT, "tmp", "image-optimize.jsonl")

os.makedirs(os.path.join(ROOT, "tmp"), exist_ok=True)


def has_alpha(path):
    try:
        out = subprocess.check_output(
            ["sips", "-g", "hasAlpha", path], text=True, stderr=subprocess.DEVNULL
        )
        return "yes" in out.lower()
    except Exception:
        return path.lower().endswith(".png")


def dims(path):
    out = subprocess.check_output(
        ["sips", "-g", "pixelWidth", "-g", "pixelHeight", path],
        text=True,
        stderr=subprocess.DEVNULL,
    )
    w = h = 0
    for line in out.splitlines():
        if "pixelWidth" in line:
            w = int(line.split()[-1])
        if "pixelHeight" in line:
            h = int(line.split()[-1])
    return w, h


def run_ffmpeg(args):
    subprocess.check_call(
        ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error"] + args,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def compress_one(path):
    ext = os.path.splitext(path)[1].lower()
    before = os.path.getsize(path)
    w, h = dims(path)
    alpha = has_alpha(path)
    fd, tmp = tempfile.mkstemp(suffix=ext, prefix="imgopt_")
    os.close(fd)
    try:
        vf = f"scale='min({MAX_EDGE},iw)':-2" if ext != ".png" else f"scale='min({MAX_EDGE},iw)':-1"
        if ext in {".jpg", ".jpeg"}:
            run_ffmpeg(["-i", path, "-vf", vf, "-q:v", JPEG_Q, tmp])
        else:
            # Keep PNG (alpha). Resize if huge; zlib-compress.
            args = ["-i", path]
            if max(w, h) > MAX_EDGE:
                args += ["-vf", vf]
            args += ["-compression_level", "9", tmp]
            run_ffmpeg(args)

        after = os.path.getsize(tmp) if os.path.exists(tmp) else before
        if after < 64 or after >= before * 0.98:
            return {
                "path": path,
                "before": before,
                "after": before,
                "status": "skipped-no-savings",
                "w": w,
                "h": h,
                "alpha": alpha,
            }
        os.replace(tmp, path)
        return {
            "path": path,
            "before": before,
            "after": after,
            "status": "replaced",
            "w": w,
            "h": h,
            "alpha": alpha,
        }
    finally:
        if os.path.exists(tmp):
            try:
                os.unlink(tmp)
            except OSError:
                pass


def main():
    files = []
    for dirpath, dirnames, filenames in os.walk("."):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for name in filenames:
            ext = os.path.splitext(name)[1].lower()
            if ext not in EXTS:
                continue
            p = os.path.join(dirpath, name)
            try:
                sz = os.path.getsize(p)
            except OSError:
                continue
            if sz >= MIN_BYTES:
                files.append(p)
    files.sort(key=lambda p: -os.path.getsize(p))
    print(f"Compressing {len(files)} images > {MIN_BYTES} bytes")
    saved = 0
    with open(LOG, "a") as log:
        for p in files:
            try:
                row = compress_one(p)
            except Exception as e:
                row = {"path": p, "status": "failed", "error": str(e)}
                print(f"FAIL {p}: {e}")
            else:
                if row["status"] == "replaced":
                    delta = row["before"] - row["after"]
                    saved += delta
                    print(
                        f"  {row['before']/1e6:.2f}→{row['after']/1e6:.2f} MB  "
                        f"{row['w']}x{row['h']}  {p}"
                    )
                else:
                    print(f"  skip {p} ({row['status']})")
            log.write(json.dumps(row) + "\n")
    print(f"Images saved ~{saved/1e6:.1f} MB  log={LOG}")


if __name__ == "__main__":
    sys.exit(main() or 0)
