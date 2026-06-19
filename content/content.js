(() => {
  'use strict';

  function getPageMetadata() {
    const canonical = document.querySelector('link[rel="canonical"]');
    const ogTitle = document.querySelector('meta[property="og:title"]');
    const ogDesc = document.querySelector('meta[property="og:description"]');
    const ogImage = document.querySelector('meta[property="og:image"]');
    const published = document.querySelector('meta[property="article:published_time"]');
    const favicon =
      document.querySelector('link[rel="icon"]')?.href ||
      document.querySelector('link[rel="shortcut icon"]')?.href ||
      '';

    return {
      title: ogTitle?.content || document.title || '',
      description: ogDesc?.content || '',
      url: canonical?.href || window.location.href,
      image: ogImage?.content || '',
      published: published?.content || '',
      favicon,
    };
  }

  function extractWithReadability() {
    const documentClone = document.cloneNode(true);
    try {
      const reader = new Readability(documentClone);
      const article = reader.parse();
      if (article?.content?.trim().length > 50) {
        return {
          html: article.content,
          title: article.title || document.title,
          textContent: article.textContent || '',
        };
      }
    } catch (e) {
      console.warn('Readability failed, falling back to raw extraction:', e.message);
    }
    return null;
  }

  function extractRaw(selector) {
    let article = null;
    if (selector) {
      article = document.querySelector(selector);
    }
    if (!article) {
      const candidates = document.querySelectorAll(
        'article, [role="main"], main, .post-content, .article-content, .entry-content, #content, .content, .markdown-body',
      );
      // Pick the candidate with the most content
      let best = null;
      let bestLen = 0;
      candidates.forEach((el) => {
        const len = el.textContent.trim().length;
        if (len > bestLen) {
          best = el;
          bestLen = len;
        }
      });
      article = best;
    }
    article = article ? article.cloneNode(true) : document.body.cloneNode(true);
    normalizeDom(article);
    return { html: article.innerHTML, title: document.title, textContent: article.textContent || '' };
  }

  // ---------------------------------------------------------------------------
  // STRUCTURAL_JUNK — class-based noise selectors (safelisted, stripped in bulk)
  // ---------------------------------------------------------------------------
  const JUNK_SELECTORS = [
    // structural
    'nav',
    'footer',
    'form',
    '[role="navigation"]',
    '[role="banner"]',
    '[role="contentinfo"]',
    '[role="complementary"]',
    // sidebars & widgets
    '.sidebar',
    '.side-bar',
    '.widget',
    '.aside',
    // ads (exact matches only — avoid false positives)
    '.ad',
    '.ads',
    '.advertisement',
    '.ad-container',
    // social
    '.social-share',
    '.social-links',
    '.share-buttons',
    // comments
    '.comments',
    '#comments',
    '.comment-section',
    // related content
    '.related-posts',
    '.related-articles',
    '.you-may-also-like',
    // breadcrumbs
    '.breadcrumb',
    '.breadcrumbs',
    // cookie / GDPR
    '.cookie-banner',
    '.cookie-consent',
    '#cookie-notice',
    '.gdpr',
    '.consent-banner',
    // newsletter / subscribe
    '.newsletter',
    '.subscribe',
    '.signup-form',
    // pagination
    '.pagination',
    '.page-nav',
    '.prev-next',
    // modals / overlays
    '.modal',
    '.popup',
    '.overlay',
    '.lightbox',
  ];

  // Elements that are always removed regardless of content (junk)
  const JUNK_TAGS = new Set(['script', 'style', 'noscript', 'object', 'embed']);

  // Elements removed during raw extraction because Turndown handles them poorly.
  // These are only removed in extractRaw; Readability handles them internally.
  const RAW_REMOVE_TAGS = new Set(['svg']);

  function isHidden(el) {
    if (el.hasAttribute('hidden')) return true;
    const s = el.style;
    if (s && (s.display === 'none' || s.visibility === 'hidden')) return true;
    // offsetParent is null for disconnected nodes; only check computed style
    // when the node is still connected
    try {
      return el.offsetParent === null && getComputedStyle(el).display === 'none';
    } catch (_) {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // DOM normalization (single tree-walker pass where possible)
  // ---------------------------------------------------------------------------
  function normalizeDom(el) {
    // 0. Handle MathJax FIRST (before script removal)
    el.querySelectorAll('script[type^="math/tex"]').forEach((m) => {
      const pre = document.createElement('pre');
      pre.className = 'language-math';
      pre.textContent = m.textContent.replace(/^;\s*mode\s*=\s*display\s*/i, '').trim();
      m.replaceWith(pre);
    });

    // 1. Bulk-remove known junk by tag
    el.querySelectorAll(JUNK_TAGS_SEL).forEach((n) => n.remove());

    // 2. Remove by CSS selector (class-based junk)
    el.querySelectorAll(JUNK_SELECTORS.join(',')).forEach((n) => n.remove());

    // 3. Single tree walker for style-hidden, empty pruning, and BR/HR cleanup
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, null, false);
    const toRemove = [];
    const nodes = [];

    while (walker.nextNode()) nodes.push(walker.currentNode);

    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];

      // Text nodes: trim trailing whitespace (handled later in cleanMarkdown)
      if (n.nodeType === Node.TEXT_NODE) continue;

      const tag = n.tagName;

      // 3a. Remove hidden elements
      if (isHidden(n)) {
        toRemove.push(n);
        continue;
      }

      // 3b. Collapse empty elements (no text content, no media children)
      // NOTE: table elements (TD, TH, TR, TABLE, etc.) are excluded because
      // empty cells are valid and removing them breaks table structure.
      if (
        tag !== 'BR' &&
        tag !== 'HR' &&
        tag !== 'IMG' &&
        tag !== 'INPUT' &&
        tag !== 'WBR' &&
        tag !== 'VIDEO' &&
        tag !== 'AUDIO' &&
        tag !== 'IFRAME' &&
        tag !== 'TABLE' &&
        tag !== 'TR' &&
        tag !== 'TD' &&
        tag !== 'TH' &&
        tag !== 'THEAD' &&
        tag !== 'TBODY' &&
        tag !== 'TFOOT' &&
        tag !== 'CAPTION' &&
        tag !== 'COLGROUP' &&
        tag !== 'COL'
      ) {
        if (!n.textContent.trim() && !n.querySelector('img, video, audio, canvas, iframe')) {
          toRemove.push(n);
          continue;
        }
      }

      // 3c. Handle <br> — collapse consecutive <br>s into one
      if (tag === 'BR') {
        let next = n.nextSibling;
        while (next && next.nodeType === Node.TEXT_NODE && !next.textContent.trim()) {
          next = next.nextSibling;
        }
        if (next && next.nodeType === Node.ELEMENT_NODE && next.tagName === 'BR') {
          // This <br> has another <br> right after it — remove this one
          toRemove.push(n);
        }
        continue;
      }

      // 3d. Empty <p></p> — remove entirely
      if (tag === 'P' && n.children.length === 0 && !n.textContent.trim()) {
        toRemove.push(n);
        continue;
      }
    }

    toRemove.forEach((n) => n.remove());

    // 4. Normalize code blocks: handle <pre><code> + data-* language attrs
    el.querySelectorAll('pre code').forEach((code) => {
      const pre = code.parentElement;
      if (pre.tagName !== 'PRE') return;
      // Priority: class="language-*" > data-language > data-lang > none
      const lang =
        code.className.match(/language-(\w+)/)?.[1] ||
        code.getAttribute('data-language') ||
        pre.getAttribute('data-language') ||
        pre.getAttribute('data-lang') ||
        '';
      // Keep the <code> child in place (Turndown's fencedCodeBlock rule
      // reads language from <code>.className), and also mirror to <pre>
      code.className = 'language-' + lang;
      pre.className = 'language-' + lang;
    });

    // 5. Inline <code> not inside <pre> — mark with a data attribute so
    //    the Turndown rule can distinguish them from block code
    el.querySelectorAll('code').forEach((c) => {
      if (!c.closest('pre')) {
        c.setAttribute('data-inline-code', '');
      }
    });

    // 6. Mermaid diagrams
    el.querySelectorAll('.mermaid, pre.mermaid, div.mermaid, [data-processed="true"].mermaid').forEach((m) => {
      const pre = document.createElement('pre');
      pre.className = 'language-mermaid';
      pre.textContent = m.textContent;
      m.replaceWith(pre);
    });

    // (MathJax handled in step 0 above — before script removal)

    // 8. Resolve relative URLs
    el.querySelectorAll('a[href]').forEach((a) => {
      const href = a.getAttribute('href');
      if (!href) return;
      if (/^(https?|mailto|javascript|#|data):/.test(href)) return;
      try {
        a.href = new URL(href, window.location.origin).href;
      } catch (_) {}
    });

    el.querySelectorAll('img[src]').forEach((img) => {
      if (!img.alt && !img.getAttribute('alt')) img.alt = '';
      const src = img.getAttribute('src');
      if (!src) return;
      if (src.startsWith('http') || src.startsWith('data:')) return;
      try {
        img.src = new URL(src, window.location.origin).href;
      } catch (_) {}
    });

    // 9. Task-list checkboxes — convert to [x] / [ ] text so Turndown
    //    doesn't strip them
    el.querySelectorAll('li input[type="checkbox"]').forEach((cb) => {
      const text = cb.checked ? '[x] ' : '[ ] ';
      cb.replaceWith(document.createTextNode(text));
    });
  }

  const JUNK_TAGS_SEL = Array.from(new Set([...JUNK_TAGS, ...RAW_REMOVE_TAGS])).join(',');

  function buildTurndownService(options) {
    const td = new TurndownService({
      headingStyle: 'atx',
      hr: '---',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
      fence: '```',
      emDelimiter: '*',
      strongDelimiter: '**',
      linkStyle: 'inlined',
      linkReferenceStyle: 'full',
      preformattedCode: true,
    });

    // -----------------------------------------------------------------------
    // Links — preserve title, skip empty / javascript: / void anchors
    // -----------------------------------------------------------------------
    td.addRule('links', {
      filter: (node) => node.nodeName === 'A' && node.getAttribute('href'),
      replacement: (content, node) => {
        const href = node.getAttribute('href');
        if (!href || href === '#' || /^javascript:/.test(href)) return content;
        const title = node.getAttribute('title');
        return `[${content}](${href}${title ? ` "${title}"` : ''})`;
      },
    });

    // -----------------------------------------------------------------------
    // Images — toggle on/off; handle srcset (pick largest)
    // -----------------------------------------------------------------------
    const imgRule =
      options.includeImages !== false
        ? {
            filter: 'img',
            replacement: (_content, node) => {
              const alt = node.getAttribute('alt') || '';
              let src = node.getAttribute('src') || '';
              // Prefer srcset largest candidate over plain src when available
              const srcset = node.getAttribute('srcset');
              if (srcset) {
                const candidates = srcset
                  .split(',')
                  .map((s) => s.trim().split(/\s+/))
                  .filter(([url]) => url && !url.startsWith('data:'))
                  .sort((a, b) => {
                    const wa = parseInt(a[1]) || 0;
                    const wb = parseInt(b[1]) || 0;
                    return wb - wa; // largest first
                  });
                if (candidates.length) src = candidates[0][0];
              }
              const title = node.getAttribute('title') || '';
              if (!src) return alt ? `[${alt}]` : '';
              return `![${alt}](${src}${title ? ` "${title}"` : ''})`;
            },
          }
        : {
            filter: 'img',
            replacement: (_content, node) => {
              const alt = node.getAttribute('alt') || '';
              return alt ? `[📷 ${alt}]` : '';
            },
          };

    td.addRule('images', imgRule);

    // -----------------------------------------------------------------------
    // <figure> + <figcaption> → image with italic caption
    // -----------------------------------------------------------------------
    td.addRule('figure', {
      filter: 'figure',
      replacement: (content, node) => {
        const img = node.querySelector('img');
        const cap = node.querySelector('figcaption');
        if (img && cap) {
          const alt = img.getAttribute('alt') || '';
          const src = img.getAttribute('src') || '';
          if (!src) return content;
          return `![${alt}](${src})\n*${cap.textContent.trim()}*\n`;
        }
        return content;
      },
    });

    // -----------------------------------------------------------------------
    // Strikethrough <del>, <s> → ~~text~~
    // -----------------------------------------------------------------------
    td.addRule('strikethrough', {
      filter: ['del', 's', 'strike'],
      replacement: (content) => '~~' + content + '~~',
    });

    // -----------------------------------------------------------------------
    // Table block — ensure proper spacing around tables
    // -----------------------------------------------------------------------
    td.addRule('table', {
      filter: 'table',
      replacement: (content) => '\n' + content.trim() + '\n',
    });

    // -----------------------------------------------------------------------
    // Table row — handle header detection, colspan, rowspan, and
    // preserve inner formatting via Turndown recursion
    // -----------------------------------------------------------------------
    const rowspanTracker = new WeakMap();

    td.addRule('tableRow', {
      filter: 'tr',
      replacement: (_content, node) => {
        const table = node.closest('table');
        if (!table) return '';

        // Initialise rowspan tracking per table
        if (!rowspanTracker.has(table)) {
          rowspanTracker.set(table, []);
        }
        const activeRowspans = rowspanTracker.get(table);

        const cells = node.querySelectorAll('th, td');
        if (!cells.length) return '';

        // Detect header row: <thead> parent OR any <th> cells
        const isHeader = node.parentNode?.nodeName === 'THEAD' || !!node.querySelector('th');

        let colIndex = 0;
        const parts = [];
        const aligns = [];

        for (const cell of cells) {
          // Skip columns still occupied by rowspan from a previous row
          while (activeRowspans[colIndex]) {
            activeRowspans[colIndex]--;
            if (activeRowspans[colIndex] <= 0) activeRowspans[colIndex] = 0;
            colIndex++;
          }

          const colspan = parseInt(cell.getAttribute('colspan')) || 1;
          const rowspan = parseInt(cell.getAttribute('rowspan')) || 1;

          // Process cell content through Turndown so inline formatting
          // (bold, italic, code, links, images) is preserved
          let cellContent = '';
          try {
            cellContent = td.turndown(cell.innerHTML).trim();
          } catch (_e) {
            cellContent = (cell.textContent || '').trim();
          }
          // Collapse multiline to single line (pipe tables don't support
          // multi-line cells reliably in most renderers)
          cellContent = cellContent
            .replace(/\n{2,}/g, ' ')
            .replace(/\n/g, ' ')
            .replace(/[ \t]+/g, ' ');
          if (!cellContent) cellContent = ' ';

          // Register rowspan: occupy spanned columns in future rows
          if (rowspan > 1) {
            for (let c = 0; c < colspan; c++) {
              activeRowspans[colIndex + c] = Math.max(activeRowspans[colIndex + c] || 0, rowspan - 1);
            }
          }

          // Build cell (handle colspan by repeating content across columns)
          if (colspan > 1) {
            parts.push(Array(colspan).fill(cellContent).join(' | '));
          } else {
            parts.push(cellContent);
          }

          // Alignment markers (header row only)
          if (isHeader) {
            const align = cell.getAttribute('align') || '';
            const marker =
              align === 'left' ? ':---' : align === 'center' ? ':---:' : align === 'right' ? '---:' : '---';
            if (colspan > 1) {
              aligns.push(Array(colspan).fill(marker).join(' | '));
            } else {
              aligns.push(marker);
            }
          }

          colIndex += colspan;
        }

        const rowStr = '| ' + parts.join(' | ') + ' |\n';

        if (isHeader) {
          return rowStr + '| ' + aligns.join(' | ') + ' |\n';
        }

        return rowStr;
      },
    });

    // -----------------------------------------------------------------------
    // <details> / <summary> → summary in bold, then content
    // -----------------------------------------------------------------------
    td.addRule('skipSummary', {
      filter: 'summary',
      replacement: () => '',
    });

    td.addRule('details', {
      filter: 'details',
      replacement: (content, node) => {
        const summary = node.querySelector('summary');
        const summaryText = summary ? summary.textContent.trim() : '';
        if (summaryText) {
          return '\n**' + summaryText + '**\n\n' + content.trim() + '\n\n';
        }
        return '\n' + content.trim() + '\n\n';
      },
    });

    // -----------------------------------------------------------------------
    // Definition lists <dl> <dt> <dd> → ``term\n: definition``
    // -----------------------------------------------------------------------
    td.addRule('definitionList', {
      filter: 'dl',
      replacement: (content, node) => {
        const items = [];
        let currentDt = null;
        for (const child of node.childNodes) {
          if (child.nodeType !== Node.ELEMENT_NODE) continue;
          if (child.tagName === 'DT') {
            // Save previous item if any
            if (currentDt !== null) items.push(currentDt);
            currentDt = child.textContent.trim();
          } else if (child.tagName === 'DD' && currentDt !== null) {
            const ddText = child.textContent.trim();
            items.push(currentDt + '\n: ' + ddText.replace(/\n/g, '\n  '));
            currentDt = null;
          }
        }
        if (currentDt !== null) items.push(currentDt);
        return '\n' + items.join('\n') + '\n';
      },
    });

    // -----------------------------------------------------------------------
    // Mermaid diagram blocks → ```mermaid
    // -----------------------------------------------------------------------
    td.addRule('mermaid', {
      filter: (node) =>
        node.nodeName === 'PRE' &&
        (node.className.includes('language-mermaid') ||
          /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|gitGraph|mindmap|timeline|journey|quadrantChart|sankey|xychart|block|packet|architecture|kanban)\b/m.test(
            node.textContent.trim(),
          )),
      replacement: (content) => '\n```mermaid\n' + content.trim() + '\n```\n',
    });

    // -----------------------------------------------------------------------
    // Math block → ```math
    // -----------------------------------------------------------------------
    td.addRule('mathBlock', {
      filter: (node) => node.nodeName === 'PRE' && node.className.includes('language-math'),
      replacement: (content) => '\n```math\n' + content.trim() + '\n```\n',
    });

    // -----------------------------------------------------------------------
    // Video / Audio / Iframe → Markdown link
    // -----------------------------------------------------------------------
    td.addRule('embeddedMedia', {
      filter: ['video', 'audio'],
      replacement: (_content, node) => {
        const src = node.getAttribute('src') || node.querySelector('source')?.getAttribute('src') || '';
        if (!src) return '';
        const title = node.getAttribute('title') || node.tagName.toLowerCase();
        return `[${title}](${src})`;
      },
    });

    td.addRule('iframe', {
      filter: 'iframe',
      replacement: (_content, node) => {
        const src = node.getAttribute('src') || '';
        if (!src) return '';
        // Detect YouTube
        const ytMatch = src.match(/(?:youtube\.com\/embed\/|youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        if (ytMatch) {
          return `[▶ YouTube: ${ytMatch[1]}](${src})`;
        }
        // Detect Vimeo
        if (/player\.vimeo\.com\/video\//.test(src)) {
          return `[▶ Vimeo](${src})`;
        }
        const title = node.getAttribute('title') || 'Embedded content';
        return `[${title}](${src})`;
      },
    });

    // -----------------------------------------------------------------------
    // Inline code (<code> not inside <pre>) — ensure proper backtick escaping
    // -----------------------------------------------------------------------
    td.addRule('inlineCode', {
      filter: (node) => node.nodeName === 'CODE' && node.hasAttribute('data-inline-code'),
      replacement: (content) => {
        const trimmed = content.trim();
        // If content contains backticks, use double backticks
        if (/`/.test(trimmed)) return '`` ' + trimmed + ' ``';
        return '`' + trimmed + '`';
      },
    });

    // Keep these inline tags as-is (Turndown will wrap in Markdown)
    td.keep(['kbd', 'mark', 'abbr', 'dfn', 'sub', 'sup', 'small']);

    return td;
  }

  function buildHeader(meta, options) {
    if (options.includeFrontmatter !== false) {
      const esc = (s) => s.replace(/"/g, '\\"');
      return [
        '---',
        `title: "${esc(meta.title)}"`,
        `source: ${meta.url}`,
        meta.description && `description: "${esc(meta.description)}"`,
        meta.published && `date: ${meta.published}`,
        meta.image && `image: ${meta.image}`,
        `converted: ${new Date().toISOString()}`,
        '---\n\n',
      ]
        .filter(Boolean)
        .join('\n');
    }

    if (options.includeTitle !== false) {
      let h = `# ${meta.title}\n\n`;
      if (options.includeSource !== false) h += `> Source: [${meta.url}](${meta.url})\n\n`;
      return h;
    }

    return '';
  }

  // ---------------------------------------------------------------------------
  // Decode all HTML entities via the browser's DOM (full coverage)
  // ---------------------------------------------------------------------------
  function decodeEntities(str) {
    if (!/&[#a-zA-Z0-9]+;/.test(str)) return str;
    const doc = new DOMParser().parseFromString(str, 'text/html');
    return doc.body.textContent || str;
  }

  // ---------------------------------------------------------------------------
  // Heuristic: does a $…$ fragment look like real LaTeX math?
  // ---------------------------------------------------------------------------
  function looksLikeMath(s) {
    const trimmed = s.trim();
    if (trimmed.length < 2) return false;
    if (/\\[a-zA-Z]+/.test(trimmed)) return true; // \frac, \sum, \alpha…
    if (/[{}]/.test(trimmed)) return true; // { } braces
    if (/[_^]/.test(trimmed)) return true; // subscript/superscript
    if (/\\\(|\\\)/.test(trimmed)) return true; // \( \)
    if (/\\\[|\\\]/.test(trimmed)) return true; // \[ \]
    return false;
  }

  // ---------------------------------------------------------------------------
  // Normalize consecutive blank lines (max 2)
  // ---------------------------------------------------------------------------
  function normalizeBlankLines(text) {
    return text
      .split('\n')
      .reduce((acc, line) => {
        const prev = acc[acc.length - 1];
        const prev2 = acc[acc.length - 2];
        if (line === '' && prev === '' && prev2 === '') return acc;
        acc.push(line);
        return acc;
      }, [])
      .join('\n');
  }

  // ---------------------------------------------------------------------------
  // cleanMarkdown — post-processing pipeline with named steps
  // ---------------------------------------------------------------------------
  function cleanMarkdown(md) {
    // Step 1: decode all HTML entities (single pass via DOMParser)
    md = decodeEntities(md);

    // Step 2: display math $$…$$ → ```math```
    md = md.replace(/\$\$([\s\S]+?)\$\$/g, (_, body) => {
      return '\n```math\n' + body.trim() + '\n```\n';
    });

    // Step 3: inline math $…$ → `…` or escaped \$…\$
    md = md.replace(/\$([^$\n\r]+?)\$/g, (_, body) => {
      return looksLikeMath(body) ? '`' + body.trim() + '`' : '\\$' + body.trim() + '\\$';
    });

    // Step 4: strip trailing whitespace per line
    md = md
      .split('\n')
      .map((l) => l.replace(/[ \t]+$/, ''))
      .join('\n');

    // Step 5: normalize blank lines (max 2 consecutive)
    md = normalizeBlankLines(md);

    // Step 6: remove empty link/image references, empty blockquotes
    md = md
      .replace(/\[\]\([^)]*\)\n?/g, '') // []()
      .replace(/\[( )?\]\([^)]*\)/g, '') // [ ]() or [ ]()
      .replace(/!\[\]\([^)]*\)\n?/g, '') // ![]()
      .replace(/^>\s*$\n?/gm, '') // empty blockquote lines
      .replace(/\n{3,}/g, '\n\n'); // max 1 blank line

    return md.trim();
  }

  function convertToMarkdown(options) {
    const meta = getPageMetadata();
    const isReadability = options.extractionMode !== 'raw' && !options.selector;

    const extractResult = isReadability
      ? extractWithReadability() || extractRaw(options.selector)
      : extractRaw(options.selector);

    const wrapper = document.createElement('div');
    wrapper.innerHTML = extractResult.html;

    const turndownService = buildTurndownService(options);
    const markdown = cleanMarkdown(turndownService.turndown(wrapper));

    return {
      markdown: buildHeader(meta, options) + markdown,
      cleanHtml: extractResult.html,
      plainText: extractResult.textContent,
    };
  }

  // ---------------------------------------------------------------------------
  // Selection Conversion — DOM matching, expand to nearest parent, normalise
  // ---------------------------------------------------------------------------

  /**
   * Check if an element is an inline-level HTML element.
   * Inline elements contain phrasing content and should not cause line breaks.
   */
  function isInlineElement(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    const INLINE_TAGS = new Set([
      'A', 'ABBR', 'ACRONYM', 'B', 'BDO', 'BIG', 'BR', 'BUTTON', 'CITE', 'CODE',
      'DFN', 'EM', 'I', 'IMG', 'INPUT', 'KBD', 'LABEL', 'MAP', 'OBJECT', 'OUTPUT',
      'Q', 'SAMP', 'SELECT', 'SMALL', 'SPAN', 'STRONG', 'SUB', 'SUP', 'TEXTAREA',
      'TIME', 'TT', 'U', 'VAR', 'WBR',
    ]);
    return INLINE_TAGS.has(node.nodeName);
  }

  /**
   * Expand a selection Range so boundaries that fall mid-text-node within an
   * inline element cover the entire element.
   *
   * This solves the "string matching" problem: when a user selects partial
   * text inside <strong>, <em>, <a>, etc., the expanded range captures the
   * complete formatted content rather than a broken fragment.
   *
   * @param {Range} range — the original selection Range
   * @returns {Range} a new Range with expanded boundaries
   */
  function expandRangeToNearestParent(range) {
    const newRange = range.cloneRange();
    const sc = range.startContainer;
    const so = range.startOffset;
    const ec = range.endContainer;
    const eo = range.endOffset;

    // --- Expand start boundary ---
    if (sc.nodeType === Node.TEXT_NODE && so > 0) {
      const parent = sc.parentNode;
      if (parent && isInlineElement(parent) && parent.parentNode) {
        const gp = parent.parentNode;
        const idx = Array.from(gp.childNodes).indexOf(parent);
        newRange.setStart(gp, idx);
      } else {
        // Parent is a block element — only go to text node start
        newRange.setStart(sc, 0);
      }
    }

    // --- Expand end boundary ---
    if (ec.nodeType === Node.TEXT_NODE && eo < ec.textContent.length) {
      const parent = ec.parentNode;
      if (parent && isInlineElement(parent) && parent.parentNode) {
        const gp = parent.parentNode;
        const idx = Array.from(gp.childNodes).indexOf(parent);
        newRange.setEnd(gp, idx + 1);
      } else {
        newRange.setEnd(ec, ec.textContent.length);
      }
    }

    return newRange;
  }

  /**
   * Normalise the Markdown output from a selection conversion:
   * trim leading/trailing whitespace, fix line endings, collapse
   * excessive blank lines.
   */
  function normalizeSelectionText(md) {
    if (!md) return '';
    return md
      .trim()
      .replace(/\r\n/g, '\n')
      .replace(/\n{4,}/g, '\n\n\n')
      .replace(/[ \t]+$/gm, '');
  }

  /**
   * Convert the current page selection to Markdown.
   *
   * Pipeline:
   *  1. Grab the Selection & Range
   *  2. Optionally expand to nearest parent (DOM matching)
   *  3. Clone the DOM subtree
   *  4. Run through Turndown with user options
   *  5. Clean & normalise the Markdown output
   *  6. Build header with selection metadata
   *
   * @param {Object} options — user options (expandSelection, includeFrontmatter, etc.)
   * @returns {{success: boolean, markdown?: string, error?: string}}
   */
  function convertSelectionToMarkdown(options) {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) {
      return { success: false, error: 'No text selected' };
    }

    try {
      const range = selection.getRangeAt(0);

      // Step 1: Expand selection to nearest parent elements (DOM matching)
      const effectiveRange =
        options.expandSelection !== false
          ? expandRangeToNearestParent(range)
          : range;

      // Step 2: Clone the DOM subtree from the (possibly expanded) range
      const fragment = effectiveRange.cloneContents();
      const container = document.createElement('div');
      container.appendChild(fragment);

      // Step 3: Normalise the DOM (remove junk, resolve URLs, etc.)
      normalizeDom(container);

      // Step 4: Build Turndown service with user options
      const td = buildTurndownService(options);

      // Step 5: Convert to Markdown
      let md = td.turndown(container);

      // Step 6: Clean the Markdown output (shared pipeline)
      md = cleanMarkdown(md);

      // Step 7: Normalise selection-specific text (trim, blank lines)
      md = normalizeSelectionText(md);

      // Step 8: Build header (frontmatter or simple heading)
      const meta = getPageMetadata();
      const header = buildHeader(meta, options);

      return {
        success: true,
        markdown: header + md,
      };
    } catch (e) {
      return {
        success: false,
        error: e.message || 'Selection conversion failed',
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Toast notification — visible feedback on the page
  // ---------------------------------------------------------------------------
  function showToast(message, type) {
    const existing = document.getElementById('web2md-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'web2md-toast';

    const bg = type === 'error' ? '#e53935' : type === 'warning' ? '#ff9800' : '#4caf50';
    const icon = type === 'error' ? '\u2717' : type === 'warning' ? '\u26A0' : '\u2713';

    toast.textContent = icon + ' ' + message;

    Object.assign(toast.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
      padding: '12px 20px',
      background: bg,
      color: '#fff',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: '14px',
      fontWeight: '500',
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      zIndex: '2147483647',
      maxWidth: '400px',
      opacity: '0',
      transform: 'translateY(-10px)',
      transition: 'opacity 0.3s ease, transform 0.3s ease',
      pointerEvents: 'none',
    });

    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === 'convert') {
      try {
        const result = convertToMarkdown(request.options || {});
        sendResponse({ success: true, ...result });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    } else if (request.action === 'convertSelection') {
      const result = convertSelectionToMarkdown(request.options || {});
      sendResponse(result);
    } else if (request.action === 'getTitle') {
      sendResponse({ title: document.title, url: window.location.href });
    } else if (request.action === 'showToast') {
      showToast(request.message, request.type || 'success');
    }
    return true;
  });

  // Expose internals for testing (jsdom / browser test runners)
  if (typeof window !== 'undefined') {
    window.__web2md = {
      normalizeDom,
      buildTurndownService,
      cleanMarkdown,
      getPageMetadata,
      extractWithReadability,
      extractRaw,
      convertToMarkdown,
      isInlineElement,
      expandRangeToNearestParent,
      normalizeSelectionText,
      convertSelectionToMarkdown,
    };
  }
})();
