
# TÀI LIỆU YÊU CẦU & THIẾT KẾ — MARKDOWN EDITOR DESKTOP APP

---

## PHẦN 1: TÀI LIỆU YÊU CẦU (Software Requirements Specification)

---

### 1.1 Tổng quan dự án

**Tên sản phẩm:** MarkView (hoặc tên bạn chọn)

**Mô tả:** Ứng dụng desktop nhẹ, chuyên mở, chỉnh sửa và preview file Markdown. Lấy cảm hứng từ Notepad++ (multi-tab, folder workspace, session restore) kết hợp Typora (live preview đẹp) và Obsidian (folder-based workflow).

**Công nghệ:** Python + pywebview + HTML/CSS/JS

**Nền tảng mục tiêu:** Windows (ưu tiên), macOS, Linux

**Ngôn ngữ giao diện:** Tiếng Anh (mặc định), hỗ trợ mở rộng i18n sau

---

### 1.2 Đối tượng người dùng

| Đối tượng | Nhu cầu chính |
|---|---|
| Developer | Viết README, docs, ghi chú kỹ thuật, preview nhanh |
| Writer/Blogger | Viết bài dạng Markdown, export HTML/PDF |
| Student | Ghi chú bài giảng, tổ chức theo thư mục |
| Người dùng phổ thông | Thay thế Notepad cho file .md, cần app nhẹ nhanh |

---

### 1.3 Yêu cầu phi chức năng (Non-Functional Requirements)

| ID | Yêu cầu | Mục tiêu |
|---|---|---|
| NFR-01 | RAM idle | ≤ 80MB (1 tab), ≤ 150MB (10 tab) |
| NFR-02 | Thời gian khởi động | ≤ 1.5 giây (cold start) |
| NFR-03 | Kích thước installer | ≤ 30MB |
| NFR-04 | Thời gian render preview | ≤ 200ms cho file ≤ 50KB |
| NFR-05 | Cross-platform | Windows 10+, macOS 12+, Ubuntu 22.04+ |
| NFR-06 | Offline | Hoạt động 100% không cần internet |
| NFR-07 | File size hỗ trợ | Mở mượt file markdown ≤ 5MB |

---

### 1.4 Yêu cầu chức năng (Functional Requirements)

#### 1.4.1 — FOLDER SIDEBAR (Left Panel)

| ID | Tính năng | Mô tả chi tiết | Độ ưu tiên |
|---|---|---|---|
| FS-01 | Open Folder | Mở folder qua File menu hoặc drag & drop folder vào app. Hiển thị toàn bộ cây thư mục ở sidebar trái | P0 |
| FS-02 | File Tree View | Hiển thị dạng cây phân cấp: folder > subfolder > file. Chỉ hiển thị file markdown (`.md`, `.markdown`, `.mdx`, `.txt` — configurable) và folder. Ẩn file hệ thống/hidden file (configurable) | P0 |
| FS-03 | Expand/Collapse | Click chevron (▶/▼) để mở rộng hoặc thu gọn thư mục con | P0 |
| FS-04 | Click to Open | Single-click: preview file (không tạo tab mới, dùng tab tạm). Double-click: mở file vào tab cố định (giống VS Code) | P0 |
| FS-05 | New File | Right-click folder → "New File" → nhập tên → tạo file `.md` mới trong folder đó | P0 |
| FS-06 | New Folder | Right-click folder → "New Folder" → nhập tên → tạo subfolder | P0 |
| FS-07 | Rename | Right-click file/folder → "Rename" → inline edit tên. Tự động cập nhật tab nếu file đang mở | P0 |
| FS-08 | Delete | Right-click → "Delete" → confirm dialog → chuyển vào Recycle Bin/Trash (không xóa vĩnh viễn) | P0 |
| FS-09 | Duplicate/Clone | Right-click file → "Duplicate" → tạo bản copy tên `filename (copy).md` cùng thư mục | P1 |
| FS-10 | Move (Drag & Drop) | Kéo thả file/folder trong tree để di chuyển. Cập nhật tab path nếu file đang mở | P1 |
| FS-11 | Copy Path | Right-click → "Copy Full Path" / "Copy Relative Path" vào clipboard | P1 |
| FS-12 | Reveal in Explorer | Right-click → "Show in File Explorer" mở thư mục chứa file trong OS file manager | P1 |
| FS-13 | Search in Folder | Thanh search ở đầu sidebar, fuzzy search tên file trong toàn bộ folder tree | P1 |
| FS-14 | Sort Files | Sắp xếp theo: tên (A-Z, Z-A), ngày sửa đổi, ngày tạo. Folder luôn hiển thị trước file (configurable) | P2 |
| FS-15 | Filter by Extension | Toggle hiển thị/ẩn từng loại file: `.md`, `.txt`, `.mdx` | P2 |
| FS-16 | Auto Refresh | Tự động cập nhật tree khi file/folder thay đổi bên ngoài (dùng file watcher) | P1 |
| FS-17 | Resize Sidebar | Kéo đường viền giữa sidebar và editor để thay đổi độ rộng. Có thể toggle ẩn/hiện sidebar | P0 |
| FS-18 | Recent Folders | Lưu danh sách folder đã mở gần đây, hiển thị khi chưa mở folder nào | P1 |
| FS-19 | Pin Folder | Pin folder hay dùng lên đầu danh sách Recent | P2 |

#### 1.4.2 — TAB SYSTEM

| ID | Tính năng | Mô tả | Độ ưu tiên |
|---|---|---|---|
| TB-01 | Multi-tab | Mở nhiều file cùng lúc, mỗi file một tab | P0 |
| TB-02 | Tab hiển thị tên file | Hiển thị filename, tooltip hiện full path | P0 |
| TB-03 | Modified indicator | Chấm tròn hoặc biểu tượng trên tab khi file chưa lưu | P0 |
| TB-04 | Close tab | Nút ✕ trên tab, middle-click, hoặc Ctrl+W | P0 |
| TB-05 | Close confirm | Hỏi Save/Don't Save/Cancel khi đóng tab chưa lưu | P0 |
| TB-06 | Tab context menu | Right-click tab: Close, Close Others, Close All, Close to the Right, Copy Path, Reveal in Sidebar | P1 |
| TB-07 | Tab reorder | Drag & drop tab để sắp xếp lại thứ tự | P1 |
| TB-08 | Tab scroll | Khi nhiều tab, tab bar có thể scroll ngang. Hiển thị nút ◀ ▶ hoặc scroll bằng chuột | P1 |
| TB-09 | Preview tab | Single-click từ sidebar mở tab tạm (chữ nghiêng). Double-click hoặc bắt đầu edit → chuyển thành tab cố định (giống VS Code) | P1 |
| TB-10 | Keyboard switch | Ctrl+Tab: tab tiếp. Ctrl+Shift+Tab: tab trước. Ctrl+1-9: chuyển đến tab thứ N | P0 |

#### 1.4.3 — EDITOR

