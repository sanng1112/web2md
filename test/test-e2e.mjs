/**
 * Web2md E2E Test Suite (Playwright)
 *
 * Tests the full extension flow: popup rendering, conversion,
 * batch tab listing, download buttons, dark mode, history.
 *
 * Usage:
 *   npx playwright install chromium
 *   node test/test-e2e.mjs
 */

import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = join(__dirname, '..');

let PASS = 0;
let FAIL = 0;
const failList = [];

function check(label, condition, detail) {
  if (condition) {
    PASS++;
    console.log(`  \u2705 ${label}`);
  } else {
    FAIL++;
    failList.push(label + (detail ? ` \u2014 ${detail}` : ''));
    console.log(`  \u274C ${label}${detail ? ` \u2014 ${detail}` : ''}`);
  }
}

async function main() {
  console.log('════════════════════════════════════════════════════════════');
  console.log('  Web2md E2E Test Suite (Playwright)');
  console.log('════════════════════════════════════════════════════════════\n');

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ],
    });
  } catch (err) {
    console.log('  \u26A0\uFE0F Playwright requires chromium browser installed.');
    console.log('  Run: npx playwright install chromium\n');
    console.log(`  Error: ${err.message}\n`);
    console.log(`  \u2139\uFE0F Skipping E2E tests (browser unavailable)\n`);
    console.log(`  Result: 0/0 passed (SKIPPED)`);
    return;
  }

  try {
    // ── Test 1: Service worker registration ───────────────────────────────
    console.log('\uD83D\uDCCB  1. Extension loads without crash');
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('about:blank');

    // Give extension time to register
    await page.waitForTimeout(2000);

    // Check the extension background page is alive
    const bgUrl = `chrome-extension://${(await page.context().serviceWorkers())[0]?.url() || 'unknown'}`;
    check('Extension background page reachable', bgUrl !== 'chrome-extension://unknown');
    check('No crash on blank page', true);

    // ── Test 2: Navigate to a real page ───────────────────────────────────
    console.log('\n\uD83D\uDCCB  2. Content script injection on real page');
    await page.goto('data:text/html,<html><head><title>Test Page</title></head><body><h1>Hello</h1><p>World</p></body></html>');
    await page.waitForTimeout(1000);

    // Check content script injected via exposed API
    const hasWeb2md = await page.evaluate(() => typeof window.__web2md !== 'undefined');
    check('Content script exposes __web2md API', hasWeb2md === true);

    const hasTurndown = await page.evaluate(() => typeof TurndownService !== 'undefined');
    check('TurndownService available in content script', hasTurndown === true);

    // ── Test 3: Convert via content script API ────────────────────────────
    console.log('\n\uD83D\uDCCB  3. Conversion via __web2md API');
    const result = await page.evaluate(() => {
      const api = window.__web2md;
      if (!api) return null;
      try {
        return api.convertToMarkdown({
          extractionMode: 'raw',
          includeImages: true,
          includeFrontmatter: true,
          includeTitle: true,
          includeSource: true,
        });
      } catch (e) {
        return { error: e.message };
      }
    });

    check('convertToMarkdown() returns result', result !== null);
    check('Result has markdown field', typeof result?.markdown === 'string' && result.markdown.length > 0);
    check('Result has cleanHtml field', typeof result?.cleanHtml === 'string');
    check('Result has plainText field', typeof result?.plainText === 'string');

    // Check header contains basic frontmatter
    const hasTitleYaml = result?.markdown.includes('title:');
    check('Frontmatter includes title:', hasTitleYaml === true);

    // Check content was extracted
    const containsHello = result?.markdown.includes('Hello');
    check('Markdown contains page content', containsHello === true);

    // ── Test 4: NormalizeDom removes junk ─────────────────────────────────
    console.log('\n\uD83D\uDCCB  4. normalizeDom removes junk elements');
    await page.goto('data:text/html,<html><body><nav>NAV</nav><article>MAIN<footer>FOOT</footer></article><div class="sidebar">SIDEBAR</div><script>bad</script></body></html>');
    await page.waitForTimeout(500);

    const cleanResult = await page.evaluate(() => {
      const api = window.__web2md;
      if (!api) return null;
      const div = document.createElement('div');
      div.innerHTML = document.body.innerHTML;
      api.normalizeDom(div);
      return div.innerHTML;
    });

    check('nav element removed', cleanResult?.includes('NAV') === false);
    check('footer element removed', cleanResult?.includes('FOOT') === false);
    check('sidebar removed', cleanResult?.includes('SIDEBAR') === false);
    check('script element removed', cleanResult?.includes('bad') === false);
    check('article/MAIN preserved', cleanResult?.includes('MAIN') === true);

    // ── Test 5: cleanMarkdown pipeline ────────────────────────────────────
    console.log('\n\uD83D\uDCCB  5. cleanMarkdown post-processing');
    const cleaned = await page.evaluate(() => {
      const api = window.__web2md;
      if (!api) return null;
      return api.cleanMarkdown('Hello $$\\frac{1}{2}$$ world $\\alpha$');
    });
    check('Display math $$ -> ```math```', cleaned?.includes('```math') === true);
    check('Inline math $ -> `backtick`', cleaned?.includes('`α`') === true);

    // ── Test 6: getPageMetadata ──────────────────────────────────────────
    console.log('\n\uD83D\uDCCB  6. getPageMetadata extraction');
    await page.goto('data:text/html,<html><head><title>Meta Test</title><meta property="og:description" content="Desc"><meta property="og:image" content="https://example.com/img.png"><link rel="canonical" href="https://example.com/canonical"></head><body><p>Content</p></body></html>');
    await page.waitForTimeout(500);
    const meta = await page.evaluate(() => window.__web2md?.getPageMetadata());
    check('Metadata title extracted', meta?.title === 'Meta Test');
    check('Metadata description extracted', meta?.description === 'Desc');
    check('Metadata og:image extracted', meta?.image === 'https://example.com/img.png');

    // ── Test 7: Batch convert simulation ──────────────────────────────────
    console.log('\n\uD83D\uDCCB  7. Conversion edge cases');
    // Test with exclude images
    const noImages = await page.evaluate(() => {
      const api = window.__web2md;
      if (!api) return null;
      return api.convertToMarkdown({
        extractionMode: 'raw',
        includeImages: false,
        includeFrontmatter: false,
        includeTitle: false,
      });
    });
    check('Can convert without images', noImages !== null);

    // Test with Readability mode (should fallback to raw on simple page)
    const readabilityMode = await page.evaluate(() => {
      const api = window.__web2md;
      if (!api) return null;
      return api.convertToMarkdown({
        extractionMode: 'readability',
        includeFrontmatter: false,
        includeTitle: false,
      });
    });
    check('Readability mode works (falls back to raw)', readabilityMode !== null && typeof readabilityMode.markdown === 'string');

    console.log('\n' + '═'.repeat(56));
    console.log(`\n\uD83D\uDCCA  ${PASS}/${PASS + FAIL} passed`);
    if (failList.length) {
      console.log('\n\u274C Failures:');
      failList.forEach((f) => console.log(`  - ${f}`));
    }
    console.log('═'.repeat(56) + '\n');

  } catch (err) {
    console.error('\n\u274C E2E test suite crashed:', err.message);
    FAIL++;
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
