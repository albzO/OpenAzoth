# Crateless

**English** · [中文](README.zh-CN.md)

**Open it:** https://albzo.github.io/Crateless/

> Configure your ROG Azoth without installing a crate full of software.

Crateless is a **web page** for the ROG Azoth keyboard: open it, click *Connect keyboard*, and change lighting, the OLED screen, key mapping and power settings. Nothing to install, nothing running in the background.

**Unofficial. Not affiliated with or endorsed by ASUS.** "ROG" and "Azoth" are trademarks of their respective owners and are used only to say which device this works with.

**Supported device:** the original ROG Azoth only (wired, its 2.4 GHz receiver, or an Omni receiver). Not the Azoth Extreme, Azoth X or Azoth 96 HE.

## Why

For the Azoth, the official web configurator runs in "Legacy Mode": you have to install a desktop companion before you can change any setting. While it runs, that companion is **7 background processes and about 136 MB of private memory**, plus a kernel filter driver and a tray app.

The settings live in the keyboard itself. A browser can send them over WebHID directly.

## Features

| | |
|---|---|
| Lighting | All 10 effects with the same options as the official page (colors, gradient, background, brightness, speed, width, direction); changes apply instantly |
| OLED | Built-in presets, upload a GIF/image (16 grey levels, up to 196 frames), custom banner, date & time, on/off and brightness |
| Key mapping | Remap any key to another key, a media key or a mouse button; written instantly |
| Power | Low-battery warning, power saving, sleep timeout (current values read from the keyboard) |
| Sync settings | Write everything recorded here back to the keyboard (one profile or all six) |
| Reset | Factory-reset lighting, key mapping, one profile or all profiles |
| Status | Firmware, battery / charging / voltage, receiver, active profile, updated live |
| Languages | 中文 / English |

**Not supported:** system info, music visualizer, system notifications, software macros. They need a program running on the computer, which a web page can't provide.

## Use

- Browser: **desktop Chrome or Edge** (WebHID is required).
- The first time, click *Connect keyboard* and pick ROG AZOTH (cable) or ROG OMNI RECEIVER (wireless). After that it connects automatically.
- The keyboard can't report key maps, lighting colors or OLED content, so the page keeps what you set in the browser, per keyboard (by serial number) and per profile.

## Development

```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm test           # protocol and image-processing unit tests
npm run build      # outputs dist/
```

```
src/
  hid/            WebHID transport (device-agnostic): send/ack/queue, chunked upload, discovery
  devices/azoth/  Azoth protocol as pure functions: info, lighting, keys, OLED, power
  media/          image processing: GIF decode, 16-level grey, banner text layout
  state/          app state (@preact/signals): connection & live status, per-profile settings, actions, sync
  i18n/           dictionaries (zh, en) and labels for protocol values
  ui/             Preact components
tests/            unit tests (expected bytes come from real keyboard traffic)
tools/            Python CLI, local artwork extraction script
docs/PROTOCOL.md  protocol notes
```

Dependencies only point one way: `ui → state → devices → hid`. The protocol layer touches no browser APIs, so it is tested without a keyboard. To add a language, add a dictionary next to `src/i18n/en.ts`; the type checker lists any missing keys.

### Vendor artwork

The banner patterns and preset-animation previews are ASUS artwork and are **not in this repository**. The deploy workflow downloads the still images (banner strips and one frame per preset) at build time; without them the page draws approximations. For the full animated previews locally, run:

```bash
python tools/fetch_rog_banners.py
```

Files go to `public/rog-assets/`, which is git-ignored. The keyboard always shows its own built-in originals.

## License

MIT