| ID | Tính năng | Mô tả | Độ ưu tiên |
|---|---|---|---|
| ED-01 | Markdown syntax highlighting | Highlight heading, bold, italic, link, code, list... với màu khác nhau | P0 |
| ED-02 | Line numbers | Hiển thị số dòng bên trái (toggle on/off) | P0 |
| ED-03 | Word wrap | Tự xuống dòng khi quá dài (toggle on/off) | P0 |
| ED-04 | Find & Replace | Ctrl+F mở search bar. Ctrl+H mở replace. Hỗ trợ regex, case sensitive, whole word | P0 |
| ED-05 | Undo / Redo | Ctrl+Z / Ctrl+Y. Unlimited undo per tab | P0 |
| ED-06 | Auto-indent | Giữ indent khi xuống dòng mới | P1 |
| ED-07 | Bracket auto-close | Tự đóng `()`, `[]`, `{}`, `` ` ` ``, `""`, `**` | P1 |
| ED-08 | Tab to spaces | Phím Tab chèn spaces (configurable: 2 hoặc 4) | P1 |
| ED-09 | Code folding | Thu gọn heading sections, code blocks | P2 |
| ED-10 | Minimap | Preview thu nhỏ của toàn bộ document ở cạnh phải editor | P2 |
| ED-11 | Drag & drop image | Kéo ảnh vào editor → tự copy vào `./assets/` → chèn `![](assets/img.png)` | P1 |
| ED-12 | Paste image | Ctrl+V ảnh từ clipboard → tự lưu → chèn link | P2 |
| ED-13 | Smart link paste | Chọn text → Ctrl+V URL → tự tạo `[text](url)` | P1 |
| ED-14 | Formatting toolbar | Nút Bold, Italic, Strikethrough, Code, Link, Image, Heading, List, Quote, Table, HR | P0 |
| ED-15 | Keyboard shortcuts formatting | Ctrl+B (bold), Ctrl+I (italic), Ctrl+K (link), Ctrl+Shift+K (code) | P0 |
| ED-16 | Go to Line | Ctrl+G → nhập số dòng → nhảy đến | P1 |

#### 1.4.4 — PREVIEW

| ID | Tính năng | Mô tả | Độ ưu tiên |
|---|---|---|---|
| PV-01 | Live preview | Render markdown → HTML realtime khi gõ (debounce 150ms) | P0 |
| PV-02 | Split view | Chia đôi: editor bên trái, preview bên phải. Kéo để resize | P0 |
| PV-03 | Preview only mode | Toggle xem chỉ preview (ẩn editor) | P1 |
| PV-04 | Editor only mode | Toggle xem chỉ editor (ẩn preview) | P1 |
| PV-05 | Scroll sync | Cuộn editor → preview cuộn theo tương ứng và ngược lại | P1 |
| PV-06 | Code syntax highlight | Code block trong preview có highlight màu (highlight.js) | P0 |
| PV-07 | Mermaid diagrams | Render flowchart, sequence diagram, pie chart... trong preview | P2 |
| PV-08 | Math/LaTeX | Render công thức toán `$...$` và `$$...$$` (KaTeX) | P2 |
| PV-09 | Image preview | Hiển thị ảnh local và remote trong preview | P0 |
| PV-10 | Table render | Render markdown table thành HTML table đẹp | P0 |
| PV-11 | Checkbox | Render `- [ ]` / `- [x]` thành checkbox | P0 |
| PV-12 | Click link | Click link trong preview → mở bằng trình duyệt mặc định | P0 |

#### 1.4.5 — SESSION & BACKUP

| ID | Tính năng | Mô tả | Độ ưu tiên |
|---|---|---|---|
| SS-01 | Session restore | Khi mở app, khôi phục tất cả tab đang mở, active tab, folder đang mở | P0 |
| SS-02 | Cursor & scroll restore | Khôi phục vị trí con trỏ và scroll position từng tab | P0 |
| SS-03 | Unsaved content backup | Nội dung chưa lưu được ghi vào thư mục backup mỗi 5s | P0 |
| SS-04 | Crash recovery | Nếu app bị crash, mở lại vẫn khôi phục được toàn bộ nội dung | P0 |
| SS-05 | Remember folder | Nhớ folder đã mở lần trước, tự mở lại khi khởi động | P0 |
| SS-06 | Auto-save file | Tự lưu file đã có path mỗi N giây (configurable, default 30s, có thể tắt) | P1 |

#### 1.4.6 — FILE OPERATIONS

| ID | Tính năng | Mô tả | Độ ưu tiên |
|---|---|---|---|
| FO-01 | New file | Ctrl+N tạo tab mới trống | P0 |
| FO-02 | Open file | Ctrl+O mở dialog chọn file | P0 |
| FO-03 | Open folder | Ctrl+Shift+O mở dialog chọn folder → hiển thị trong sidebar | P0 |
| FO-04 | Save | Ctrl+S lưu file hiện tại | P0 |
| FO-05 | Save As | Ctrl+Shift+S lưu với tên/vị trí mới | P0 |
| FO-06 | Export HTML | Menu: Export → HTML. Xuất file HTML có CSS đẹp | P1 |
| FO-07 | Export PDF | Menu: Export → PDF. Xuất file PDF | P1 |
| FO-08 | File change detection | Phát hiện file bị sửa bên ngoài → hỏi "File changed. Reload?" | P1 |
| FO-09 | Recent files | Menu: File → Recent Files (20 file gần đây) | P1 |
| FO-10 | Quick open | Ctrl+P → fuzzy search tên file trong folder → Enter để mở | P1 |
| FO-11 | Search in files | Ctrl+Shift+F → tìm text trong tất cả file của folder | P2 |

#### 1.4.7 — APPEARANCE & SETTINGS

| ID | Tính năng | Mô tả | Độ ưu tiên |
|---|---|---|---|
| AP-01 | Dark theme | Theme tối mặc định (Catppuccin / One Dark style) | P0 |
| AP-02 | Light theme | Theme sáng | P0 |
| AP-03 | Theme switch | Toggle giữa dark/light. Lưu vào settings | P0 |
| AP-04 | Font size | Thay đổi cỡ chữ editor. Ctrl+= zoom in, Ctrl+- zoom out, Ctrl+0 reset | P0 |
| AP-05 | Font family | Chọn font cho editor (monospace) và preview (sans-serif) | P1 |
| AP-06 | Settings panel | UI cài đặt: theme, font, auto-save, tab size, word wrap, extensions hiển thị... | P1 |
| AP-07 | Persist settings | Lưu settings vào `settings.json`, load lại khi mở app | P0 |

#### 1.4.8 — MISC

| ID | Tính năng | Mô tả | Độ ưu tiên |
|---|---|---|---|
| MI-01 | Status bar | Hiển thị: dòng/cột, số từ, số ký tự, encoding, loại file | P0 |
| MI-02 | Document outline | Panel hiển thị danh sách heading (TOC), click nhảy đến | P1 |
| MI-03 | Zen mode | F11 full screen, ẩn hết sidebar/toolbar, chỉ editor + preview | P2 |
| MI-04 | Keyboard shortcut list | Ctrl+? hoặc Help → hiển thị danh sách phím tắt | P2 |
| MI-05 | Drag & drop file vào app | Kéo file `.md` từ Explorer vào app → mở tab mới | P1 |
| MI-06 | Command palette | Ctrl+Shift+P → gõ tìm lệnh (giống VS Code) | P2 |

---

### 1.5 Tổng hợp phím tắt

