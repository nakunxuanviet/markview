# MarkView

> Created by **VietTX5**

A Markdown editor desktop app — **Tauri 2** (Rust backend) + **React/TypeScript** frontend.
It ships as a single native binary: no Python runtime, no sidecar process.

The application lives in [`markview-tauri/`](markview-tauri/README.md) — see that README for
features, development, build and release/auto-update instructions.

## Repository layout

| Path                 | Contents                                               |
| -------------------- | ------------------------------------------------------ |
| `markview-tauri/`    | Tauri 2 app (Rust backend + React/TypeScript frontend) |
| `.github/workflows/` | Release pipeline: signed NSIS build + `latest.json`    |
| `docs/`              | Product spec (`srs.md`)                                |
| `mockups/`           | UI design mockups                                      |

## Quick start

```bash
cd markview-tauri
npm install
npm run tauri dev
```

## License

MIT — see [LICENSE](LICENSE).
