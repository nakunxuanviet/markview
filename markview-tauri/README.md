# MarkView (Tauri)

A Markdown editor desktop app — **Tauri 2** (Rust backend) + **React/TypeScript** frontend.
It ships as a single native binary with no Python runtime and no sidecar process.

## Features

- Multi-tab editing with session restore (per-tab backups)
- Folder sidebar with file tree, context menu CRUD, duplicate, reveal, copy paths
- CodeMirror 6 editor with Markdown syntax highlighting and snippet completions
- Live preview: KaTeX math, Mermaid diagrams, highlight.js code blocks with copy buttons
- Custom `markview://` URI scheme for local preview images (trusted-roots validated)
- Two themes with distinct personalities: **Aurora** (dark) and **Editorial** (light)
- Font pickers with live samples plus optional Ctrl + mouse-wheel zoom (off by default)
- Zen mode, adjustable sidebar/preview split, and a native title bar that follows the theme
- Find & replace (regex, case, whole word), search across files, quick open
- Command palette, outline, diff view ("Compare with Saved" / "Compare with File...")
- Native file watcher with reload banners, image paste into `assets/`, drag & drop
- Auto-backup & crash recovery

## Requirements

- Node.js 18+
- Rust (stable) with the MSVC toolchain
- WebView2 runtime (preinstalled on Windows 10/11)

## Development

```bash
npm install
npm run tauri dev
```

The Vite dev server runs on <http://localhost:1420>; `tauri dev` attaches the desktop shell.

## Build

```bash
npm run tauri build
```

This produces an NSIS installer under `src-tauri/target/release/bundle/nsis/` and the
standalone executable at `src-tauri/target/release/markview.exe`. Because
`bundle.createUpdaterArtifacts` is enabled, the build also emits a `.sig` file next to the
installer when `TAURI_SIGNING_PRIVATE_KEY` is set; the updater reuses the installer itself.

## Releases and auto-update

MarkView checks GitHub Releases at launch, downloads a newer signed build in the
background, then asks for a restart. Dev builds (`tauri dev`) skip the automatic check;
**Settings → About → Check for updates** still reports the manual result.

Publishing a version:

1. Bump the version in `package.json`, `src-tauri/tauri.conf.json` and
   `src-tauri/Cargo.toml` (they must match), then commit.
2. Tag and push:
   ```bash
   git tag v2.0.1
   git push origin v2.0.1
   ```
3. `.github/workflows/release.yml` builds on `windows-latest`, signs the bundles and
   uploads the installer together with `latest.json` to the release.

The repository needs two secrets:

| Secret                               | Value                                                 |
| ------------------------------------ | ----------------------------------------------------- |
| `TAURI_SIGNING_PRIVATE_KEY`          | Contents of `~/.tauri/markview.key` (never commit it) |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Key password; leave empty when the key has none       |

The updater endpoint lives in `src-tauri/tauri.conf.json` under
`plugins.updater.endpoints` and the public key next to it must match the signing key.

## Design system

The UI is one shell with two personalities, driven entirely by CSS custom properties:

| Theme   | Name          | Character                                                    |
| ------- | ------------- | ------------------------------------------------------------ |
| `dark`  | **Aurora**    | Near-black glass, violet accent, pill controls, glow         |
| `light` | **Editorial** | Warm paper, terracotta accent, serif display type, hairlines |

- `src/styles/theme-dark.css` / `theme-light.css` are the token contracts (colors, radii,
  shadows, fonts, semantic surfaces). Components never hardcode theme colors.
- `base.css` owns the shell, panes, status bar, zen/view modes and responsive rules;
  `components.css` owns the app bar, tabs, sidebar, badges and preview typography;
  `overlays.css` owns dialogs, menus, find/search, banners and toasts.
- `theme.ts` applies `body[data-theme="…"]`; light-only structural changes are scoped
  through `body[data-theme="light"]` overrides.
- The shell is `AppBar → TabBar → sidebar + editor/preview → StatusBar`. Icons are inline
  stroke SVGs from `icons.tsx`; the old emoji toolbar was removed.
- CodeMirror colors live in `src/cmTheme.ts`; preview typography is token-driven, with the
  serif display face reserved for headings, quotes, pane titles and the wordmark.
- Mermaid SVGs bake their palette at render time. `PreviewPane` keys the rendered document by
  theme, then renders Mermaid with `theme: "base"` and explicit `--mermaid-*` tokens so edges,
  arrowheads and edge labels stay readable in both Aurora and Editorial.
- The Windows title bar follows the app theme through the Rust `set_window_theme` command.

## Windows integration

- The NSIS installer declares `.md`, `.markdown` and `.mdx` associations, so MarkView appears
  in Explorer's **Open with** menu after installation.
- **Settings → Windows integration → Add "Open with MarkView"** writes a per-user
  `HKCU\Software\Classes\SystemFileAssociations\.md\shell\MarkView` entry (no admin rights).
  The same dialog can remove it again.
- Windows protects the default-handler choice (`UserChoice`); use **Open Default Apps** to pick
  MarkView for `.md` in Windows Settings. The app cannot change that silently by design.
- Launching `markview.exe path\to\note.md` opens the file. A second launch is forwarded to the
  running instance through `tauri-plugin-single-instance`.

## Data locations

Settings and sessions live in `%APPDATA%\MarkView` (shared with the Python build, so existing
settings carry over):

- `settings.json` — appearance, editor options, recent folders/files
- `session.json` — open tabs, order, workspace folder
- `backup/` — per-tab content backups

## Keyboard shortcuts

| Shortcut        | Action               |
| --------------- | -------------------- |
| Ctrl+N          | New file             |
| Ctrl+O          | Open file            |
| Ctrl+Shift+O    | Open folder          |
| Ctrl+S          | Save                 |
| Ctrl+Shift+S    | Save as              |
| Ctrl+W          | Close tab            |
| Ctrl+Shift+W    | Close all tabs       |
| Ctrl+F          | Find                 |
| Ctrl+H          | Replace              |
| Ctrl+Shift+F    | Search in files      |
| Ctrl+P          | Quick open           |
| Ctrl+Shift+P    | Command palette      |
| Ctrl+B / Ctrl+I | Bold / italic        |
| Ctrl+K          | Insert link          |
| Ctrl+\          | Toggle sidebar       |
| Ctrl+Shift+V    | Toggle preview       |
| Ctrl+,          | Settings             |
| Ctrl + wheel    | Zoom in/out (opt-in) |
| F11             | Zen mode             |

## Security model

Every path coming from the webview is checked against a trusted-roots model in Rust:
the app data directory, the current workspace, folders the user opened, files the user
opened, and the `assets` sibling of a trusted file (image writes only). Preview images are
served through the custom protocol after the same validation.