| Phím tắt | Chức năng |
|---|---|
| `Ctrl+N` | Tạo file mới |
| `Ctrl+O` | Mở file |
| `Ctrl+Shift+O` | Mở folder |
| `Ctrl+S` | Lưu |
| `Ctrl+Shift+S` | Lưu thành |
| `Ctrl+W` | Đóng tab |
| `Ctrl+Shift+W` | Đóng tất cả tab |
| `Ctrl+Tab` | Tab kế tiếp |
| `Ctrl+Shift+Tab` | Tab trước |
| `Ctrl+1-9` | Nhảy đến tab thứ N |
| `Ctrl+P` | Quick open (fuzzy search file) |
| `Ctrl+Shift+P` | Command palette |
| `Ctrl+F` | Find |
| `Ctrl+H` | Find & Replace |
| `Ctrl+Shift+F` | Search in files |
| `Ctrl+G` | Go to line |
| `Ctrl+B` | Bold |
| `Ctrl+I` | Italic |
| `Ctrl+K` | Insert link |
| `Ctrl+Shift+K` | Inline code |
| `Ctrl+=` / `Ctrl+-` | Zoom in / out |
| `Ctrl+0` | Reset zoom |
| `Ctrl+\` | Toggle sidebar |
| `Ctrl+Shift+V` | Toggle preview |
| `F11` | Zen mode / Fullscreen |
| `Ctrl+Z` / `Ctrl+Y` | Undo / Redo |

---

## PHẦN 2: TÀI LIỆU THIẾT KẾ (Design Document)

---

### 2.1 Kiến trúc tổng thể

```
┌─────────────────────────────────────────────────────────────────────┐
│                        PYWEBVIEW WINDOW                             │
│                     (OS Native WebView)                             │
│                                                                     │
│  ┌────── UI LAYER (HTML/CSS/JS) ──────────────────────────────────┐ │
│  │                                                                 │ │
│  │  ┌─────────┬─────────────────────────────────────────────────┐ │ │
│  │  │ SIDEBAR │              TAB BAR                             │ │ │
│  │  │         │  [file1.md ✕] [file2.md● ✕] [notes.md ✕] [+]  │ │ │
│  │  │ 📁 docs ├─────────────────────┬───────────────────────────┤ │ │
│  │  │  📄 a.md│                     │                           │ │ │
│  │  │  📄 b.md│     EDITOR          │      PREVIEW              │ │ │
│  │  │ 📁 notes│   (CodeMirror 6)    │    (Rendered HTML)        │ │ │
│  │  │  📄 c.md│                     │                           │ │ │
│  │  │         │                     │    highlight.js            │ │ │
│  │  │ ──────  │                     │    mermaid.js              │ │ │
│  │  │ 🔍search│                     │    katex.js                │ │ │
│  │  │         │                     │                           │ │ │
│  │  └─────────┴─────────────────────┴───────────────────────────┤ │ │
│  │  │ STATUS BAR: Ln 42, Col 15 | 1,234 words | UTF-8 | Dark   │ │ │
│  │  └───────────────────────────────────────────────────────────┘ │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                              ▲                                       │
│                     JS ←→ Python API                                 │
│                              ▼                                       │
│  ┌────── BACKEND LAYER (Python) ──────────────────────────────────┐ │
│  │                                                                 │ │
│  │   FileManager          SessionManager        SettingsManager    │ │
│  │   - open/save/delete   - save_session()      - load/save       │ │
│  │   - rename/move        - load_session()      - get/set         │ │
│  │   - list_directory()   - auto_backup()                         │ │
│  │   - watch_changes()    - crash_recovery()    MarkdownRenderer  │ │
│  │   - search_in_files()                        - render()        │ │
│  │                                              - export_html()   │ │
│  │   FolderManager                              - export_pdf()    │ │
│  │   - get_tree()                                                  │ │
│  │   - create_file()                                               │ │
│  │   - create_folder()                                             │ │
│  │   - delete_item()                                               │ │
│  │   - rename_item()                                               │ │
│  │   - duplicate_item()                                            │ │
│  │   - move_item()                                                 │ │
│  │                                                                 │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                              ▼                                       │
│                    LOCAL FILESYSTEM                                   │
│                                                                     │
│   📁 User's Project Folder        📁 %APPDATA%/MarkView/           │
│   ├── 📄 README.md                ├── session.json                  │
│   ├── 📄 notes.md                 ├── settings.json                 │
│   └── 📁 docs/                    └── 📁 backup/                    │
│       ├── 📄 guide.md                 ├── tab_1.md                  │
│       └── 📄 api.md                   └── tab_2.md                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

### 2.2 Cấu trúc thư mục dự án

```
📁 markview/
│
├── 📄 main.py                     ← Entry point, khởi tạo pywebview
│
├── 📁 backend/                    ← Python backend modules
│   ├── 📄 __init__.py
│   ├── 📄 api.py                  ← Class chính expose cho JS (js_api)
│   ├── 📄 file_manager.py         ← Đọc/ghi/watch file
│   ├── 📄 folder_manager.py       ← Thao tác folder tree (CRUD file/folder)
│   ├── 📄 session_manager.py      ← Session save/restore/backup
│   ├── 📄 settings_manager.py     ← Load/save settings
│   ├── 📄 markdown_renderer.py    ← Parse markdown → HTML
│   ├── 📄 exporter.py             ← Export PDF/HTML
│   └── 📄 utils.py                ← Helper functions
│
├── 📁 ui/                         ← Frontend (HTML/CSS/JS)
│   ├── 📄 index.html              ← Main HTML shell
│   ├── 📁 css/
│   │   ├── 📄 main.css            ← Layout chính
│   │   ├── 📄 sidebar.css         ← File tree styles
│   │   ├── 📄 tabs.css            ← Tab bar styles
│   │   ├── 📄 editor.css          ← Editor panel styles
│   │   ├── 📄 preview.css         ← Preview panel styles
│   │   ├── 📄 theme-dark.css      ← Dark theme variables
│   │   └── 📄 theme-light.css     ← Light theme variables
│   ├── 📁 js/
│   │   ├── 📄 app.js              ← Main app init & state
│   │   ├── 📄 api.js              ← Abstraction layer gọi Python
│   │   ├── 📄 sidebar.js          ← File tree logic
│   │   ├── 📄 tabs.js             ← Tab management
│   │   ├── 📄 editor.js           ← Editor setup (CodeMirror)
│   │   ├── 📄 preview.js          ← Preview render logic
│   │   ├── 📄 shortcuts.js        ← Keyboard shortcut handler
│   │   ├── 📄 statusbar.js        ← Status bar updates
│   │   ├── 📄 search.js           ← Find & Replace logic
│   │   ├── 📄 context-menu.js     ← Right-click menus
│   │   └── 📄 session.js          ← Session save/restore JS side
│   └── 📁 vendor/                 ← Third-party JS libs (bundled offline)
│       ├── 📁 codemirror/         ← CodeMirror 6 core + plugins
│       ├── 📄 highlight.min.js    ← Code syntax highlight
│       ├── 📄 mermaid.min.js      ← Diagram rendering
│       └── 📄 katex.min.js        ← Math rendering
│
├── 📁 assets/                     ← App icons, images
│   ├── 📄 icon.ico
│   ├── 📄 icon.png
│   └── 📄 logo.svg
│
├── 📁 build/                      ← Build scripts
│   ├── 📄 build_windows.py        ← Nuitka/PyInstaller config
│   ├── 📄 build_macos.py
│   └── 📄 build_linux.py
│
├── 📄 requirements.txt            ← Python dependencies
├── 📄 README.md
└── 📄 LICENSE
```

---

### 2.3 Python Backend — Module Design

#### `api.py` — Main API Class

