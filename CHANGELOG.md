# Changelog

All notable changes to OpenAzoth (called Crateless up to 0.2.0). Versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Site icon (favicon), shown in the browser tab and when the page is saved to a phone's home screen.

## [0.2.1] - 2026-11-12

### Changed

- **Renamed from Crateless to OpenAzoth**, since other projects share the old name. The site is now at https://albzo.github.io/OpenAzoth/ and the repository at https://github.com/albzO/OpenAzoth. Settings and the image library saved in the browser are kept.
- The page title and description say what the site is (ROG Azoth web configurator, no Armoury Crate), and the page has Open Graph and structured data plus a sitemap, so search engines can find it.

## [0.2.0] - 2026-11-12

### Added

- **OLED canvas editor** (new *Canvas* page in the sidebar, works without a keyboard connected):
  - Put several images / GIFs on the 208×64 screen as layers: drag to move, corner handles to scale, the top handle to rotate (Shift snaps to 15°), mouse wheel to zoom, arrow keys to nudge.
  - Per layer: opacity, gamma, invert, horizontal / vertical mirror (also `H` / `V`), Fill / Fit / Centre, show / hide, reorder.
  - Timeline: drag a layer's bar to move it, its edges to trim; GIF layers also have speed and a start point. Set the total length and frame interval; the output is kept within the keyboard's 196-frame limit, and identical frames are merged.
  - Live preview at the real 16 grey levels. Upload to the current profile, save to the image library, or download as a GIF.
  - The project is saved in the browser and comes back after a reload.
- **Image library**: save the current OLED image (with its position, gamma and invert settings) to a library shared by every keyboard and profile on this computer. One click puts a saved image back on the current profile, or puts it back and uploads it.
- "Open in canvas editor" button on the OLED image panel.

## [0.1.0] - 2026-11-12

First public release.

### Added

- Connect over WebHID (cable, 2.4 GHz receiver or Omni receiver), with automatic reconnection.
- Lighting: all 10 effects with the same options as the official tool, live keyboard preview.
- OLED screen: built-in presets, image / GIF upload (16 grey levels, up to 196 frames), custom banner, date & time, on / off and brightness.
- Key mapping to keys, media keys and mouse buttons.
- Sync recorded settings back to the keyboard; factory reset of lighting, key mapping or profiles.
- Power: low-battery warning, power saving, sleep timeout.
- Live status: firmware, battery, receiver, active profile.
- Chinese and English interface.

[Unreleased]: https://github.com/albzO/OpenAzoth/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/albzO/OpenAzoth/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/albzO/OpenAzoth/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/albzO/OpenAzoth/releases/tag/v0.1.0
