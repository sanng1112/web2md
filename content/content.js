(() => {
  'use strict';

  function getPageMetadata() {
    const canonical = document.querySelector('link[rel="canonical"]');
    const ogTitle = document.querySelector('meta[property="og:title"]');
    const ogDesc = document.querySelector('meta[property="og:description"]');
    const ogImage = document.querySelector('meta[property="og:image"]');
    const published = document.querySelector('meta[property="article:published_time"]');
    const favicon = document.querySelector('link[rel="icon"]')?.href ||
                    document.querySelector('link[rel="shortcut icon"]')?.href || '';

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
      article = document.querySelector(
        'article, [role="main"], main, .post-content, .article-content, .entry-content, #content, .content, .markdown-body'
      );
    }
    article = article ? article.cloneNode(true) : document.body.cloneNode(true);
    normalizeDom(article);
    return { html: article.innerHTML, title: document.title, textContent: article.textContent || '' };
  }

  const STRUCTURAL_JUNK = [
    'script', 'style', 'noscript', 'iframe', 'object', 'embed', 'svg',
    'nav', 'footer', 'header', 'form',
    '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]', '[role="complementary"]',
    '[aria-hidden="true"]',
    '.sidebar', '.side-bar', '.widget', '.aside',
    '.ad', '.ads', '.advertisement', '.ad-container', '[class*="ad-"]', '[id*="google_ads"]',
    '.social-share', '.social-links', '.share-buttons', '[class*="share-"]',
    '.comments', '#comments', '.comment-section', '[class*="comment-"]',
    '.related-posts', '.related-articles', '.you-may-also-like',
    '.breadcrumb', '.breadcrumbs', '[class*="breadcrumb"]',
    '.cookie-banner', '.cookie-consent', '#cookie-notice', '[class*="cookie-"]',
    '.gdpr', '.consent-banner', '[class*="consent-"]',
    '.newsletter', '.subscribe', '.signup-form',
    '.pagination', '.page-nav', '.prev-next',
    '.modal', '.popup', '.overlay', '.lightbox',
  ].join(',');

  function isHidden(n) {
    if (n.hasAttribute('hidden')) return true;
    const s = n.style;
    if (s && (s.display === 'none' || s.visibility === 'hidden')) return true;
    return n.offsetParent === null && getComputedStyle(n).display === 'none';
  }

  function pruneEmpties(el) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT, {
      acceptNode: (node) => {
        const tag = node.tagName;
        if (tag === 'BR' || tag === 'HR' || tag === 'IMG' || tag === 'INPUT' || tag === 'WBR') return NodeFilter.FILTER_SKIP;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      if (!n.textContent.trim() && !n.querySelector('img, svg, canvas, video, iframe')) {
        n.remove();
      }
    }
  }

  function normalizeDom(el) {
    el.querySelectorAll(STRUCTURAL_JUNK).forEach((n) => n.remove());

    el.querySelectorAll('[style*="display:none"], [style*="display: none"], [hidden]').forEach((n) => {
      if (isHidden(n)) n.remove();
    });

    pruneEmpties(el);

    el.querySelectorAll('pre code').forEach((code) => {
      const pre = code.parentElement;
      if (pre.tagName === 'PRE') {
        const langClass = code.className.match(/language-(\w+)/)?.[1];
        pre.className = 'language-' + (langClass || '');
        pre.textContent = code.textContent;
      }
    });

    el.querySelectorAll('.mermaid, pre.mermaid, div.mermaid, [data-processed="true"].mermaid').forEach((m) => {
      const pre = document.createElement('pre');
      pre.className = 'language-mermaid';
      pre.textContent = m.textContent;
      m.replaceWith(pre);
    });

    el.querySelectorAll('a[href]').forEach((a) => {
      const href = a.getAttribute('href');
      if (href && !href.startsWith('http') && !href.startsWith('#') && !href.startsWith('mailto:') && !href.startsWith('javascript:')) {
        try { a.href = new URL(href, window.location.origin).href; } catch (_) {}
      }
    });

    el.querySelectorAll('img[src]').forEach((img) => {
      if (!img.alt && !img.getAttribute('alt')) img.alt = '';
      const src = img.getAttribute('src');
      if (src && !src.startsWith('http') && !src.startsWith('data:')) {
        try { img.src = new URL(src, window.location.origin).href; } catch (_) {}
      }
    });
  }

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

    td.addRule('links', {
      filter: (node) => node.nodeName === 'A' && node.getAttribute('href'),
      replacement: (content, node) => {
        const title = node.getAttribute('title');
        return `[${content}](${node.getAttribute('href')}${title ? ` "${title}"` : ''})`;
      },
    });

    const imgRule = options.includeImages !== false
      ? {
          filter: 'img',
          replacement: (_content, node) => {
            const alt = node.getAttribute('alt') || '';
            const src = node.getAttribute('src') || '';
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

    td.addRule('strikethrough', {
      filter: ['del', 's'],
      replacement: (content) => '~~' + content + '~~',
    });

    td.addRule('tableCell', {
      filter: ['th', 'td'],
      replacement: (content) => content.trim(),
    });

    td.addRule('details', {
      filter: 'details',
      replacement: (content) => '\n' + content + '\n',
    });

    td.addRule('mermaid', {
      filter: (node) =>
        node.nodeName === 'PRE' && (
          node.className.includes('language-mermaid') ||
          /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|gitGraph|mindmap|timeline|journey|quadrantChart|sankey|xychart|block|packet|architecture|kanban)\b/m
            .test(node.textContent.trim())
        ),
      replacement: (content) => '\n```mermaid\n' + content.trim() + '\n```\n',
    });

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
      ].filter(Boolean).join('\n');
    }

    if (options.includeTitle !== false) {
      let h = `# ${meta.title}\n\n`;
      if (options.includeSource !== false) h += `> Source: [${meta.url}](${meta.url})\n\n`;
      return h;
    }

    return '';
  }

  function cleanMarkdown(md) {
    return md
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .split('\n')
      .map((l) => l.replace(/[ \t]+$/, ''))
      .filter((l, i, arr) => {
        if (l === '' && arr[i - 1] === '' && arr[i - 2] === '') return false;
        return true;
      })
      .join('\n')
      .replace(/\[\]\([^)]*\)\n?/g, '')
      .replace(/\[( )?\]\([^)]*\)/g, '')
      .replace(/!\[\]\([^)]*\)\n?/g, '')
      .replace(/^>\s*$\n?/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function convertToMarkdown(options) {
    const meta = getPageMetadata();
    const isReadability = options.extractionMode !== 'raw' && !options.selector;

    const extractResult = isReadability
      ? (extractWithReadability() || extractRaw(options.selector))
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

  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === 'convert') {
      try {
        const result = convertToMarkdown(request.options || {});
        sendResponse({ success: true, ...result });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    } else if (request.action === 'getTitle') {
      sendResponse({ title: document.title, url: window.location.href });
    }
    return true;
  });
})();