```python
class MarkViewAPI:
    """
    Lớp chính expose cho pywebview js_api.
    Mọi method public đều gọi được từ JS qua pywebview.api.xxx()
    """

    # === FOLDER ===
    def open_folder(self) -> dict               # Mở dialog chọn folder
    def get_folder_tree(self, path) -> list      # Trả về cây thư mục dạng JSON
    def create_file(self, folder, name) -> dict  # Tạo file .md mới
    def create_folder(self, parent, name) -> dict
    def rename_item(self, old_path, new_name) -> dict
    def delete_item(self, path) -> dict          # Move to trash
    def duplicate_file(self, path) -> dict
    def move_item(self, src, dest_folder) -> dict
    def search_filenames(self, query) -> list    # Fuzzy search tên file

    # === FILE I/O ===
    def open_file(self) -> dict                  # Dialog mở file
    def open_file_by_path(self, path) -> dict    # Mở file theo path (từ sidebar)
    def save_file(self, tab_id, content) -> dict
    def save_file_as(self, tab_id, content) -> dict
    def get_recent_files(self) -> list

    # === TAB ===
    def new_tab(self) -> dict
    def close_tab(self, tab_id) -> dict
    def force_close_tab(self, tab_id) -> dict

    # === SESSION ===
    def save_session(self, data_json) -> bool
    def load_session(self) -> dict

    # === MARKDOWN ===
    def render_markdown(self, text) -> str
    def export_html(self, content, dest) -> bool
    def export_pdf(self, content, dest) -> bool

    # === SETTINGS ===
    def get_settings(self) -> dict
    def save_settings(self, json_str) -> bool

    # === SEARCH ===
    def search_in_files(self, query, folder) -> list
```

#### `folder_manager.py` — Folder Tree Logic

```python
class FolderManager:

    def get_tree(self, root_path, extensions, show_hidden) -> list:
        """
        Trả về cây thư mục dạng:
        [
            {
                "name": "docs",
                "path": "/Users/.../docs",
                "type": "folder",
                "children": [
                    {
                        "name": "guide.md",
                        "path": "/Users/.../docs/guide.md",
                        "type": "file",
                        "modified": "2026-06-30T10:30:00"
                    }
                ]
            }
        ]
        """

    def create_file(self, folder_path, filename) -> dict
    def create_folder(self, parent_path, folder_name) -> dict
    def rename(self, old_path, new_name) -> dict
    def delete(self, path) -> dict         # send2trash
    def duplicate(self, file_path) -> dict
    def move(self, src_path, dest_folder) -> dict

    def watch(self, root_path, callback):
        """Dùng watchdog library, gọi callback khi có thay đổi"""
```

#### `session_manager.py` — Session & Backup

```python
class SessionManager:

    def save(self, session_data: dict):
        """
        Ghi session.json:
        {
            "workspace_folder": "/path/to/folder",
            "active_tab": "tab_2",
            "tab_order": ["tab_1", "tab_2", "tab_3"],
            "sidebar_width": 250,
            "sidebar_collapsed": false,
            "tabs": {
                "tab_1": {
                    "path": "/path/file.md",
                    "filename": "file.md",
                    "cursor_pos": 342,
                    "scroll_top": 120,
                    "modified": false
                },
                "tab_2": {
                    "path": null,           ← file chưa lưu
                    "filename": "Untitled",
                    "cursor_pos": 56,
                    "scroll_top": 0,
                    "modified": true
                }
            }
        }

        + Ghi nội dung từng tab vào backup/tab_id.md
        """

    def load(self) -> dict:
        """Đọc session.json + đọc nội dung từ backup/ hoặc file gốc"""

    def backup_tab(self, tab_id, content):
        """Ghi 1 tab vào backup/ (gọi bởi auto-save timer)"""

    def remove_backup(self, tab_id):
        """Xóa backup khi tab đã save hoặc đóng hẳn"""
```

---

### 2.4 UI Layout Design — Chi tiết

```
┌──────────────────────────────────────────────────────────────────┐
│ ■ MarkView                                            — □ ✕     │
├──────────────────────────────────────────────────────────────────┤
│  File   Edit   View   Export   Help                              │ ← Menu bar (optional)
├──────────────────────────────────────────────────────────────────┤
│  📂 Open │ 💾 Save │ B I S │ `` Code │ 🔗 │ 📋 │ ☀/🌙 │       │ ← Toolbar
├────────┬─────────────────────────────────────────────────────────┤
│SIDEBAR │ [README.md ✕] [notes.md● ✕] [guide.md ✕]         [+]  │ ← Tab bar
│ ───────│─────────────────────────┬───────────────────────────────│
│🔍filter│                         │                               │
│────────│    EDITOR PANEL          │    PREVIEW PANEL              │
│📁 src/ │                         │                               │
│ 📄 a.md│  # Hello World          │    Hello World                │
│ 📄 b.md│                         │    ═══════════                │
│📁 docs/│  This is **bold** and   │    This is bold and           │
│ ▶ api/ │  this is *italic*.      │    this is italic.            │
│ 📄 x.md│                         │                               │
│────────│  ```python               │    ┌─────────────────┐       │
│OUTLINE │  def hello():           │    │ def hello():     │       │
│────────│      print("hi")        │    │     print("hi")  │       │
│ H1 ──  │  ```                     │    └─────────────────┘       │
│ H2 ──  │                         │                               │
│ H3 ──  │  | Col1 | Col2 |        │    ┌──────┬──────┐           │
│ H2 ──  │  |------|------|        │    │ Col1 │ Col2 │           │
│         │  | A    | B    |        │    ├──────┼──────┤           │
│         │  | C    | D    |        │    │ A    │ B    │           │
│         │                         │    │ C    │ D    │           │
│         │                         │    └──────┴──────┘           │
├────────┴─────────────────────────┴───────────────────────────────┤
│ Ln 12, Col 8 │ 234 words │ 1.2 KB │ UTF-8 │ LF │ Markdown      │ ← Status bar
└──────────────────────────────────────────────────────────────────┘
```

#### Sidebar States:

```
STATE 1: Không có folder            STATE 2: Có folder mở
┌────────┐                          ┌────────────┐
│        │                          │ 🔍 filter   │
│  📂    │                          │ ────────── │
│        │                          │ 📁 my-docs │
│ Open   │                          │  📁 src/   │
│ Folder │                          │   📄 a.md  │
│        │                          │   📄 b.md  │
│ Recent:│                          │  📁 docs/  │
│ ~/docs │                          │   ▶ api/   │
│ ~/proj │                          │   📄 x.md  │
│        │                          │ ────────── │
│        │                          │ OUTLINE    │
│        │                          │  H1 Title  │
│        │                          │  H2 Intro  │
│        │                          │  H2 Body   │
└────────┘                          └────────────┘
```

#### Right-click Context Menu — File:

```
┌──────────────────────┐
│ Open                 │
│ Open to the Side     │
│ ──────────────────── │
│ New File             │
│ New Folder           │
│ ──────────────────── │
│ Rename          F2   │
│ Duplicate            │
│ Delete        Delete │
│ ──────────────────── │
│ Copy Path            │
│ Copy Relative Path   │
│ Reveal in Explorer   │
└──────────────────────┘
```

#### Right-click Context Menu — Tab:

```
┌──────────────────────────┐
│ Close              Ctrl+W│
│ Close Others             │
│ Close All                │
│ Close to the Right       │
│ ──────────────────────── │
│ Copy Path                │
│ Copy Filename            │
│ Reveal in Sidebar        │
│ Reveal in Explorer       │
│ ──────────────────────── │
│ Pin Tab                  │
└──────────────────────────┘
```

---

### 2.5 Data Flow Diagrams

#### Mở folder → hiển thị file tree:

