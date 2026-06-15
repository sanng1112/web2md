# Web2md

Convert any web page to clean, structured Markdown. Instantly.

[![Version](https://img.shields.io/badge/version-1.3.0-blue)](https://github.com/sanng1112/web2md/releases)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Chrome](https://img.shields.io/badge/platform-Chrome-4285F4?logo=googlechrome&logoColor=white)](https://chrome.google.com/webstore)
[![Tests](https://img.shields.io/badge/tests-47/47-passing-brightgreen)](test/test-conversion.mjs)
[![Built by ANNG](https://img.shields.io/badge/built%20by-ANNG-8B5CF6?logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTEyIDJMMiA3bDEwIDUgMTAtNS0xMC01eiIvPjxwYXRoIGQ9Ik0yIDE3bDEwIDUgMTAtNSIvPjxwYXRoIGQ9Ik0yIDEybDEwIDUgMTAtNSIvPjwvc3ZnPg==)](https://github.com/sanng1112/Anng_cli)

---

## Features

- **One-click conversion** -- Click the extension icon or press `Ctrl+Shift+M` / `Cmd+Shift+M`
- **Smart extraction** -- Mozilla Readability identifies and extracts the main article, stripping navigation, ads, and sidebars
- **YAML frontmatter** -- Auto-generates metadata block (title, source, description, date, image)
- **Dual modes** -- Smart Extract (Readability) for clean article text, Raw mode for full-page fidelity
- **Dark mode** -- Toggle light/dark theme, persisted across sessions
- **Selection mode** -- Right-click any selected text to convert to Markdown with frontmatter
- **Table support** -- Preserves HTML tables as Markdown pipe tables
- **Code blocks** -- Detects language class on `<pre><code>` and adds fenced code blocks with language tag
- **Image control** -- Optionally include or exclude images from output
- **Absolute URLs** -- Resolves relative links and images to absolute URLs
- **Multiple export formats** -- Download as `.md`, `.html`, or `.txt`
- **Auto-copy** -- Optionally copies to clipboard immediately after conversion
- **Word count** -- Real-time char/word/read-time stats
- **Mermaid diagrams** -- Auto-detects and preserves Mermaid diagram blocks as fenced code
- **MathJax / LaTeX** -- Detects and preserves `$$...$$` display math and `$...$` inline math
- **Custom CSS selector** -- Specify a precise element to extract (Raw mode)
- **History** -- Saves last 10 conversions locally for quick recall
- **Batch tab conversion** -- Convert multiple open tabs at once, merged into a single file

---

## Quick Start

### Install from source (developer mode)

```bash
git clone https://github.com/sanng1112/web2md.git
cd web2md
npm install
```

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle top-right)
3. Click **Load unpacked** and select the `web2md` folder
4. Click the extension icon or press `Ctrl+Shift+M` to convert any page

### Run tests

```bash
npm test                              # Unit tests (Node.js + jsdom) -- 47 tests
node test/test-e2e.mjs                # E2E tests (Playwright) -- requires Chromium
```

> Note: E2E tests require Chromium. Install with `npx playwright install chromium`.

---

## Usage

### Basic conversion

1. Navigate to any web page
2. Click the **Web2md** extension icon (or press `Ctrl+Shift+M`)
3. The Markdown result appears in the popup preview
4. Click **Copy** or **Download** (`.md` / `.html` / `.txt`)

### Smart vs Raw mode

| Mode | When to use |
|---|---|
| **Smart Extract** (Readability) | Articles, blog posts, documentation -- removes nav, ads, sidebars |
| **Raw HTML** | Any page where you want full fidelity -- including headers, footers, navigation |

### Batch conversion

1. Open the extension popup
2. Scroll to the **Batch** section
3. Check the tabs you want to convert
4. Click **Convert All** -- results merge into a single Markdown file, separated by `---` with source URLs preserved

### Keyboard shortcut

**Default:** `Ctrl+Shift+M` (Windows/Linux) / `Cmd+Shift+M` (Mac)

Customize at `chrome://extensions/shortcuts`

### Right-click menu

- **Convert page to Markdown** -- converts the entire page
- **Convert selection to Markdown** -- converts only the selected text

---

## Architecture

```
User action (icon / hotkey / right-click)
        |
        v
background.js (Service Worker)
        |  chrome.scripting.executeScript (lazy inject if needed)
        |  chrome.tabs.sendMessage -> { action: 'convert' }
        v
content.js (IIFE -- runs in page context)
        |  getPageMetadata()
        |  extractWithReadability() / extractRaw()
        |  normalizeDom() -- strips junk, preserves code/math/mermaid
        |  buildTurndownService() -- custom rules for links, images, tables
        |  cleanMarkdown() -- post-process math, trailing spaces
        |  buildHeader() -- YAML frontmatter
        v
    Markdown -> clipboard + popup preview
```

### Key modules

| Module | File | Lines | Responsibility |
|---|---|---|---|
| **Background** | `background/background.js` | 162 | Service worker, context menus, keyboard shortcuts, clipboard |
| **Content script** | `content/content.js` | 641 | Core conversion engine -- extraction, normalization, Turndown, cleaning |
| **Popup** | `popup/popup.js` | 413 | UI logic -- options, preview, download, batch, history |
| **Styles** | `popup/popup.css` | 433 | Dark/light mode with CSS variables |
| **Popup markup** | `popup/popup.html` | 126 | Extension popup layout |
| **Publish script** | `scripts/publish.mjs` | 145 | Version bump, zip, git tag automation |

### Libraries

| Library | File | Lines | Purpose |
|---|---|---|---|
| [Turndown.js](https://github.com/mixmark-io/turndown) v7.2.1 | `lib/turndown.js` | 974 | HTML to Markdown converter |
| [Mozilla Readability](https://github.com/mozilla/readability) | `lib/readability.js` | 2,812 | Main content extraction engine |

---

## Testing

| Suite | File | Type | How to run |
|---|---|---|---|
| **Unit tests** | `test/test-conversion.mjs` | Node.js + jsdom | `npm test` |
| **E2E tests** | `test/test-e2e.mjs` | Playwright (Chromium) | `node test/test-e2e.mjs` |
| **Browser runner** | `test/test-runner.html` | In-browser | Open in browser |
| **Fixture** | `test/test-fixture.html` | Test data | HTML with all supported elements |

All 47 unit tests cover:
- Headings, bold, italic, strikethrough
- Links (external, relative, anchor, javascript)
- Images (with alt, title, relative, figure + figcaption)
- Code blocks (language class, data-language attr, inline code)
- Tables (header, alignment, data cells)
- Lists (unordered, ordered, nested, task lists)
- Blockquotes, definition lists
- Mermaid diagrams, MathJax/LaTeX
- Details/summary, video, YouTube iframes
- Junk removal (nav, footer, ads, sidebar, cookie banner, comments)

---

## Tech Stack

| Technology | Usage |
|---|---|
| **Chrome Extension Manifest V3** | Extension architecture |
| **Turndown.js** v7.2.1 | HTML to Markdown conversion |
| **Mozilla Readability** | Content extraction |
| **jsdom** ^29.x | Unit testing |
| **Playwright** ^1.60 | E2E testing |
| **ESLint** | Code quality |
| **Prettier** | Code formatting |
| **GitHub Actions** | CI/CD |

---

## Privacy

Web2md operates entirely **client-side**. No data is ever collected, transmitted, or stored on any server. The extension processes HTML content directly in your browser's active tab.

**Permissions explained:**

| Permission | Why needed |
|---|---|
| `activeTab` | Read the current page's content for conversion |
| `tabs` | List open tabs for batch conversion |
| `scripting` | Inject content script on-demand |
| `contextMenus` | Right-click "Convert to Markdown" menu items |
| `storage` | Remember option preferences locally |
| `clipboardWrite` | Auto-copy to clipboard feature |
| `<all_urls>` | Work on any website |

---

## Built by ANNG

This project was developed with the assistance of **[ANNG CLI](https://github.com/sanng1112/Anng_cli)** -- an AI-powered autonomous coding agent that handles code generation, debugging, refactoring, and project management directly in the terminal.

ANNG was responsible for:
- Writing and refactoring code across the entire codebase
- Running tests and fixing failures in a tight feedback loop
- Managing Git workflow (commits, PRs, tagging releases)
- Generating documentation and workspace maps
- Conducting production-readiness audits before releases

---

## License

MIT (c) [sanng1112](https://github.com/sanng1112)

---

## Contributing

Contributions are welcome. Please feel free to submit a Pull Request.

1. Fork the repo
2. Create your feature branch (`git checkout -b feat/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feat/amazing-feature`)
5. Open a Pull Request

### Development setup

```bash
git clone https://github.com/sanng1112/web2md.git
cd web2md
npm install
npm test              # Run unit tests
npm run lint          # Check code style
```

---

### Contact

- **Author:** sanng1112
- **GitHub:** [github.com/sanng1112](https://github.com/sanng1112)
- **Issues:** [github.com/sanng1112/web2md/issues](https://github.com/sanng1112/web2md/issues)
