chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'convertToMarkdown',
    title: 'Convert page to Markdown',
    contexts: ['page'],
  });
  chrome.contextMenus.create({
    id: 'convertSelectionToMarkdown',
    title: 'Convert selection to Markdown',
    contexts: ['selection'],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'convertToMarkdown') {
    convertTab(tab.id);
  } else if (info.menuItemId === 'convertSelectionToMarkdown') {
    convertSelection(tab.id);
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'convert-to-md') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) convertTab(tabs[0].id);
    });
  }
});

function getDefaultOptions() {
  return {
    extractionMode: 'readability',
    includeFrontmatter: true,
    includeTitle: true,
    includeSource: true,
    includeImages: true,
    autoCopy: true,
  };
}

function getSavedOptions(callback) {
  chrome.storage.local.get(['options'], (result) => {
    const merged = Object.assign({}, getDefaultOptions(), result.options || {});
    callback(merged);
  });
}

async function convertTab(tabId) {
  try {
    // Content scripts are injected via manifest.json for all URLs.
    // Only inject on-demand if the tab was opened before extension install.
    try {
      await chrome.tabs.sendMessage(tabId, { action: 'getTitle' });
    } catch {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['lib/turndown.js', 'content/content.js'],
      });
    }

    getSavedOptions(async (options) => {
      try {
        const response = await chrome.tabs.sendMessage(tabId, {
          action: 'convert',
          options: options,
        });
        if (response?.success) {
          await copyToClipboard(response.markdown, tabId);
          showSuccessBadge(tabId);
          showToastOnPage(tabId, 'Converted to Markdown! Copied to clipboard.', 'success');
        } else {
          showToastOnPage(tabId, response?.error || 'Conversion failed', 'error');
        }
      } catch (err) {
        console.error('Web2md conversion error:', err);
        showErrorBadge(tabId);
        showToastOnPage(tabId, 'Conversion failed. Check console.', 'error');
      }
    });
  } catch (err) {
    console.error('Web2md script injection error:', err);
    showErrorBadge(tabId);
    showToastOnPage(tabId, 'Conversion failed: script injection error', 'error');
  }
}

async function convertSelection(tabId) {
  try {
    const [{ result: meta }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({
        title: document.title,
        url: window.location.href,
      }),
    });
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['lib/turndown.js'],
    });
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (pageMeta) => {
        try {
          const selection = window.getSelection();
          if (!selection?.rangeCount) return null;
          const range = selection.getRangeAt(0);
          const container = document.createElement('div');
          container.appendChild(range.cloneContents());
          const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
          const md = td.turndown(container);

          const header =
            '---\n' +
            `title: "${pageMeta.title.replace(/"/g, '\\"')}"\n` +
            `source: ${pageMeta.url}\n` +
            `type: selection\n` +
            `converted: ${new Date().toISOString()}\n` +
            '---\n\n';

          return header + md;
        } catch (e) {
          return null;
        }
      },
      args: [meta],
    });
    if (result) {
      await copyToClipboard(result, tabId);
      showSuccessBadge(tabId);
      showToastOnPage(tabId, 'Selection converted to Markdown! Copied to clipboard.', 'success');
    } else {
      showToastOnPage(tabId, 'No text selected', 'warning');
    }
  } catch (err) {
    console.error('Web2md selection error:', err);
    showErrorBadge(tabId);
    showToastOnPage(tabId, 'Selection conversion failed', 'error');
  }
}

async function copyToClipboard(text, tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (md) => {
        // Try modern clipboard API first
        if (navigator.clipboard && navigator.clipboard.writeText) {
          return navigator.clipboard.writeText(md).catch(() => {
            // Fallback: execCommand
            const ta = document.createElement('textarea');
            ta.value = md;
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            ta.style.top = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
          });
        } else {
          // Fallback: execCommand
          const ta = document.createElement('textarea');
          ta.value = md;
          ta.style.position = 'fixed';
          ta.style.left = '-9999px';
          ta.style.top = '0';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
      },
      args: [text],
    });
  } catch (e) {
    console.error('Clipboard write error:', e);
    throw e;
  }
}

async function showToastOnPage(tabId, message, type) {
  try {
    await chrome.tabs.sendMessage(tabId, {
      action: 'showToast',
      message: message,
      type: type || 'success',
    });
  } catch (err) {
    // Content script might not be ready yet — non-critical
    console.debug('Toast not shown:', err.message);
  }
}

function showSuccessBadge(tabId) {
  chrome.action.setBadgeText({ tabId, text: 'MD' });
  chrome.action.setBadgeBackgroundColor({ tabId, color: '#4caf50' });
  setTimeout(() => chrome.action.setBadgeText({ tabId, text: '' }), 2200);
}

function showErrorBadge(tabId) {
  chrome.action.setBadgeText({ tabId, text: 'ERR' });
  chrome.action.setBadgeBackgroundColor({ tabId, color: '#e53935' });
  setTimeout(() => chrome.action.setBadgeText({ tabId, text: '' }), 2200);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getOptions') {
    chrome.storage.local.get(['options'], (result) => {
      sendResponse(result.options || getDefaultOptions());
    });
    return true;
  }
});