```
User clicks "Open Folder"
       │
       ▼
JS: openFolder() ──► Python: api.open_folder()
                              │
                              ▼
                     OS File Dialog → user chọn folder
                              │
                              ▼
                     folder_manager.get_tree(path)
                              │
                              ▼
                     Scan filesystem, build tree JSON
                              │
                              ▼
                     Return tree data to JS
                              │
                              ▼
               JS: renderFileTree(treeData)
                              │
                              ▼
               DOM: hiển thị cây thư mục trong sidebar
                              │
                              ▼
               Python: folder_manager.watch(path)
                    (bắt đầu theo dõi thay đổi)
```

#### Click file trong sidebar → mở tab:

```
User double-clicks "guide.md" in sidebar
       │
       ▼
JS: onFileDoubleClick(path)
       │
       ├── Kiểm tra file đã mở trong tab chưa?
       │     ├── Đã mở → switchTab(existingTabId) → DONE
       │     └── Chưa mở ↓
       │
       ▼
JS → Python: api.open_file_by_path(path)
                    │
                    ▼
              Đọc file content (utf-8)
                    │
                    ▼
              Return {id, path, filename, content}
                    │
                    ▼
         JS: Tạo tab mới, load content vào editor
                    │
                    ▼
         JS: updatePreview() → render markdown
                    │
                    ▼
         JS: highlight file trong sidebar
```

#### Auto-save & Session backup flow:

```
          ┌─────────────────────────────────┐
          │   setInterval(5000) — JS Timer  │
          └──────────────┬──────────────────┘
                         │
                         ▼
            Collect all tabs data:
            - content (from editor)
            - cursor_pos
            - scroll_top
            - modified flag
                         │
                         ▼
         JS → Python: api.save_session(JSON)
                         │
                         ▼
              ┌──────────┴──────────┐
              │                     │
              ▼                     ▼
     Ghi session.json        Ghi backup/tab_*.md
     (metadata, tab list)    (nội dung từng tab)
```

---

### 2.6 Dependencies (requirements.txt)

```
pywebview>=5.0
markdown>=3.5
pygments>=2.17          # Code highlight phía Python (cho export)
watchdog>=4.0           # File system watcher
send2trash>=1.8         # Xóa file vào Recycle Bin
weasyprint>=62.0        # Export PDF (optional, nặng)
# hoặc thay bằng pdfkit nếu muốn nhẹ hơn
```

---

### 2.7 Lộ trình phát triển (Development Phases)

```
PHASE 1 — MVP (2-3 tuần)                           ████████░░ 80% core
─────────────────────────────────────────
 ✦ pywebview window + basic HTML shell
 ✦ Sidebar: open folder, file tree, click to open
 ✦ Tab system: open, close, switch
 ✦ Editor: textarea (chưa CodeMirror)
 ✦ Preview: markdown → HTML realtime
 ✦ File: open, save, save as
 ✦ Session restore + backup
 ✦ Dark theme

PHASE 2 — USABLE (2-3 tuần)                        ██████████ 100% daily use
─────────────────────────────────────────
 ✦ Thay textarea → CodeMirror 6
 ✦ Sidebar: new file, rename, delete, duplicate
 ✦ Sidebar: search filter, auto-refresh
 ✦ Find & Replace
 ✦ Tab context menu
 ✦ Toolbar formatting
 ✦ Light theme
 ✦ Settings panel
 ✦ Status bar đầy đủ
 ✦ Keyboard shortcuts đầy đủ

PHASE 3 — POLISHED (2-3 tuần)                      Sẵn sàng share cho người khác
─────────────────────────────────────────
 ✦ Code syntax highlight trong preview (highlight.js)
 ✦ Scroll sync editor ↔ preview
 ✦ Document outline sidebar
 ✦ Quick open (Ctrl+P)
 ✦ Export HTML / PDF
 ✦ Drag & drop file vào app
 ✦ File change detection
 ✦ Drag & drop tab reorder
 ✦ Image paste / drop

PHASE 4 — ADVANCED (ongoing)                       Pro-level features
─────────────────────────────────────────
 ✦ Mermaid diagrams
 ✦ KaTeX math
 ✦ Search in files (Ctrl+Shift+F)
 ✦ Command palette (Ctrl+Shift+P)
 ✦ Zen mode
 ✦ More themes
 ✦ Plugin system
 ✦ Auto-update
 ✦ i18n
```

---

### 2.8 Build & Distribution

```
                    Source Code
                        │
            ┌───────────┼───────────┐
            ▼           ▼           ▼
        Windows       macOS       Linux
            │           │           │
         Nuitka      py2app     Nuitka/AppImage
            │           │           │
            ▼           ▼           ▼
     MarkView.exe  MarkView.app  MarkView.AppImage
       ~20-30MB     ~25-35MB      ~25-35MB
```

Còn nhiều phần quan trọng nữa. Dưới đây là tất cả những gì còn thiếu:

---

# PHẦN BỔ SUNG — Những mục còn thiếu trong tài liệu

---

## PHẦN 3: XỬ LÝ LỖI & EDGE CASES

### 3.1 Bảng Error Handling

| Tình huống | Cách xử lý | UI hiển thị |
|---|---|---|
| Mở file bị encoding lạ (không phải UTF-8) | Thử detect encoding bằng `chardet`, fallback sang latin-1. Hiển thị encoding trên status bar | Status bar: "Shift-JIS" thay vì "UTF-8" |
| Mở file quá lớn (>5MB) | Cảnh báo "File is large, editing may be slow. Continue?" với nút Yes/No | Dialog cảnh báo |
| File bị xóa bên ngoài khi đang mở | File watcher phát hiện → hiển thị banner trên tab: "File has been deleted. Keep editor content?" | Banner vàng trên editor |
| File bị sửa bên ngoài khi đang mở | File watcher phát hiện → "File changed on disk. Reload?" với nút Reload / Keep Mine / Diff | Dialog 3 nút |
| File bị sửa bên ngoài + editor cũng có thay đổi chưa lưu | Conflict → "File changed externally and you have unsaved changes. Reload (lose changes) / Keep yours / Save as new file?" | Dialog conflict |
| Lưu file thất bại (permission denied) | Catch exception → "Cannot save: Permission denied. Try Save As to a different location?" | Toast notification + gợi ý Save As |
| Lưu file thất bại (disk full) | "Cannot save: Disk is full. Free up space and try again." | Toast notification đỏ |
| Folder bị xóa/rename bên ngoài khi đang mở | File watcher phát hiện → "Workspace folder has been moved or deleted. Reopen or close workspace?" | Dialog |
| Session file bị corrupt | Try/except khi load → nếu lỗi, bắt đầu fresh session, ghi log cảnh báo | Âm thầm khôi phục, hiện toast "Session restored partially" |
| Backup file bị corrupt/mất | Fallback: đọc từ file gốc trên disk. Nếu cả hai mất → mở tab trống, ghi log | Toast "Some tabs could not be restored" |
| Tạo file trùng tên trong sidebar | Kiểm tra trước khi tạo → "File already exists. Choose a different name." | Inline error dưới ô input |
| Rename thành tên không hợp lệ | Validate: không chứa `\ / : * ? " < > |`, không rỗng, không quá 255 ký tự | Inline error đỏ |
| Mở app khi folder trước đó không còn tồn tại | Kiểm tra tồn tại → nếu mất, hiển thị welcome screen thay vì crash | Welcome screen + toast thông báo |
| Paste ảnh nhưng không có folder workspace | "Save the file first before pasting images" (vì cần biết folder để tạo `./assets/`) | Toast cảnh báo |
| Render markdown có syntax lỗi | Markdown lib tự xử lý gracefully (hiển thị raw text nếu không parse được). Không crash | Preview hiển thị nguyên text |
| Mở file binary (không phải text) | Detect bằng cách đọc 1024 bytes đầu, check null bytes → "This is a binary file and cannot be edited" | Dialog thông báo, không mở |

