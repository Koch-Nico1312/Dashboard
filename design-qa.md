# Design QA — Ubuntu desktop

Date: 2026-10-16. Final branch: `codex/ubuntu-desktop-final`.

## Source and capture normalization

- Desktop source: `C:/Users/KOCHN_~1/AppData/Local/Temp/codex-clipboard-123848ad-ad1d-45e0-9e5e-4b3c0c0154ab.png`, 2048 × 1366 pixels. Browser chrome removed with crop `(0,88,2048,1366)`, normalized to 1280 × 799 content pixels.
- Settings source: `C:/Users/KOCHN_~1/AppData/Local/Temp/codex-clipboard-30aac474-4b35-44f7-bd6d-65c7d97899b5.png`, 3104 × 1866 pixels. Outer black border and browser chrome removed with crop `(112,180,2992,1719)`, normalized to 1280 × 684 content pixels.
- Implementation: built production assets served by `http://localhost:8090/` and opened in the Codex in-app browser. Signed-in local preview with clearly labeled simulated container data and actual local system metrics.
- Captures use the same 1280 × 799 and 1280 × 684 CSS viewports, with output screenshots normalized to one captured pixel per CSS pixel. No source browser chrome was recreated in the product.
- Mobile check: 390 × 844 CSS pixels. No mobile reference was supplied; this is a responsive usability check.

Evidence directory (local, intentionally outside the Git repository):
`C:/Users/kochn_lrehka5/.codex/visualizations/2026/10/15/01a140c8-9195-79c0-bd63-ec54b2d7a121/`

Full-view comparisons combine source and implementation in a **single image**, rather than relying on separate views:

- `desktop-comparison-before.jpg` — initial density comparison.
- `desktop-comparison-final.jpg` — source and final desktop side by side.
- `settings-comparison.jpg` — initial settings density comparison.
- `settings-comparison-final.jpg` — source and final settings side by side.
- `settings-detail-final.jpg` — 1:1 crop comparison of device information, profile, wallpaper controls, type sizes and card treatment.
- `desktop-final.png`, `settings-final.png`, `mobile-final.png` — browser-rendered evidence.

## Comparison history and fixes

1. **[P2, fixed] Desktop density and obscured search.** Initial content width was 920 px and widgets 158 px tall; the search overlapped the dock at the normalized reference viewport. Reduced the main width to 812 px, widget height to 141 px and app icons to 60 px; tightened header/grid rhythm and dock dimensions. Final DOM check: page height 799 px at a 799 px viewport, search bottom 705.33 px, dock top 719 px. The search and dock are independently accessible.
2. **[P2, fixed] Settings density.** Initial device card and settings rows were taller than the reference, placing too few settings above the fold. Device card reduced to 155 px minimum height, row minimum to 70 px, and header/card spacing tightened. Compared the resulting full window and focused device/profile/wallpaper regions with the normalized source.
3. **[P2, fixed] Dialog accessibility warning.** Removed a custom description ID that bypassed Radix's generated association. Current browser console reports no warnings or errors while using the final build.
4. **[P2, fixed] Small-screen dock clearance.** Added bottom space to the mobile home screen. The modal content scrolls independently; its dock remains at the viewport bottom while the settings content is scrolled. Mobile settings measured 362 px content width in a 362 px content area, with no horizontal overflow.

## Required fidelity surfaces

- **Fonts and typography:** Original Inter font is loaded locally. Centered bold greeting and settings heading retain the reference hierarchy; labels use the existing Umbrel scale. German text, actual display name and time-dependent greeting intentionally replace the English sample content.
- **Spacing and layout:** Six-column, two-row desktop app pages, three widgets, pagination, search and a centered floating dock match the reference structure. Settings retains the large rounded window, left preview/resource column and right device/preferences column. Mobile adapts to four app columns and a single settings column.
- **Colors and tokens:** Exact source wallpaper 18 is reused. Dark translucent widgets/window, neutral borders, muted labels, purple interaction color and original dock assets maintain the existing design language. Progress values and status colors reflect actual values rather than the sample image.
- **Image quality and assets:** The wallpaper, Umbrel logo and dock assets are supplied by the original project. Recognized apps use locally stored brand icons from the upstream Umbrel gallery; Docker and Paperless assets have documented sources and retained license. No generated logos, emoji or handcrafted substitutes were used for branded app imagery. Unknown containers use the Docker brand asset.
- **Copy and app-specific content:** Source examples are replaced with Docker discovery, real server information, stored preferences and optional Web-app shortcuts. The preview explicitly says “Vorschau · Beispiel-Apps”. Unsupported umbrelOS-only Tor, migration and account features are omitted rather than represented as working switches.

## Interaction evidence

Through the browser: sign-in, dock navigation, application search, paging to Vaultwarden/Immich, opening app settings, granting control, simulated stop/start with explicit confirmation, creating a Web-app shortcut, creating a folder, editing the display name and persisting the widgets switch across reload. Settings scrolling and dock accessibility also checked at 390 × 844.

Separately, 13 automated API/state tests pass on Windows and Ubuntu. A real isolated Docker daemon was used to verify discovery, stop/start/restart and label-free management grant/revocation. Preview interactions alone are not used as proof of real Docker operations. Real target-server installation and physical reboot/shutdown remain outside this local verification.

## Findings and accepted differences

No actionable P0/P1/P2 findings remain in the checked views and core flows.

- **Intentional product constraint:** Widgets and settings contain Ubuntu/Docker functionality, not the source's Nostr, Tor, RAID or migration examples. Sample app names/counts and hardware values therefore differ.
- **Intentional asset difference:** The home dock item uses the project's available Umbrel app icon. There are five functional dock destinations; unsupported photo/widget-editor apps from older source versions are not added as decorative controls.
- **[P3] Optional polish:** App ordering is discovery order and names/icons are editable. Drag-and-drop ordering and custom uploaded icons are not part of this implementation.
- **Residual acceptance gap:** Final deployment must be checked with the user's real containers, published app URLs and server/proxy configuration. This does not change the visual QA result for the implemented adapter.

## Implementation checklist

- [x] Source and rendered views captured and normalized.
- [x] Combined full-view and focused comparisons inspected.
- [x] Desktop/search/dock overlap corrected and measured.
- [x] Settings, keyboard-accessible dialogs and small-screen scrolling checked.
- [x] Browser console free of current warnings/errors.
- [x] Real-vs-preview behavior documented.

final result: passed
