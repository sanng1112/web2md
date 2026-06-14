# Web2md

**Convert any web page to clean, structured Markdown — instantly.**

[![Version](https://img.shields.io/badge/version-1.3.0-blue)](https://github.com/sanng1112/web2md)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Chrome](https://img.shields.io/badge/platform-Chrome-brightgreen)](https://chrome.google.com/webstore)

## Features

- **One-click conversion** — click the extension icon or press `Ctrl+Shift+M` / `Cmd+Shift+M`
- **Smart extraction** — Mozilla Readability identifies and extracts the main article, stripping navigation, ads, and sidebars
- **YAML frontmatter** — auto-generates metadata block (title, source, description, date, image)
- **Dual modes** — Smart Extract (Readability) for clean article text, Raw mode for full-page fidelity
- **Dark mode** — toggle light/dark theme, persisted across sessions
- **Selection mode** — right-click any selected text → convert to Markdown with frontmatter
- **Table support** — preserves HTML tables as Markdown pipe tables
- **Code blocks** — detects language class on `<pre><code>` and adds fenced code blocks with language tag
- **Image control** — optionally include or exclude images from output
- **Absolute URLs** — resolves relative links and images to absolute URLs
- **Multiple export formats** — download as `.md`, `.html`, or `.txt`
- **Auto-copy** — optionally copies to clipboard immediately after conversion
- **Word count** — real-time char/word/read-time stats
- **Mermaid diagrams** — auto-detects and preserves Mermaid diagram blocks as fenced code
- **MathJax / LaTeX** — detects and preserves `$$...$$` display math and `$...$` inline math
- **Custom CSS selector** — specify a precise element to extract (Raw mode)
- **History** — saves last 10 conversions locally for quick recall
- **Batch tab conversion** — convert multiple open tabs at once, merged into a single file

## How it works

1. **Readability.js** extracts the main article content, stripping noise (nav, ads, sidebars)
2. **Turndown.js** converts the cleaned HTML to Markdown
3. Content script normalizes the DOM (resolves relative URLs, cleans up code blocks, removes hidden elements)
4. The result includes YAML frontmatter with full metadata

## Privacy

Web2md operates entirely client-side. No data is ever collected, transmitted, or stored on any server. The extension processes HTML content directly in your browser's active tab.

**Permissions explained:**
- `activeTab` — needed to read the current page's content for conversion
- `tabs` — needed for batch conversion to list open tabs
- `contextMenus` — needed for right-click "Convert to Markdown" menu items
- `storage` — needed to remember your option preferences locally
- `clipboardWrite` — needed for auto-copy to clipboard feature
- `<all_urls>` — needed so the extension works on any website

## Keyboard shortcut

**Default:** `Ctrl+Shift+M` (Windows/Linux) / `Cmd+Shift+M` (Mac)

Customize at `chrome://extensions/shortcuts`

## Roadmap

- [x] Smart extraction with Mozilla Readability
- [x] Dark mode with CSS variables
- [x] Export formats: .md, .html, .txt
- [x] Image toggle and word count stats
- [x] Auto-save conversion history (last 10)
- [x] Mermaid diagram detection & preservation
- [x] Custom CSS selector for targeted extraction
- [x] Batch tab conversion
- [x] MathJax / LaTeX preserve
- [ ] Firefox extension port
- [ ] Chrome Web Store release

## Installation

### From Chrome Web Store *(coming soon)*

Link will be added once published.

### From source (developer mode)

1. Clone this repo:
   ```bash
   git clone https://github.com/sanng1112/web2md.git
   ```
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (toggle top-right)
4. Click **Load unpacked** and select the `web2md` folder

## Tech stack

- [Turndown.js](https://github.com/mixmark-io/turndown) v7.2.1 — HTML → Markdown converter
- [Mozilla Readability](https://github.com/mozilla/readability) — content extraction engine
- Chrome Extension Manifest V3

## License

MIT