### 3.2 Crash Recovery Flow

```
App khởi động
    │
    ▼
Kiểm tra session.json tồn tại?
    │
    ├── KHÔNG → Fresh start, welcome screen
    │
    └── CÓ → Đọc session.json
              │
              ├── Parse thành công?
              │     │
              │     ├── CÓ → Với mỗi tab trong session:
              │     │         │
              │     │         ├── Có path + file tồn tại?
              │     │         │     └── CÓ → So sánh backup vs file gốc
              │     │         │               │
              │     │         │               ├── Backup mới hơn (crash xảy ra)
              │     │         │               │   → Load backup content
              │     │         │               │   → Đánh dấu tab modified
              │     │         │               │   → Toast: "Recovered unsaved changes"
              │     │         │               │
              │     │         │               └── File gốc mới hơn hoặc bằng
              │     │         │                   → Load file gốc
              │     │         │
              │     │         ├── Có path nhưng file không tồn tại?
              │     │         │     └── Có backup?
              │     │         │           ├── CÓ → Load backup, đánh dấu "File missing"
              │     │         │           └── KHÔNG → Bỏ qua tab này
              │     │         │
              │     │         └── Không có path (Untitled)?
              │     │               └── Có backup?
              │     │                     ├── CÓ → Load backup content
              │     │                     └── KHÔNG → Bỏ qua
              │     │
              │     └── KHÔNG (parse lỗi) → Rename session.json →
              │           session.json.bak, fresh start, toast cảnh báo
              │
              └── (xong)
```

---

## PHẦN 4: LOGGING & DIAGNOSTICS

### 4.1 Hệ thống Log

```python
# Cấu trúc log file
# Lưu tại: %APPDATA%/MarkView/logs/markview.log
# Rotation: giữ 5 file, mỗi file tối đa 2MB

import logging
from logging.handlers import RotatingFileHandler

LOG_FORMAT = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"

# Levels:
#   DEBUG   - Chi tiết thao tác (file opened, tab switched)
#   INFO    - Sự kiện quan trọng (session saved, folder opened)
#   WARNING - Vấn đề không nghiêm trọng (backup file missing, encoding fallback)
#   ERROR   - Lỗi cần chú ý (save failed, permission denied)
```

### 4.2 Những gì cần log

| Event | Level | Ví dụ |
|---|---|---|
| App khởi động / tắt | INFO | `App started v1.0.0 on Windows 11` |
| Session load/save | INFO | `Session loaded: 5 tabs restored` |
| File open/save | INFO | `Opened: C:\docs\readme.md (4.2KB, UTF-8)` |
| File watcher event | DEBUG | `File changed externally: readme.md` |
| Backup written | DEBUG | `Backup saved: tab_3 (2.1KB)` |
| Encoding fallback | WARNING | `UTF-8 decode failed, falling back to latin-1: data.md` |
| Save failed | ERROR | `Save failed: C:\readonly\file.md - PermissionError` |
| Crash recovery | WARNING | `Recovered unsaved changes for 2 tabs` |
| Session parse error | ERROR | `session.json corrupt, starting fresh session` |
| Unhandled exception | CRITICAL | Full traceback |

### 4.3 Thư mục dữ liệu app

```
📁 %APPDATA%/MarkView/              (Windows)
   ~/.config/markview/               (Linux)
   ~/Library/Application Support/markview/  (macOS)
│
├── 📄 session.json                  ← Trạng thái phiên làm việc
├── 📄 settings.json                 ← Cấu hình người dùng
│
├── 📁 backup/                       ← Nội dung tab chưa lưu
│   ├── tab_1_1719756000.md
│   └── tab_2_1719756005.md
│
├── 📁 logs/                         ← Log files
│   ├── markview.log                 ← Current log
│   ├── markview.log.1               ← Rotated
│   └── markview.log.2
│
├── 📁 themes/                       ← Custom themes (future)
│   └── my-theme.css
│
└── 📁 cache/                        ← Cache (rendered HTML, etc.)
    └── ...
```

---

## PHẦN 5: SECURITY & DATA SAFETY

### 5.1 Nguyên tắc bảo mật

| Mối quan ngại | Biện pháp |
|---|---|
| XSS trong preview | Sanitize HTML output. Markdown lib mặc định escape HTML tags nguy hiểm. Không dùng `innerHTML` trực tiếp cho user input mà không qua sanitizer |
| Path traversal | Validate mọi path từ JS trước khi thực hiện file operation. Đảm bảo path nằm trong workspace folder hoặc backup folder. Reject path chứa `..` ra ngoài root |
| Arbitrary code execution | Không bao giờ `eval()` hoặc `exec()` nội dung từ file markdown. Code block chỉ render, không chạy |
| File permission | Dùng `send2trash` thay vì `os.remove()`. Không ghi file ngoài workspace hoặc app data dir trừ khi user chọn qua Save As dialog |
| Sensitive data trong backup | Backup nằm trong user-specific app data dir (đã được OS bảo vệ). Không upload đi đâu. Không ghi log nội dung file |

### 5.2 Privacy

```
NGUYÊN TẮC: App không bao giờ:
  ✗ Gửi dữ liệu ra internet
  ✗ Thu thập analytics
  ✗ Gọi API bên ngoài
  ✗ Kiểm tra license online

App CHỈ truy cập:
  ✓ File/folder do user chọn mở
  ✓ Thư mục app data (%APPDATA%/MarkView/)
  ✓ System trash (qua send2trash)
```

---

## PHẦN 6: PERFORMANCE OPTIMIZATION

### 6.1 Chiến lược tối ưu

| Vấn đề | Giải pháp | Chi tiết |
|---|---|---|
| Preview render chậm khi gõ liên tục | **Debounce** 150ms. Chỉ render sau khi user ngừng gõ 150ms | `setTimeout` / `clearTimeout` trong JS |
| File tree folder lớn (>1000 files) | **Lazy loading**. Chỉ load children khi user expand folder. Không scan toàn bộ recursive lúc đầu | `get_tree()` chỉ trả level 1, expand gọi `get_children(path)` |
| Sidebar search chậm với nhiều file | **Debounce** 200ms + **fuzzy search** phía JS (không gọi Python mỗi keystroke) | Cache danh sách flat file names trong JS |
| File lớn (>1MB) làm editor lag | CodeMirror 6 có built-in virtual scrolling, chỉ render dòng visible. Nếu dùng textarea thuần, warning user | CodeMirror viewport optimization |
| Nhiều tab mở (>20) | Chỉ giữ content trong memory cho tab active + 2 tab gần nhất. Tab khác chỉ giữ metadata, load lại từ disk/backup khi switch | Tab content lazy loading |
| Preview ảnh lớn | CSS `max-width: 100%` + lazy loading `loading="lazy"` | HTML img attribute |
| Auto-backup ghi đĩa liên tục | Chỉ backup tab có `modified=true`. So sánh content hash trước khi ghi, tránh ghi lại nếu không thay đổi | `hashlib.md5` quick compare |
| App khởi động chậm | Load UI trước, hiển thị skeleton. Restore session async trong background. Render preview sau khi editor đã hiện | Async loading sequence |

