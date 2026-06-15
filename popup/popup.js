(function () {
  'use strict';

  const HISTORY_KEY = 'web2md-history';
  const MAX_HISTORY = 10;

  const els = {
    pageTitle: document.getElementById('pageTitle'),
    extractionModeRadios: document.querySelectorAll('input[name="extractionMode"]'),
    selectorGroup: document.getElementById('selectorGroup'),
    optSelector: document.getElementById('optSelector'),
    btnSelectorHelp: document.getElementById('btnSelectorHelp'),
    selectorHint: document.getElementById('selectorHint'),
    optFrontmatter: document.getElementById('optFrontmatter'),
    optTitle: document.getElementById('optTitle'),
    optSource: document.getElementById('optSource'),
    optImages: document.getElementById('optImages'),
    optAutoCopy: document.getElementById('optAutoCopy'),
    btnConvert: document.getElementById('btnConvert'),
    btnCopy: document.getElementById('btnCopy'),
    btnDownloadMd: document.getElementById('btnDownloadMd'),
    btnDownloadHtml: document.getElementById('btnDownloadHtml'),
    btnDownloadTxt: document.getElementById('btnDownloadTxt'),
    btnTheme: document.getElementById('btnTheme'),
    preview: document.getElementById('preview'),
    status: document.getElementById('status'),
    stats: document.getElementById('stats'),
    historyBar: document.getElementById('historyBar'),
    historySelect: document.getElementById('historySelect'),
    btnClearHistory: document.getElementById('btnClearHistory'),
    btnLoadTabs: document.getElementById('btnLoadTabs'),
    btnSelectAll: document.getElementById('btnSelectAll'),
    btnDeselectAll: document.getElementById('btnDeselectAll'),
    batchList: document.getElementById('batchList'),
    btnBatchConvert: document.getElementById('btnBatchConvert'),
  };

  let lastResult = null;

  function setStatus(msg, isError) {
    els.status.textContent = msg || '';
    els.status.className = 'status' + (isError ? ' error' : '');
    if (msg) {
      const timer = setTimeout(() => {
        if (els.status.textContent === msg) {
          els.status.textContent = '';
          els.status.className = 'status';
        }
      }, 4000);
    }
  }

  function enableOutputButtons() {
    els.btnCopy.disabled = false;
    els.btnDownloadMd.disabled = false;
    els.btnDownloadHtml.disabled = false;
    els.btnDownloadTxt.disabled = false;
  }

  function disableOutputButtons() {
    els.btnCopy.disabled = true;
    els.btnDownloadMd.disabled = true;
    els.btnDownloadHtml.disabled = true;
    els.btnDownloadTxt.disabled = true;
  }

  function getOptions() {
    const modeRadio = document.querySelector('input[name="extractionMode"]:checked');
    return {
      extractionMode: modeRadio?.value || 'readability',
      selector: els.optSelector.value.trim() || null,
      includeFrontmatter: els.optFrontmatter.checked,
      includeTitle: els.optTitle.checked,
      includeSource: els.optSource.checked,
      includeImages: els.optImages.checked,
      autoCopy: els.optAutoCopy.checked,
    };
  }

  function updateStats(md) {
    if (!md) {
      els.stats.textContent = '0 chars | 0 words | ~0 min read';
      return;
    }
    const chars = md.length;
    const words = md.split(/\s+/).filter(Boolean).length;
    const minutes = Math.max(1, Math.ceil(words / 200));
    els.stats.textContent = `${chars.toLocaleString()} chars | ${words.toLocaleString()} words | ~${minutes} min read`;
  }

  function loadHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      const items = raw ? JSON.parse(raw) : [];
      return Array.isArray(items) ? items : [];
    } catch (e) {
      return [];
    }
  }

  function saveHistory(entry) {
    let items = loadHistory();
    items = items.filter(e => e.url !== entry.url);
    items.unshift(entry);
    if (items.length > MAX_HISTORY) items = items.slice(0, MAX_HISTORY);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
    renderHistory(items);
  }

  function renderHistory(items) {
    if (!items || !items.length) {
      els.historyBar.style.display = 'none';
      return;
    }
    els.historyBar.style.display = 'flex';
    els.historySelect.innerHTML = '<option value="">— history —</option>';
    items.forEach((item, i) => {
      const option = document.createElement('option');
      option.value = i;
      const title = item.title || item.url || 'Untitled';
      option.textContent = title.substring(0, 60);
      els.historySelect.appendChild(option);
    });
  }

  function clearHistory() {
    localStorage.removeItem(HISTORY_KEY);
    renderHistory([]);
    setStatus('History cleared');
  }

  async function loadBatchTabs() {
    els.batchList.innerHTML = '<div class="batch-tab" style="color:var(--muted);padding:4px;">Loading tabs...</div>';
    const tabs = await chrome.tabs.query({ currentWindow: true });
    els.batchList.innerHTML = '';
    tabs.forEach((tab, i) => {
      const div = document.createElement('label');
      div.className = 'batch-tab';
      div.innerHTML = [
        '<input type="checkbox" value="' + tab.id + '" class="batch-check">',
        '<span class="tab-title">' + (tab.title || 'Untitled').replace(/</g, '&lt;').substring(0, 50) + '</span>',
        '<span class="tab-url">' + (tab.url || '').replace(/</g, '&lt;') + '</span>',
      ].join('');
      els.batchList.appendChild(div);
    });
  }

  async function batchConvert() {
    const checks = els.batchList.querySelectorAll('.batch-check:checked');
    const ids = Array.from(checks).map((c) => parseInt(c.value));
    if (!ids.length) {
      setStatus('✗ No tabs selected', true);
      return;
    }
    els.btnBatchConvert.disabled = true;
    setStatus('Converting ' + ids.length + ' tabs...');
    disableOutputButtons();

    const parts = [];
    let failed = 0;
    for (let i = 0; i < ids.length; i++) {
      try {
        const tab = await chrome.tabs.get(ids[i]);
        // Check if content script is alive; inject on-demand if not
        try {
          await chrome.tabs.sendMessage(ids[i], { action: 'getTitle' });
        } catch {
          await chrome.scripting.executeScript({
            target: { tabId: ids[i] },
            files: ['lib/turndown.js', 'lib/readability.js', 'content/content.js'],
          });
        }
        const response = await chrome.tabs.sendMessage(ids[i], { action: 'convert', options: getOptions() });
        if (response?.success) {
          parts.push('## ' + (tab.title || 'Untitled') + '\n\n> Source: ' + tab.url + '\n\n' + response.markdown);
        } else {
          failed++;
          parts.push('## ' + (tab.title || 'Untitled') + '\n\n> Source: ' + tab.url + '\n\n_Conversion failed: ' + (response?.error || 'unknown') + '_\n');
        }
      } catch (err) {
        failed++;
        console.warn('[Web2md] batchConvert tab error:', err);
      }
    }

    const merged = parts.join('\n\n---\n\n');
    lastResult = { markdown: merged };
    els.preview.value = merged;
    updateStats(merged);
    enableOutputButtons();

    if (els.optAutoCopy.checked) {
      try { await navigator.clipboard.writeText(merged); } catch (_) {}
    }

    setStatus('✓ ' + (ids.length - failed) + ' tabs converted' + (failed ? ', ' + failed + ' failed' : ''));
    els.btnBatchConvert.disabled = false;
  }

  function selectHistoryItem(index) {
    const items = loadHistory();
    const item = items[index];
    if (!item) return;
    els.preview.value = item.markdown;
    updateStats(item.markdown);
    lastResult = { markdown: item.markdown };
    enableOutputButtons();
    setStatus('Loaded from history');
  }

  async function convert() {
    els.btnConvert.disabled = true;
    setStatus('Converting...');
    disableOutputButtons();

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) throw new Error('No active tab');

      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'convert',
        options: getOptions(),
      });

      if (!response || !response.success) {
        throw new Error(response?.error || 'Conversion failed');
      }

      lastResult = response;
      els.preview.value = response.markdown;
      updateStats(response.markdown);
      enableOutputButtons();

      saveHistory({
        url: tab.url,
        title: tab.title,
        markdown: response.markdown,
        date: new Date().toISOString(),
      });

      let msg = '✓ Converted! ' + response.markdown.length.toLocaleString() + ' chars';

      if (els.optAutoCopy.checked) {
        try {
          await navigator.clipboard.writeText(response.markdown);
          msg = '✓ Converted & Copied!';
        } catch (e) {
          msg += ' (copy failed)';
        }
      }

      setStatus(msg);
    } catch (err) {
      setStatus('✗ ' + err.message, true);
      updateStats(null);
    } finally {
      els.btnConvert.disabled = false;
    }
  }

  async function copyToClipboard() {
    if (!lastResult?.markdown) return;
    try {
      await navigator.clipboard.writeText(lastResult.markdown);
      setStatus('✓ Copied to clipboard!');
    } catch (err) {
      setStatus('✗ Failed to copy', true);
    }
  }

  function downloadBlob(content, ext, mimeType) {
    const blob = new Blob([content], { type: mimeType + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = (document.title || 'web2md-output')
      .replace(/[^a-zA-Z0-9\u00C0-\u024F\u1E00-\u1EFF ]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .toLowerCase() || 'web2md-output';
    a.href = url;
    a.download = safeName + '.' + ext;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadMarkdown() {
    if (!lastResult?.markdown) return;
    downloadBlob(lastResult.markdown, 'md', 'text/markdown');
    setStatus('✓ Downloaded .md');
  }

  function downloadHtml() {
    if (!lastResult?.cleanHtml) {
      setStatus('✗ No clean HTML available', true);
      return;
    }
    downloadBlob(lastResult.cleanHtml, 'html', 'text/html');
    setStatus('✓ Downloaded .html');
  }

  function downloadText() {
    if (!lastResult?.plainText) {
      setStatus('✗ No plain text available', true);
      return;
    }
    downloadBlob(lastResult.plainText, 'txt', 'text/plain');
    setStatus('✓ Downloaded .txt');
  }

  async function loadPageInfo() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;
      try {
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'getTitle' });
        els.pageTitle.textContent = response?.title || tab.title || 'Unknown page';
      } catch (e) {
        els.pageTitle.textContent = tab.title || 'Unknown page';
      }
    } catch (e) {
      els.pageTitle.textContent = 'Unknown page';
    }
  }

  function loadTheme() {
    const saved = localStorage.getItem('web2md-theme');
    if (saved === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      els.btnTheme.textContent = '\u2600';
    } else {
      document.documentElement.removeAttribute('data-theme');
      els.btnTheme.textContent = '\u263E';
    }
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    if (current === 'dark') {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('web2md-theme', 'light');
      els.btnTheme.textContent = '\u263E';
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('web2md-theme', 'dark');
      els.btnTheme.textContent = '\u2600';
    }
  }

  function toggleSelectorVisibility() {
    const mode = document.querySelector('input[name="extractionMode"]:checked')?.value;
    els.selectorGroup.style.display = mode === 'raw' ? 'flex' : 'none';
  }

  function restoreOptions() {
    chrome.storage.local.get(['options'], (result) => {
      const opts = result.options || {};
      els.optFrontmatter.checked = opts.includeFrontmatter !== false;
      els.optTitle.checked = opts.includeTitle !== false;
      els.optSource.checked = opts.includeSource !== false;
      els.optImages.checked = opts.includeImages !== false;
      els.optAutoCopy.checked = opts.autoCopy !== false;
      if (opts.extractionMode) {
        const radio = document.querySelector(`input[name="extractionMode"][value="${opts.extractionMode}"]`);
        if (radio) radio.checked = true;
      }
      if (opts.selector) {
        els.optSelector.value = opts.selector;
      }
      toggleSelectorVisibility();
    });
  }

  function saveOptions() {
    chrome.storage.local.set({ options: getOptions() });
  }

  els.btnConvert.addEventListener('click', convert);
  els.btnCopy.addEventListener('click', copyToClipboard);
  els.btnDownloadMd.addEventListener('click', downloadMarkdown);
  els.btnDownloadHtml.addEventListener('click', downloadHtml);
  els.btnDownloadTxt.addEventListener('click', downloadText);
  els.btnTheme.addEventListener('click', toggleTheme);

  els.btnSelectorHelp.addEventListener('click', () => {
    els.selectorHint.style.display = els.selectorHint.style.display === 'none' ? 'block' : 'none';
  });

  els.btnClearHistory.addEventListener('click', clearHistory);

  els.btnLoadTabs.addEventListener('click', loadBatchTabs);
  els.btnSelectAll.addEventListener('click', () => {
    els.batchList.querySelectorAll('.batch-check').forEach((c) => { c.checked = true; });
  });
  els.btnDeselectAll.addEventListener('click', () => {
    els.batchList.querySelectorAll('.batch-check').forEach((c) => { c.checked = false; });
  });
  els.btnBatchConvert.addEventListener('click', batchConvert);

  els.historySelect.addEventListener('change', (e) => {
    const idx = parseInt(e.target.value);
    if (!isNaN(idx)) selectHistoryItem(idx);
  });

  ['optFrontmatter', 'optTitle', 'optSource', 'optImages', 'optAutoCopy'].forEach(id => {
    document.getElementById(id).addEventListener('change', saveOptions);
  });

  els.optSelector.addEventListener('change', saveOptions);

  els.extractionModeRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      toggleSelectorVisibility();
      saveOptions();
    });
  });

  document.addEventListener('DOMContentLoaded', () => {
    loadTheme();
    restoreOptions();
    loadPageInfo();
    renderHistory(loadHistory());
  });
})();
