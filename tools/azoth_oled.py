#!/usr/bin/env python3
"""
ROG Azoth OLED tool: upload a custom GIF/image, read firmware versions.

Protocol: replays the packets the official configurator sends (not guessed), see docs/PROTOCOL.md.
  * gearlink.asus.com device page for PID 6787 (v1.00.22) -> setOledCustomImageBW,
    processFrameTo16ColorGrayBytes, getKeyboardDeviceInfo, getOLEDVersion

Only these commands are sent (all used by the official software):
  0x12 0x00   get device info (firmware version)          read-only
  0x23 0x00   get OLED version                            read-only
  0x61 0x01   begin custom animation upload (packet count)
  0x61 0x02   animation data packet
  0x61 0x03   switch OLED to show the uploaded animation

Usage:
  python azoth_oled.py list
  python azoth_oled.py version
  python azoth_oled.py convert in.gif out.bin [--preview preview.gif]
  python azoth_oled.py upload in.gif
"""
from __future__ import annotations

import argparse
import struct
import sys
import time

VID = 0x0B05
PID_WIRED = 0x1A83      # 6787
PID_WIRELESS = 0x1A85   # 6789 (ROG 2.4G receiver)
PID_BLE = 0x1A87        # 6791
PID_OMNI = 0x1ACE       # ROG Omni receiver
KNOWN_PIDS = {PID_WIRED: "wired", PID_WIRELESS: "2.4G receiver",
              PID_BLE: "bluetooth", PID_OMNI: "Omni receiver"}
CTRL_USAGE_PAGE = 0xFF00
CTRL_USAGE = 0x01

OLED_W, OLED_H = 208, 64          # crop size used by Gear Link for Azoth (6787)
MAX_FRAMES = 196                   # gifOptions.maxFrames on the Azoth page
FRAME_BYTES = OLED_W * OLED_H // 2  # 4 bpp -> 6656 bytes
REPORT_LEN = 64                    # payload length, excluding report ID

CMD_DEVINFO = 0x12
CMD_OLED_VER = 0x23
CMD_ANIM = 0x61
ANIM_BEGIN, ANIM_DATA, ANIM_SHOW = 0x01, 0x02, 0x03


# --------------------------------------------------------------------------- image

def _to_gray4(img) -> bytes:
    """208x64 L-mode image -> 6656 bytes, 2 px/byte, left pixel in the low nibble,
    rows top->bottom (same as the official web page's packer)."""
    px = img.tobytes()
    out = bytearray(FRAME_BYTES)
    o = 0
    for i in range(0, len(px), 2):
        a = (px[i] * 15 + 127) // 255
        b = (px[i + 1] * 15 + 127) // 255
        out[o] = (b << 4) | a
        o += 1
    return bytes(out)


def _fit(img, mode: str):
    from PIL import Image, ImageOps
    img = img.convert("RGBA")
    bg = Image.new("RGBA", img.size, (0, 0, 0, 255))
    img = Image.alpha_composite(bg, img).convert("RGB")
    if mode == "stretch":
        img = img.resize((OLED_W, OLED_H), Image.LANCZOS)
    elif mode == "fit":   # letterbox, keep aspect
        img = ImageOps.pad(img, (OLED_W, OLED_H), Image.LANCZOS, color=(0, 0, 0))
    else:                 # "crop" (default, like the web cropper): fill and center-crop
        img = ImageOps.fit(img, (OLED_W, OLED_H), Image.LANCZOS)
    return img.convert("L")


def load_frames(path: str, fit: str = "crop", invert: bool = False,
                gamma: float = 1.0, max_frames: int = MAX_FRAMES,
                default_ms: int = 100):
    """Return [(L-image 208x64, duration_ms)], full composited GIF frames."""
    from PIL import Image, ImageOps, ImageSequence
    src = Image.open(path)
    frames = []
    for f in ImageSequence.Iterator(src):
        d = f.info.get("duration", src.info.get("duration", 0)) or default_ms
        g = _fit(f.copy(), fit)
        if gamma != 1.0:
            g = g.point(lambda v: round(255 * (v / 255) ** gamma))
        if invert:
            g = ImageOps.invert(g)
        frames.append((g, int(d)))
    if not frames:
        raise ValueError("no frames in image")
    if len(frames) > max_frames:  # uniform sampling, durations stretched to keep total time
        step = len(frames) / max_frames
        picked = []
        for i in range(max_frames):
            a, b = int(i * step), int((i + 1) * step)
            picked.append((frames[a][0], sum(d for _, d in frames[a:b])))
        frames = picked
    return frames, getattr(src, "is_animated", False)


