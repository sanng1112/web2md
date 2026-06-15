/**
 * Web2md Unit Test Suite
 *
 * Tests the core HTML → Markdown conversion logic using Node.js + jsdom.
 * Conversion functions come directly from content.js (window.__web2md).
 * No real browser needed — this validates the algorithm against a known fixture.
 *
 * Usage:
 *   node test/test-conversion.mjs
 */

import { JSDOM } from 'jsdom';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── Load sources ───────────────────────────────────────────────────────────
const turndownSrc  = readFileSync(join(ROOT, 'lib/turndown.js'), 'utf-8');
const contentSrc   = readFileSync(join(ROOT, 'content/content.js'), 'utf-8');
const fixtureHtml  = readFileSync(join(__dirname, 'test-fixture.html'), 'utf-8');

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
    console.log(`  \u2705 ${label}`);
  } else {
    FAIL++;
    failList.push(label);
    console.log(`  \u274C ${label}${detail ? ' \u2014 ' + detail : ''}`);
  }
}

// ── Create DOM from fixture HTML ──────────────────────────────────────────

function createDom(html) {
  const dom = new JSDOM(html, {
    url: 'https://example.com/test-article',
    contentType: 'text/html',
    runScripts: 'dangerously',
  });

  // Load turndown so TurndownService constructor lands on the window
  const script = dom.window.document.createElement('script');
  script.textContent = turndownSrc;
  dom.window.document.head.appendChild(script);

  // Mock chrome.runtime so content.js does not throw
  dom.window.chrome = { runtime: { onMessage: { addListener: () => {} } } };

  // Load content.js – its IIFE runs immediately and attaches window.__web2md
  const contentScript = dom.window.document.createElement('script');
  contentScript.textContent = contentSrc;
  dom.window.document.head.appendChild(contentScript);

  return dom;
}

// ── Tests ──────────────────────────────────────────────────────────────────

function runTestSuite(description, options) {
  console.log(`\n\ud83d\udccb  ${description}`);
  console.log('\u2500'.repeat(60));

  const dom = createDom(fixtureHtml);
  const conv = dom.window.__web2md;
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
  console.log('\n\ud83d\udcdd  Output (' + markdown.length + ' chars):');
  const lines = markdown.split('\n');
  for (let i = 0; i < Math.min(30, lines.length); i++) console.log('   ' + lines[i]);
  if (lines.length > 30) console.log('   ... (' + (lines.length - 30) + ' more lines)');

  // ── Assertions ──────────────────────────────────────────────────────
  console.log('\n\ud83d\udd2c  Assertions:');

  check('Output is not empty', markdown.length > 100, markdown.length + ' chars');
  check('Contains H2 heading', /1\\?\. Headings Test/.test(markdown));
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
  check('YouTube iframe detected', /\u25b6 YouTube/.test(markdown));

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
  console.log('\u2550'.repeat(60));
  console.log('  Web2md Conversion Test Suite');
  console.log('\u2550'.repeat(60));

  resetCounters();

  // Run with images included
  const output = runTestSuite('Mode: Readability + Images Included', {
    includeFrontmatter: false,
    includeImages: true,
  });

  // Save output
  writeFileSync(join(__dirname, 'output.md'), output, 'utf-8');

  // Summary
  const total = PASS + FAIL;
  console.log('\n' + '\u2550'.repeat(60));
  if (FAIL === 0) {
    console.log(`\n\ud83c\udf89  ALL ${PASS} TESTS PASSED!`);
  } else {
    console.log(`\n\u274C  ${FAIL}/${total} TEST(S) FAILED:`);
    failList.forEach(f => console.log(`     - ${f}`));
  }
  console.log(`\n\ud83d\udcca  ${PASS}/${total} passed`);
  console.log(`\ud83d\udcdd  Output: ${output.length} chars`);
  console.log('\u2550'.repeat(60));
  console.log('\ud83d\udcbe  Saved to test/output.md');

  process.exit(FAIL > 0 ? 1 : 0);
}

main();