### 6.2 Startup Sequence tối ưu

```
T+0ms     Tạo pywebview window → hiển thị HTML shell (skeleton UI)
T+50ms    Load CSS + JS (từ local file, không CDN)
T+100ms   Hiển thị layout cơ bản (sidebar placeholder, empty tab bar)
T+150ms   Load session.json (async)
T+200ms   Restore tab bar (chỉ tên + metadata, CHƯA load content)
T+250ms   Load content cho active tab từ backup/disk
T+300ms   Hiển thị editor với content
T+350ms   Render preview cho active tab
T+400ms   Load folder tree (lazy, chỉ level 1)
T+500ms   Bắt đầu file watcher
T+600ms   Load CodeMirror plugins (syntax highlight, etc.)
T+800ms   App sẵn sàng hoàn toàn
          Các tab khác load content khi user switch đến
```

---

## PHẦN 7: TESTING STRATEGY

### 7.1 Test Categories

| Loại test | Công cụ | Phạm vi |
|---|---|---|
| Unit test Python | `pytest` | Mỗi module: file_manager, folder_manager, session_manager, markdown_renderer |
| Unit test JS | `vitest` hoặc manual | Tab logic, sidebar render, keyboard shortcuts |
| Integration test | `pytest` + pywebview mock | Python API → File system → Response |
| E2E test | Manual test script | Full flow: mở app → mở folder → edit → save → close → reopen |
| Performance test | Manual + `time` logging | Startup time, render time, memory usage |
| Cross-platform test | CI/CD hoặc manual | Windows, macOS, Linux |

### 7.2 Test Cases quan trọng

```
SESSION & BACKUP:
  ☐ Mở app lần đầu → welcome screen, không crash
  ☐ Mở 5 file → đóng app → mở lại → 5 tab khôi phục đúng
  ☐ Gõ text vào Untitled tab → đóng app (không save) → mở lại → text còn
  ☐ Kill process (simulate crash) → mở lại → nội dung recovered
  ☐ Xóa session.json bằng tay → mở app → fresh start, không crash
  ☐ session.json chứa file không tồn tại → mở app → bỏ qua, không crash

FOLDER SIDEBAR:
  ☐ Mở folder có 500+ files → tree hiển thị, không lag
  ☐ Mở folder rỗng → hiển thị "Empty folder"
  ☐ Tạo file mới → file xuất hiện trong tree ngay
  ☐ Rename file đang mở → tab title cập nhật
  ☐ Delete file đang mở → tab chuyển thành "File deleted" state
  ☐ Tạo file trùng tên → hiện lỗi, không ghi đè
  ☐ Tạo file tên chứa ký tự đặc biệt (tiếng Việt, emoji) → hoạt động đúng
  ☐ Drag file vào subfolder → file di chuyển đúng
  ☐ Thêm/xóa file từ bên ngoài (Explorer) → tree auto-refresh

TAB SYSTEM:
  ☐ Mở 30 tab → tab bar scroll được
  ☐ Middle-click tab → đóng
  ☐ Đóng tab chưa lưu → hỏi confirm
  ☐ Ctrl+Tab cycle qua tất cả tab
  ☐ Double-click file đã mở → switch đến tab đó (không mở trùng)

EDITOR:
  ☐ Gõ 10,000 ký tự → preview không lag
  ☐ Mở file 1MB → editor responsive
  ☐ Find & Replace regex hoạt động
  ☐ Undo 50 lần → đúng
  ☐ Ctrl+B trên text đã chọn → wrap **bold**

ENCODING & UNICODE:
  ☐ Mở file UTF-8 with BOM → đọc đúng
  ☐ Mở file tiếng Nhật (Shift-JIS) → detect và hiển thị đúng
  ☐ File chứa emoji 🎉 → hiển thị đúng cả editor và preview
  ☐ Filename tiếng Việt "ghi-chú.md" → mở/save/rename đúng
```

---

## PHẦN 8: ACCESSIBILITY (Trợ năng)

| Yêu cầu | Cách triển khai | Độ ưu tiên |
|---|---|---|
| Keyboard navigation đầy đủ | Mọi thao tác có phím tắt. Tab/Shift+Tab di chuyển giữa các panel. Arrow keys điều hướng trong file tree | P1 |
| Focus visible | Viền sáng rõ ràng cho phần tử đang focus (`:focus-visible` CSS) | P1 |
| High contrast support | Theme tối/sáng có contrast ratio ≥ 4.5:1 cho text (WCAG AA) | P1 |
| Font size scaling | Ctrl+=/- thay đổi cỡ chữ. Tất cả UI scale theo `rem` | P0 (đã có) |
| ARIA labels | Sidebar tree có `role="tree"`, `role="treeitem"`. Tab bar có `role="tablist"`. Editor có `aria-label` | P2 |
| Screen reader basic | Các button, menu item có `aria-label` mô tả chức năng. Không dựa hoàn toàn vào icon | P2 |
| Reduce motion | `@media (prefers-reduced-motion: reduce)` → tắt animation | P2 |

---

## PHẦN 9: INTERNATIONALIZATION (i18n) — Thiết kế sẵn

Chưa cần làm ngay, nhưng thiết kế code sẵn để dễ thêm sau:

```javascript
// ui/js/i18n.js

const LANG = {
    en: {
        'menu.file': 'File',
        'menu.edit': 'Edit',
        'menu.view': 'View',
        'sidebar.open_folder': 'Open Folder',
        'sidebar.new_file': 'New File',
        'sidebar.new_folder': 'New Folder',
        'sidebar.rename': 'Rename',
        'sidebar.delete': 'Delete',
        'sidebar.duplicate': 'Duplicate',
        'sidebar.search_placeholder': 'Search files...',
        'tab.untitled': 'Untitled',
        'tab.close_confirm': 'Save changes before closing?',
        'dialog.save': 'Save',
        'dialog.dont_save': "Don't Save",
        'dialog.cancel': 'Cancel',
        'status.words': 'words',
        'status.lines': 'lines',
        'status.chars': 'chars',
        // ...
    },
    vi: {
        'menu.file': 'Tệp',
        'menu.edit': 'Chỉnh sửa',
        'menu.view': 'Xem',
        'sidebar.open_folder': 'Mở thư mục',
        'sidebar.new_file': 'Tệp mới',
        'sidebar.new_folder': 'Thư mục mới',
        'sidebar.rename': 'Đổi tên',
        'sidebar.delete': 'Xóa',
        'sidebar.duplicate': 'Nhân bản',
        'sidebar.search_placeholder': 'Tìm tệp...',
        'tab.untitled': 'Chưa đặt tên',
        'tab.close_confirm': 'Lưu thay đổi trước khi đóng?',
        'dialog.save': 'Lưu',
        'dialog.dont_save': 'Không lưu',
        'dialog.cancel': 'Hủy',
        'status.words': 'từ',
        'status.lines': 'dòng',
        'status.chars': 'ký tự',
        // ...
    }
};

function t(key) {
    const lang = window.APP_SETTINGS?.language || 'en';
    return LANG[lang]?.[key] || LANG['en'][key] || key;
}
```

Trong HTML, dùng data attribute thay vì hardcode:

```html
<button data-i18n="sidebar.new_file">New File</button>

<script>
// Apply translations
document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
});
</script>
```

---

## PHẦN 10: CẤU TRÚC `settings.json` ĐẦY ĐỦ