def build_binary(frames, animated: bool) -> bytes:
    """Header + 4bpp frames.
    animated : u16 frame_count, u16 duration_ms per frame, then frame data
    still    : 01 00 E8 03 (1 frame, 1000 ms), then frame data"""
    if animated or len(frames) > 1:
        hdr = struct.pack("<H", len(frames)) + b"".join(
            struct.pack("<H", max(1, min(d, 0xFFFF))) for _, d in frames)
    else:
        hdr = bytes([1, 0, 0xE8, 0x03])
    return hdr + b"".join(_to_gray4(g) for g, _ in frames)


def save_preview(frames, path: str):
    from PIL import Image
    imgs = [g.point(lambda v: ((v * 15 + 127) // 255) * 17).resize((OLED_W * 3, OLED_H * 3), Image.NEAREST)
            for g, _ in frames]
    if len(imgs) == 1:
        imgs[0].save(path)
    else:
        imgs[0].save(path, save_all=True, append_images=imgs[1:],
                     duration=[d for _, d in frames], loop=0)


# --------------------------------------------------------------------------- HID

def find_ctrl_interfaces():
    import hid
    out = []
    for d in hid.enumerate(VID):
        if d["product_id"] in KNOWN_PIDS and d["usage_page"] == CTRL_USAGE_PAGE \
                and d["usage"] == CTRL_USAGE:
            out.append(d)
    order = [PID_WIRED, PID_WIRELESS, PID_OMNI, PID_BLE]
    out.sort(key=lambda d: order.index(d["product_id"]))
    return out


def _report_id_for(dev, info) -> int:
    """Report ID of the vendor collection. Wired Azoth uses 0 (no IDs).
    For receivers, parse the report descriptor if hidapi exposes it."""
    if info["product_id"] == PID_WIRED:
        return 0
    try:
        desc = bytes(dev.get_report_descriptor())
    except Exception:
        return 0
    # first Report ID item (0x85) after a vendor usage page FF00 (06 00 FF)
    i = desc.find(b"\x06\x00\xff")
    j = desc.find(b"\x85", i if i >= 0 else 0)
    return desc[j + 1] if i >= 0 and j >= 0 and j + 1 < len(desc) else 0


class Azoth:
    def __init__(self, info):
        import hid
        self.info = info
        self.dev = hid.device()
        self.dev.open_path(info["path"])
        self.report_id = _report_id_for(self.dev, info)
        # same rule as Gear Link web: report ID 0 -> 64-byte reports / 60-byte chunks,
        # otherwise (Omni receiver, ID 2) -> 63-byte reports / 59-byte chunks
        self.report_len = REPORT_LEN if self.report_id == 0 else REPORT_LEN - 1
        self.chunk = self.report_len - 4

    def close(self):
        self.dev.close()

    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.close()

    def _write(self, payload: bytes):
        if len(payload) > self.report_len:
            raise ValueError("payload longer than report")
        buf = bytes([self.report_id]) + payload.ljust(self.report_len, b"\0")
        n = self.dev.write(buf)
        if n < 0:
            raise IOError(f"HID write failed: {self.dev.error()}")

    def _read_until(self, prefix: bytes, timeout_ms: int = 3000) -> bytes | None:
        end = time.monotonic() + timeout_ms / 1000
        while True:
            left = int((end - time.monotonic()) * 1000)
            if left <= 0:
                return None
            r = bytes(self.dev.read(REPORT_LEN + 1, max(1, left)))
            if not r:
                continue
            if self.report_id and r[0] == self.report_id:
                r = r[1:]
            if r.startswith(prefix):
                return r

    def _drain(self):
        while self.dev.read(REPORT_LEN + 1, 5):
            pass

    def query(self, cmd: int, sub: int, timeout_ms=1000, retries=2) -> bytes | None:
        self._drain()
        for _ in range(retries):
            self._write(bytes([cmd, sub]))
            r = self._read_until(bytes([cmd, sub]), timeout_ms)
            if r:
                return r
        return None

    # ---- read-only
    @staticmethod
    def _fmt_ver(v: int) -> str:
        if v == 0:
            return ""
        return f"{(v >> 16) & 0xFF:x}.{(v >> 8) & 0xFF:02x}.{v & 0xFF:02x}"

    def versions(self) -> dict:
        r = self.query(CMD_DEVINFO, 0x00)
        if not r or len(r) < 15:
            raise IOError("no response to 0x12 0x00 (device info)")
        v1 = struct.unpack_from("<I", r, 4)[0]
        v2 = struct.unpack_from("<I", r, 11)[0]
        wireless = self.info["product_id"] != PID_WIRED
        res = {
            "raw": r[:16].hex(" "),
            "profiles": r[8], "effect_mode": r[9], "current_profile": r[10],
        }
        if wireless:
            res["keyboard_fw"] = self._fmt_ver(v2)
            res["dongle_fw"] = self._fmt_ver(v1)
        else:
            res["keyboard_fw"] = self._fmt_ver(v1)
        o = self.query(CMD_OLED_VER, 0x00)
        if o and len(o) >= 8:
            res["oled_fw"] = f"{(o[7] << 8 | o[6]):x}.{o[5]:02x}.{o[4]:02x}"
        return res

    # ---- upload
    def upload(self, data: bytes, progress=None):
        n = (len(data) + self.chunk - 1) // self.chunk
        self._drain()
        self._write(bytes([CMD_ANIM, ANIM_BEGIN, 0, 0]) + struct.pack("<I", n))
        if self._read_until(bytes([CMD_ANIM, ANIM_BEGIN]), 3000) is None:
            raise IOError("no ack for upload begin (0x61 0x01)")
        for i in range(n):
            remaining = n - 1 - i
            part = data[i * self.chunk:(i + 1) * self.chunk]
            idx = struct.pack("<H", remaining)
            self._write(bytes([CMD_ANIM, ANIM_DATA]) + idx + part)
            ack = None
            for _ in range(5):
                ack = self._read_until(bytes([CMD_ANIM, ANIM_DATA]), 3000)
                if ack is None or ack[2:4] == idx:
                    break
            if ack is None or ack[2:4] != idx:
                raise IOError(f"bad/missing ack for packet {i} (remaining {remaining}); "
                              "upload aborted, OLED may keep the previous animation")
            if progress:
                progress(i + 1, n)
        self._write(bytes([CMD_ANIM, ANIM_SHOW, 0, 0]))
        if self._read_until(bytes([CMD_ANIM, ANIM_SHOW]), 3000) is None:
            raise IOError("no ack for show (0x61 0x03)")
        return n


def open_device(pid: int | None):
    devs = find_ctrl_interfaces()
    if pid is not None:
        devs = [d for d in devs if d["product_id"] == pid]
    if not devs:
        sys.exit("No ROG Azoth control interface (usage page 0xFF00) found. "
                 "Is the keyboard connected? Try `list`.")
    return Azoth(devs[0])


# --------------------------------------------------------------------------- CLI

def _progress(i, n):
    if i == n or i % 20 == 0:
        print(f"\r  {i}/{n} packets ({i * 100 // n}%)", end="" if i < n else "\n", flush=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--pid", type=lambda s: int(s, 0), help="force PID, e.g. 0x1A83")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("list", help="list Azoth HID control interfaces")
    sub.add_parser("version", help="read firmware versions")
    for name in ("convert", "upload"):
        p = sub.add_parser(name)
        p.add_argument("image", help="GIF / PNG / JPG")
        if name == "convert":
            p.add_argument("out", help="output .bin")
        p.add_argument("--fit", choices=["crop", "fit", "stretch"], default="crop",
                       help="how to map onto 208x64 (default crop)")
        p.add_argument("--invert", action="store_true")
        p.add_argument("--gamma", type=float, default=1.0, help="<1 brighter, >1 darker")
        p.add_argument("--max-frames", type=int, default=MAX_FRAMES)
        p.add_argument("--preview", help="also write an upscaled 16-gray preview (gif/png)")
        if name == "upload":
            p.add_argument("-y", "--yes", action="store_true", help="don't ask for confirmation")
    a = ap.parse_args()

    if a.cmd == "list":
        devs = find_ctrl_interfaces()
        if not devs:
            print("none found")
        for d in devs:
            print(f"{d['product_id']:04X} {KNOWN_PIDS[d['product_id']]:14} "
                  f"if={d['interface_number']} {d['product_string']}  {d['path'].decode(errors='replace')}")
        return

    if a.cmd == "version":
        with open_device(a.pid) as kb:
            print(f"device : {kb.info['product_string']} ({KNOWN_PIDS[kb.info['product_id']]}, "
                  f"report id {kb.report_id})")
            for k, v in kb.versions().items():
                print(f"{k:15}: {v}")
        return

    frames, animated = load_frames(a.image, a.fit, a.invert, a.gamma, min(a.max_frames, MAX_FRAMES))
    blob = build_binary(frames, animated)
    total_ms = sum(d for _, d in frames)
    print(f"{len(frames)} frame(s), {total_ms} ms loop, {len(blob)} bytes")
    if a.preview:
        save_preview(frames, a.preview)
        print(f"preview -> {a.preview}")

    if a.cmd == "convert":
        with open(a.out, "wb") as f:
            f.write(blob)
        print(f"binary  -> {a.out}")
        return

    with open_device(a.pid) as kb:
        n = (len(blob) + kb.chunk - 1) // kb.chunk
        print(f"target : {kb.info['product_string']} ({KNOWN_PIDS[kb.info['product_id']]}), "
              f"{n} packets of {kb.chunk} bytes")
        if not a.yes and input("upload? [y/N] ").strip().lower() != "y":
            return
        t = time.monotonic()
        kb.upload(blob, _progress)
        print(f"done in {time.monotonic() - t:.1f}s")


if __name__ == "__main__":
    main()
