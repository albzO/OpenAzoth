# ROG Azoth OLED / device-info protocol

How this was worked out: by watching what the official configurator sends to the keyboard and
replaying exactly those packets. Every command below was verified on real hardware (wired, ROG 2.4G
and Omni receiver). No unknown command numbers were probed and nothing touches firmware updates.

Reference:
- gearlink.asus.com device page `/view/6787/` v1.00.22 (WebHID): `setOledCustomImageBW`,
  `processFrameTo16ColorGrayBytes`, `getKeyboardDeviceInfo`, crop settings `Es=208, Ts=64, Fs=196`

Architecture: the page talks to the keyboard **directly over WebHID**. It falls back to the desktop
companion app (over a local WebSocket) only for some features. Both paths send the same HID packets.

## Interface
| PID | mode | control interface | report ID | data bytes per packet |
|---|---|---|---|---|
| 0x1A83 (6787) | wired | MI_01, usage page 0xFF00 / usage 1 | 0 | 60 |
| 0x1A85 (6789) | ROG 2.4G receiver | usage page 0xFF00 | from the descriptor | 59 if report ID ≠ 0 |
| 0x1ACE | ROG Omni receiver ("unify dongle") | MI_02 Col02, usage page 0xFF00 | 2 | 59 |

Report size: 64 bytes with report ID 0 (65 on Windows including the ID byte); 63 bytes with
report ID 2 on the Omni receiver (64 including the ID byte). Replies echo `cmd sub`.

## Firmware version: `12 00`
Send `12 00`. The reply (counting from the byte after the report ID) is laid out like this:
```
[0]=12 [1]=00 [4..7]=u32 LE ver1  [8]=profile count [9]=effect mode [10]=current profile [11..14]=u32 LE ver2
version string = f"{(v>>16)&0xff:x}.{(v>>8)&0xff:02x}.{v&0xff:02x}"
wired: keyboard = ver1      wireless: dongle = ver1, keyboard = ver2
```
Example (wired): `12 00 00 00 18 00 04 00 06 02 06 ...` gives **4.00.18**.
`23 00` (OLED version in the web code) got no reply from the wired Azoth.

## Custom animation upload: command `0x61`
```
61 01 00 00 <N:u32 LE>                       begin, N = ceil(len/chunk). The keyboard acks with 61 01
61 02 <remaining:u16 LE> <chunk bytes>       repeated N times. remaining runs N-1 down to 0
                                             The keyboard acks with 61 02 <remaining>
61 03 00 00                                  show the uploaded animation. The keyboard acks with 61 03
```

Verified 2026-11-11 on a wired Azoth (fw 4.00.18): 12-frame GIF, 1332 packets, 2.7 s, displayed correctly.
Verified 2026-11-11 through the ROG Omni receiver (PID 0x1ACE, receiver fw 7.00.07): report ID 2,
63-byte reports, 59-byte chunks, 1355 packets in 6.8 s, displayed correctly.
Note: the receiver tested was the Azoth's original 2.4G receiver. After a firmware update it enumerates
as an Omni receiver (0x1A85 -> 0x1ACE). A receiver that hasn't been updated (0x1A85) is untested; Bluetooth is untested.

## Binary format (GRAY)
- The OLED area is **208×64**, 4-bit grayscale (16 levels), 2 pixels per byte.
  The **left pixel goes in the low nibble**. Rows run top to bottom. One frame is 6656 bytes.
- Animated header: `u16 frame_count`, then `u16 duration_ms` for each frame, then the frames back to back.
- Still image header: `01 00 E8 03` (1 frame, 1000 ms).
- Limit: the web UI allows at most 196 frames.

## Other OLED commands seen (not used by the tool)
- `61 00 00 00 <idx>`: select a preset animation 0–5 (SignalRGB plugin, web `setOledPresetImage`)
- `62 ..`: custom banner. `67 ..`: music mode. `21 00`: animation info. `50 55`: save (SignalRGB)

## Power (keyboard) — from the ROG page, verified 2026-11-11 via Omni receiver
| command | meaning | values |
|---|---|---|
| `51 38 00 00 v` | sleep after idle | 0=1 min, 1=2, 2=3, 3=5, 4=10 min, 255=never |
| `51 39 00 00 v` | power saving mode | 0=off, 1=turn off key lighting, 2=dim key lighting |
| `51 3A 00 00 v` | low-battery light warning | 0=never, 10/20/30/40/50 (%) |

`12 01` reply (no report-ID byte): `[5]` battery %, `[6]` idle setting, `[7]` power saving,
`[8]` charging (1), `[9]` low-battery warning %, `[11..12]` u16 — probably battery mV.

Note: `51 37` (used by G-Helper as "low battery") is the **mouse** power-config command in the
ROG code; the Azoth answers it with `ff aa` (rejected).

## Azoth X (experimental) — from the Gear Link page only, NOT verified on hardware
Source: gearlink.asus.com `/view/7204/` v1.00.36 (ROG AZOTH X, model m704).

| PID | mode |
|---|---|
| 0x1C24 (7204) | wired |
| 0x1C25 (7205) | its own 2.4 GHz receiver |
| 7207 | Bluetooth (the page doesn't configure over Bluetooth) |

The page uses the same commands as the Azoth page for lighting, keys, power and OLED, and its
OLED upload panel is 208×64, 16 grey levels, at most 196 frames, uploaded with `0x61` (GRAY).
A 136×97 OLED size table in the shared code lists the Azoth X but is never used. Teardowns
show the same OLED module as the Azoth.

ROG Polling Rate Booster (queried through the keyboard; it is not a HID device the page opens):
```
7D 20 02 00          booster connected?        reply [4] = 1 connected
7D 20 01 00          booster info              reply [4..7] u32 LE firmware, [8..9] VID, [10..11] PID
12 15                polling-rate index        reply [4]: 0=1000 1=2000 2=4000 3=8000 Hz
51 31 00 00 <idx>    set polling rate          the page offers 1000 / 8000 Hz only
```
The page's polling-rate ("Performance") page is hidden unless `7D 20 02 00` reports a Booster.
The knob ("lever") commands (`71 00`–`71 02`, `22 01`, `25 0B`, `25 0C`) are not used by this tool.