```json
{
    "appearance": {
        "theme": "dark",
        "font_family_editor": "JetBrains Mono, Consolas, monospace",
        "font_family_preview": "Segoe UI, system-ui, sans-serif",
        "font_size_editor": 14,
        "font_size_preview": 15,
        "zoom_level": 1.0,
        "sidebar_width": 250,
        "sidebar_visible": true,
        "preview_visible": true,
        "preview_position": "right",
        "show_toolbar": true,
        "show_statusbar": true,
        "show_line_numbers": true,
        "show_minimap": false
    },
    "editor": {
        "word_wrap": true,
        "tab_size": 4,
        "insert_spaces": true,
        "auto_close_brackets": true,
        "auto_indent": true,
        "highlight_active_line": true,
        "match_brackets": true,
        "code_folding": false
    },
    "files": {
        "auto_save": false,
        "auto_save_interval": 30,
        "default_encoding": "utf-8",
        "default_line_ending": "lf",
        "visible_extensions": [".md", ".markdown", ".mdx", ".txt"],
        "show_hidden_files": false,
        "sort_by": "name_asc",
        "folders_first": true,
        "exclude_patterns": ["node_modules", ".git", "__pycache__", ".DS_Store"]
    },
    "session": {
        "restore_session": true,
        "backup_interval": 5,
        "remember_folder": true
    },
    "preview": {
        "scroll_sync": true,
        "render_mermaid": true,
        "render_math": true,
        "code_theme": "github-dark"
    },
    "recent_files": [
        "C:/Users/user/docs/readme.md",
        "C:/Users/user/notes/todo.md"
    ],
    "recent_folders": [
        "C:/Users/user/docs",
        "C:/Users/user/project"
    ],
    "pinned_folders": [
        "C:/Users/user/docs"
    ],
    "language": "en",
    "window": {
        "width": 1280,
        "height": 800,
        "x": 100,
        "y": 50,
        "maximized": false
    }
}
```

---

## PHẦN 11: TỔNG HỢP DEPENDENCIES CUỐI CÙNG

### Python (requirements.txt)

```
# === CORE ===
pywebview>=5.3.0          # Native webview window
markdown>=3.7             # Markdown → HTML parser
pygments>=2.18            # Syntax highlight (cho export)

# === FILE OPERATIONS ===
watchdog>=5.0             # File system watcher
send2trash>=1.8           # Safe delete (recycle bin)
chardet>=5.2              # Encoding detection

# === EXPORT (optional) ===
weasyprint>=62.0          # PDF export (nặng ~50MB)
# HOẶC thay bằng:
# pdfkit>=1.0             # PDF via wkhtmltopdf (nhẹ hơn)

# === BUILD ===
nuitka>=2.5               # Compile to native exe (dev dependency)
# HOẶC:
# pyinstaller>=6.0
```

### JavaScript (vendor libs — bundled offline)

```
CodeMirror 6              # Editor component
  @codemirror/state
  @codemirror/view
  @codemirror/lang-markdown
  @codemirror/language
  @codemirror/search
  @codemirror/autocomplete
  @codemirror/commands
  @codemirror/theme-one-dark

highlight.js 11.x        # Code block syntax highlight trong preview
mermaid 11.x              # Diagram rendering (optional)
KaTeX 0.16.x              # Math rendering (optional)
```

---

## PHẦN 12: CHECKLIST TRƯỚC KHI RELEASE

```
PRE-RELEASE CHECKLIST:
═══════════════════════

BUILD & PACKAGE:
  ☐ Build Windows exe thành công (Nuitka)
  ☐ Build macOS app thành công
  ☐ Build Linux AppImage thành công
  ☐ Installer size ≤ 30MB
  ☐ App khởi động ≤ 1.5s trên máy trung bình
  ☐ Không có file thừa trong build (logs, __pycache__, .git)

FUNCTIONAL:
  ☐ Mọi phím tắt hoạt động đúng
  ☐ Session restore sau restart
  ☐ Session restore sau crash (kill process)
  ☐ Folder tree hiển thị đúng
  ☐ CRUD file/folder từ sidebar
  ☐ Find & Replace hoạt động
  ☐ Export HTML/PDF tạo file đúng
  ☐ Encoding tiếng Việt, CJK hiển thị đúng

CROSS-PLATFORM:
  ☐ Test trên Windows 10
  ☐ Test trên Windows 11
  ☐ Test trên macOS (Intel + Apple Silicon)
  ☐ Test trên Ubuntu 22.04+
  ☐ Keyboard shortcuts đúng trên từng OS (Cmd thay Ctrl trên macOS)

EDGE CASES:
  ☐ Mở folder rỗng → không crash
  ☐ Mở folder 1000+ files → không lag quá
  ☐ Mở file 3MB → editor chậm chấp nhận được, không crash
  ☐ Xóa session.json → app mở fresh, không crash
  ☐ settings.json corrupt → dùng defaults, không crash
  ☐ Không có internet → app hoạt động 100% bình thường

SECURITY:
  ☐ Không có eval() hoặc exec() dùng với user input
  ☐ HTML trong preview được sanitize
  ☐ Path traversal không thể ra ngoài workspace
  ☐ File operations chỉ xảy ra trong workspace hoặc app data dir

DOCUMENTATION:
  ☐ README.md hoàn chỉnh với screenshots
  ☐ Keyboard shortcuts cheat sheet
  ☐ CHANGELOG.md
  ☐ LICENSE file
```

---

## TÓM TẮT — Tất cả các phần trong bộ tài liệu

| # | Phần | Nội dung | Trạng thái |
|---|---|---|---|
| 1 | Tổng quan & NFR | Mô tả dự án, đối tượng, yêu cầu phi chức năng | ✅ |
| 2 | Yêu cầu chức năng | 8 nhóm: Sidebar, Tab, Editor, Preview, Session, File, UI, Misc | ✅ |
| 3 | Phím tắt | Bảng tổng hợp keyboard shortcuts | ✅ |
| 4 | Kiến trúc tổng thể | Sơ đồ pywebview + Python backend + JS frontend | ✅ |
| 5 | Cấu trúc thư mục | Tổ chức source code | ✅ |
| 6 | Backend module design | API class, method signatures, data structures | ✅ |
| 7 | UI Layout design | Wireframe ASCII, sidebar states, context menus | ✅ |
| 8 | Data flow diagrams | Flow mở folder, mở file, auto-save | ✅ |
| 9 | Error handling | 16 tình huống lỗi + cách xử lý + crash recovery flow | ✅ |
| 10 | Logging | Log format, levels, events cần log, thư mục dữ liệu | ✅ |
| 11 | Security & Privacy | Sanitize, path traversal, nguyên tắc quyền riêng tư | ✅ |
| 12 | Performance | 8 chiến lược tối ưu + startup sequence timeline | ✅ |
| 13 | Testing | Test categories, tools, 30+ test cases cụ thể | ✅ |
| 14 | Accessibility | Keyboard nav, contrast, ARIA, screen reader | ✅ |
| 15 | Internationalization | i18n architecture sẵn sàng mở rộng | ✅ |
| 16 | Settings schema | `settings.json` đầy đủ tất cả options | ✅ |
| 17 | Dependencies | Python + JS libraries đầy đủ | ✅ |
| 18 | Development phases | 4 phase roadmap với timeline | ✅ |
| 19 | Build & Distribution | Nuitka/PyInstaller cho 3 OS | ✅ |
| 20 | Release checklist | Pre-release verification list | ✅ |