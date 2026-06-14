/**
 * Web2md Unit Test Suite
 *
 * Tests the core HTML → Markdown conversion logic using Node.js + jsdom.
 * No real browser needed — this validates the algorithm directly.
 *
 * Usage:
 *   node test/test-conversion.mjs
 */

import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── Load turndown into a jsdom context ─────────────────────────────────────
const turndownSrc = readFileSync(join(ROOT, 'lib/turndown.js'), 'utf-8');
const fixtureHtml = readFileSync(join(__dirname, 'test-fixture.html'), 'utf-8');

// ── Helpers ────────────────────────────────────────────────────────────────

let PASS = 0;
let FAIL = 0;
let failList = [];

function resetCounters() {
  PASS = 0; FAIL = 0; failList = [];
}

function check(label, condition, detail) {
  if (condition) {
    PASS++;
    console.log(`  ✅ ${label}`);
  } else {
    FAIL++;
    failList.push(label);
    console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`);
  }
}

// ── Create DOM from fixture HTML ──────────────────────────────────────────

function createDom(html) {
  const dom = new JSDOM(html, {
    url: 'https://example.com/test-article',
    contentType: 'text/html',
    runScripts: 'dangerously',
  });
  // Load turndown via <script> element so the constructor lands on the window
  const script = dom.window.document.createElement('script');
  script.textContent = turndownSrc;
  dom.window.document.head.appendChild(script);
  return dom;
}

// ── Conversion functions (extracted from content.js) ───────────────────────

function extractConversionLogic(dom) {
  // jsdom does not expose NodeFilter / Node as globals — get them from the window
  const NodeFilter = dom.window.NodeFilter;
  const { ELEMENT_NODE, TEXT_NODE } = dom.window.Node;

  function normalizeDom(el) {
    const JUNK_SELECTORS = 'nav,footer,form,.sidebar,.side-bar,.widget,.aside,.ad,.ads,.advertisement,.ad-container,.social-share,.social-links,.share-buttons,.comments,#comments,.comment-section,.related-posts,.related-articles,.you-may-also-like,.breadcrumb,.breadcrumbs,.cookie-banner,.cookie-consent,#cookie-notice,.gdpr,.consent-banner,.newsletter,.subscribe,.signup-form,.pagination,.page-nav,.prev-next,.modal,.popup,.overlay,.lightbox';
    const JUNK_TAGS_SEL = 'script,style,noscript,object,embed,svg';

    el.querySelectorAll(JUNK_TAGS_SEL).forEach(n => n.remove());
    el.querySelectorAll(JUNK_SELECTORS).forEach(n => n.remove());

    const walker = dom.window.document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, null, false);
    const toRemove = [];
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.nodeType === TEXT_NODE) continue;
      const tag = n.tagName;

      if (n.hasAttribute('hidden') || (n.style && (n.style.display === 'none' || n.style.visibility === 'hidden'))) {
        toRemove.push(n); continue;
      }
      if (tag !== 'BR' && tag !== 'HR' && tag !== 'IMG' && tag !== 'INPUT' && tag !== 'WBR' && tag !== 'VIDEO' && tag !== 'AUDIO' && tag !== 'IFRAME') {
        if (!n.textContent.trim() && !n.querySelector('img, video, audio, canvas, iframe')) {
          toRemove.push(n); continue;
        }
      }
      if (tag === 'BR') {
        let next = n.nextSibling;
        while (next && next.nodeType === Node.TEXT_NODE && !next.textContent.trim()) next = next.nextSibling;
        if (next && next.nodeType === Node.ELEMENT_NODE && next.tagName === 'BR') {
          toRemove.push(n);
        }
        continue;
      }
      if (tag === 'P' && n.children.length === 0 && !n.textContent.trim()) {
        toRemove.push(n); continue;
      }
    }
    toRemove.forEach(n => n.remove());

    el.querySelectorAll('pre code').forEach(code => {
      const pre = code.parentElement;
      if (pre.tagName !== 'PRE') return;
      const lang = (code.className.match(/language-(\w+)/) || [])[1]
        || code.getAttribute('data-language')
        || pre.getAttribute('data-language')
        || pre.getAttribute('data-lang')
        || '';
      // Keep the <code> child in place (Turndown's fencedCodeBlock rule
      // reads language from <code>.className), and also mirror to <pre>
      code.className = 'language-' + lang;
      pre.className = 'language-' + lang;
    });

    el.querySelectorAll('code').forEach(c => {
      if (!c.closest('pre')) c.setAttribute('data-inline-code', '');
    });

    el.querySelectorAll('.mermaid, pre.mermaid, div.mermaid, [data-processed="true"].mermaid').forEach(m => {
      const pre = dom.window.document.createElement('pre');
      pre.className = 'language-mermaid';
      pre.textContent = m.textContent;
      m.replaceWith(pre);
    });

    el.querySelectorAll('a[href]').forEach(a => {
      const href = a.getAttribute('href');
      if (!href || /^(https?:|mailto:|javascript:|#|data:)/.test(href)) return;
      try { a.href = new dom.window.URL(href, dom.window.location.origin).href; } catch(e) {}
    });

    el.querySelectorAll('img[src]').forEach(img => {
      if (!img.alt) img.alt = '';
      const src = img.getAttribute('src');
      if (!src || src.startsWith('http') || src.startsWith('data:')) return;
      try { img.src = new dom.window.URL(src, dom.window.location.origin).href; } catch(e) {}
    });

    el.querySelectorAll('li input[type="checkbox"]').forEach(cb => {
      const text = cb.checked ? '[x] ' : '[ ] ';
      cb.replaceWith(dom.window.document.createTextNode(text));
    });
  }

  const TurndownService = dom.window.TurndownService;

  function buildTurndownService(options) {
    const td = new TurndownService({
      headingStyle: 'atx', hr: '---', bulletListMarker: '-',
      codeBlockStyle: 'fenced', fence: '```',
      emDelimiter: '*', strongDelimiter: '**',
      linkStyle: 'inlined', linkReferenceStyle: 'full', preformattedCode: true,
    });

    td.addRule('links', {
      filter: node => node.nodeName === 'A' && node.getAttribute('href'),
      replacement: (content, node) => {
        const href = node.getAttribute('href');
        if (!href || href === '#' || /^javascript:/.test(href)) return content;
        const title = node.getAttribute('title');
        return '[' + content + '](' + href + (title ? ' "' + title + '"' : '') + ')';
      },
    });

    if (options.includeImages !== false) {
      td.addRule('images', {
        filter: 'img',
        replacement: (_c, node) => {
          const alt = node.getAttribute('alt') || '';
          const src = node.getAttribute('src') || '';
          const title = node.getAttribute('title') || '';
          if (!src) return alt ? '[' + alt + ']' : '';
          return '![' + alt + '](' + src + (title ? ' "' + title + '"' : '') + ')';
        },
      });
    }

    td.addRule('figure', {
      filter: 'figure',
      replacement: (content, node) => {
        const img = node.querySelector('img');
        const cap = node.querySelector('figcaption');
        if (img && cap) {
          const alt = img.getAttribute('alt') || '';
          const src = img.getAttribute('src') || '';
          if (!src) return content;
          return '![' + alt + '](' + src + ')\n*' + cap.textContent.trim() + '*\n';
        }
        return content;
      },
    });

    td.addRule('strikethrough', {
      filter: ['del', 's', 'strike'],
      replacement: content => '~~' + content + '~~',
    });

    td.addRule('tableCell', {
      filter: ['th', 'td'],
      replacement: content => content.trim(),
    });

    td.addRule('tableRow', {
      filter: 'tr',
      replacement: (_c, node) => {
        const isHeader = node.parentNode && node.parentNode.nodeName === 'THEAD';
        const cells = node.querySelectorAll('th, td');
        const parts = Array.from(cells).map(cell => (cell.textContent || '').trim() || ' ');
        if (isHeader) {
          const aligns = Array.from(cells).map(cell => {
            const align = cell.getAttribute('align') || '';
            return align === 'left' ? ':---' : align === 'center' ? ':---:' : align === 'right' ? '---:' : '---';
          });
          return '| ' + parts.join(' | ') + ' |\n| ' + aligns.join(' | ') + ' |\n';
        }
        return '| ' + parts.join(' | ') + ' |\n';
      },
    });

    td.addRule('details', {
      filter: 'details',
      replacement: (content, node) => {
        const summary = node.querySelector('summary');
        const summaryText = summary ? '**' + summary.textContent.trim() + '**\n\n' : '';
        if (summary) summary.remove();
        return '\n' + summaryText + content.trim() + '\n\n';
      },
    });

    td.addRule('definitionList', {
      filter: 'dl',
      replacement: (_c, node) => {
        const items = [];
        let currentDt = null;
        node.childNodes.forEach(child => {
          if (child.nodeType !== ELEMENT_NODE) return;
          if (child.tagName === 'DT') {
            if (currentDt !== null) items.push(currentDt);
            currentDt = child.textContent.trim();
          } else if (child.tagName === 'DD' && currentDt !== null) {
            items.push(currentDt + '\n: ' + child.textContent.trim());
            currentDt = null;
          }
        });
        if (currentDt !== null) items.push(currentDt);
        return '\n' + items.join('\n') + '\n';
      },
    });

    td.addRule('mermaid', {
      filter: node =>
        node.nodeName === 'PRE' && (
          node.className.indexOf('language-mermaid') >= 0 ||
          /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|gitGraph|mindmap|timeline|journey|quadrantChart|sankey|xychart|block|packet|architecture|kanban)\b/m.test(node.textContent.trim())
        ),
      replacement: content => '\n```mermaid\n' + content.trim() + '\n```\n',
    });

    td.addRule('mathBlock', {
      filter: node => node.nodeName === 'PRE' && node.className.indexOf('language-math') >= 0,
      replacement: content => '\n```math\n' + content.trim() + '\n```\n',
    });

    td.addRule('embeddedMedia', {
      filter: ['video', 'audio'],
      replacement: (_c, node) => {
        const src = node.getAttribute('src') || (node.querySelector('source') ? node.querySelector('source').getAttribute('src') : '') || '';
        if (!src) return '';
        const title = node.getAttribute('title') || node.tagName.toLowerCase();
        return '[' + title + '](' + src + ')';
      },
    });

    td.addRule('iframe', {
      filter: 'iframe',
      replacement: (_c, node) => {
        const src = node.getAttribute('src') || '';
        if (!src) return '';
        const ytMatch = src.match(/(?:youtube\.com\/embed\/|youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        if (ytMatch) return '[▶ YouTube: ' + ytMatch[1] + '](' + src + ')';
        if (/player\.vimeo\.com\/video\//.test(src)) return '[▶ Vimeo](' + src + ')';
        const title = node.getAttribute('title') || 'Embedded content';
        return '[' + title + '](' + src + ')';
      },
    });

    td.addRule('inlineCode', {
      filter: node => node.nodeName === 'CODE' && node.hasAttribute('data-inline-code'),
      replacement: content => {
        const trimmed = content.trim();
        if (/`/.test(trimmed)) return '`` ' + trimmed + ' ``';
        return '`' + trimmed + '`';
      },
    });

    td.keep(['kbd', 'mark', 'abbr', 'dfn', 'sub', 'sup', 'small']);
    return td;
  }

  function cleanMarkdown(md) {
    // Step 1: decode entities
    if (/&[#a-zA-Z0-9]+;/.test(md)) {
      const doc = new dom.window.DOMParser().parseFromString(md, 'text/html');
      md = doc.body.textContent || md;
    }
    // Step 2: display math
    md = md.replace(/\$\$([\s\S]+?)\$\$/g, (_, body) => '\n```math\n' + body.trim() + '\n```\n');
    // Step 3: inline math
    md = md.replace(/\$([^$\n\r]+?)\$/g, (_, body) => {
      const t = body.trim();
      if (t.length >= 2 && (/\\[a-zA-Z]+/.test(t) || /[{}]/.test(t) || /[_^]/.test(t))) return '`' + t + '`';
      return '\\$' + t + '\\$';
    });
    // Step 4: trailing whitespace
    md = md.split('\n').map(l => l.replace(/[ \t]+$/, '')).join('\n');
    // Step 5: normalize blanks
    md = md.split('\n').reduce((acc, line) => {
      const prev = acc[acc.length - 1], prev2 = acc[acc.length - 2];
      if (line === '' && prev === '' && prev2 === '') return acc;
      acc.push(line); return acc;
    }, []).join('\n');
    // Step 6: cleanup
    md = md.replace(/\[\]\([^)]*\)\n?/g, '').replace(/\[( )?\]\([^)]*\)/g, '');
    md = md.replace(/!\[\]\([^)]*\)\n?/g, '').replace(/^>\s*$\n?/gm, '').replace(/\n{3,}/g, '\n\n');
    return md.trim();
  }

  return { normalizeDom, buildTurndownService, cleanMarkdown };
}

// ── Tests ──────────────────────────────────────────────────────────────────

function runTestSuite(description, options) {
  console.log(`\n📋  ${description}`);
  console.log('─'.repeat(60));

  const dom = createDom(fixtureHtml);
  const conv = extractConversionLogic(dom);
  const clone = dom.window.document.body.cloneNode(true);

  // Normalize
  const mainEl = clone.querySelector('main') || clone;
  conv.normalizeDom(mainEl);

  const wrapper = dom.window.document.createElement('div');
  wrapper.innerHTML = mainEl.innerHTML;

  const td = conv.buildTurndownService(options);
  let markdown = td.turndown(wrapper);
  markdown = conv.cleanMarkdown(markdown);

  // Print output (truncated)
  console.log('\n📝  Output (' + markdown.length + ' chars):');
  const lines = markdown.split('\n');
  for (let i = 0; i < Math.min(30, lines.length); i++) console.log('   ' + lines[i]);
  if (lines.length > 30) console.log('   ... (' + (lines.length - 30) + ' more lines)');

  // ── Assertions ──────────────────────────────────────────────────────
  console.log('\n🔬  Assertions:');

  check('Output is not empty', markdown.length > 100, markdown.length + ' chars');
  check('Contains H2 heading', /1\\?\\. Headings Test/.test(markdown));
  check('Bold text **bold**', /\*\*bold\*\*/.test(markdown));
  check('Italic text *italic*', /\*italic\*/.test(markdown));
  check('Strikethrough ~~strikethrough~~', /~~strikethrough~~/.test(markdown));

  check('External link to example.com', /https:\/\/example\.com/.test(markdown));
  check('Link with title attribute', /"Example Title"/.test(markdown));
  check('Relative link resolved absolute', /example\.com\/relative\/path/.test(markdown));

  check('Anchor # link removed (no link generated)', !/\]\(#\)/.test(markdown) || !/Anchor link/.test(markdown));

  check('Image with alt text', /!\[A test image\]/.test(markdown));
  check('Image with title', /"Photo caption"/.test(markdown));
  check('Relative image resolved absolute', /!\[Relative image\]\(https:\/\/example\.com\/relative\/img\.png/.test(markdown));

  check('Figure image with caption', /Figure image/.test(markdown));
  check('Figcaption italic', /\*This is a figure caption\*/.test(markdown));

  check('Code block javascript', /```javascript/.test(markdown));
  check('Code content inside JS block', /function hello/.test(markdown));
  check('Code block from data-language attr', /python/.test(markdown));
  check('Inline code single backticks', /`console\.log\(\)`/.test(markdown));

  check('Table header with Name', /\|\s*Name\s*\|/.test(markdown));
  check('Table alignment left :---', /:---/.test(markdown));
  check('Table data Widget A', /Widget A/.test(markdown));
  check('Table data $10.00', /\$10\.00/.test(markdown));

  check('Unordered list item', /-\s+Item one/.test(markdown));
  check('Ordered list numbered', /1\.\s+First step/.test(markdown));
  check('Nested sub-list', /Sub-item A/.test(markdown));

  check('Task completed [x]', /\\?\[x\\?\] Completed/.test(markdown));
  check('Task pending [ ]', /\\?\[ \\?\] Pending/.test(markdown));

  check('Blockquote', /> This is a blockquote/.test(markdown));

  check('Definition term HTML', /\bHTML\b/.test(markdown));
  check('Definition colon syntax', /: HyperText Markup Language/.test(markdown));

  check('Mermaid fenced block', /```mermaid/.test(markdown));
  check('Mermaid graph TD content', /graph TD/.test(markdown));

  check('Math display block ```math', /```math/.test(markdown));
  check('Math block pi fraction', /\\frac|\\sum/.test(markdown));

  check('Details summary bold **', /\*\*Click to expand\*\*/.test(markdown));
  check('Details hidden content', /Hidden content revealed/.test(markdown));

  check('Video link', /\[Sample video\]\(https:\/\/example\.com/.test(markdown));
  check('YouTube iframe detected', /▶ YouTube/.test(markdown));

  check('JUNK removed - NO sidebar', markdown.indexOf('sidebar') === -1);
  check('JUNK removed - NO cookie-banner', markdown.indexOf('cookie-banner') === -1);
  check('JUNK removed - NO advertisement', markdown.indexOf('Advertisement') === -1);
  check('JUNK removed - NO hidden content', markdown.indexOf('This should not appear') === -1);
  check('JUNK removed - NO social-share', markdown.indexOf('social-share') === -1 && markdown.indexOf('Share buttons') === -1);
  check('JUNK removed - NO newsletter', markdown.indexOf('newsletter') === -1 && markdown.indexOf('Subscribe here') === -1);
  check('JUNK removed - NO pagination', markdown.indexOf('pagination') === -1);
  check('JUNK removed - NO form element', markdown.indexOf('form') === -1 || markdown.indexOf('input') === -1);
  check('JUNK removed - NO comments section', markdown.indexOf('comments') === -1 && markdown.indexOf('Comments section') === -1);

  return markdown;
}

// ── Run ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═'.repeat(60));
  console.log('  Web2md Conversion Test Suite');
  console.log('═'.repeat(60));

  resetCounters();

  // Run with images included
  const output = runTestSuite('Mode: Readability + Images Included', {
    includeFrontmatter: false,
    includeImages: true,
  });

  // Save output
  const { writeFileSync } = await import('fs');
  writeFileSync(join(__dirname, 'output.md'), output, 'utf-8');

  // Summary
  const total = PASS + FAIL;
  console.log('\n' + '═'.repeat(60));
  if (FAIL === 0) {
    console.log(`\n🎉  ALL ${PASS} TESTS PASSED!`);
  } else {
    console.log(`\n❌  ${FAIL}/${total} TEST(S) FAILED:`);
    failList.forEach(f => console.log(`     - ${f}`));
  }
  console.log(`\n📊  ${PASS}/${total} passed`);
  console.log(`📝  Output: ${output.length} chars`);
  console.log('═'.repeat(60));
  console.log('💾  Saved to test/output.md');

  process.exit(FAIL > 0 ? 1 : 0);
}

main();
