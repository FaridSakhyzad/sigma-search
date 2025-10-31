const KEY = 'sigma_search_query';

const appState = {
  activeResultIndex: 0,
  highlightRects: [],
  totalResults: 0,
}

document.addEventListener('DOMContentLoaded', async () => {
  const $input = document.querySelector('._search-query-input');

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  const storedSearchQueryData = await chrome.storage.local.get({ [`${tab.id}_${KEY}`]: '' });

  console.log('storedSearchQueryData', storedSearchQueryData);

  const storedSearchQuery = storedSearchQueryData[`${tab.id}_${KEY}`];

  if (storedSearchQuery && storedSearchQuery.length > 0) {
    $input.value = storedSearchQuery || '';

    const $caseSensitive = document.querySelector('._case-sensitive');
    const $wholeWords = document.querySelector('._whole-words');
    const $useRegex = document.querySelector('._use-regex');

    await performSearch(storedSearchQuery, $caseSensitive.checked, $wholeWords.checked, $useRegex.checked);
  }

  document.querySelector('._prev-result-button').addEventListener('click', async () => {
    if (appState.activeResultIndex > 0) {
      appState.activeResultIndex -= 1;
      document.querySelector('._current-result-index').innerHTML = `${1 + appState.activeResultIndex}`;
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    chrome.tabs.sendMessage(tab.id, {
      type: 'SET_SEARCH_HIGHLIGHT_FOCUS',
      index: appState.activeResultIndex,
      clientRect: appState.highlightRects[appState.activeResultIndex],
    });
  });

  document.querySelector('._next-result-button').addEventListener('click', async () => {
    if ((appState.activeResultIndex + 1) < appState.totalResults) {
      appState.activeResultIndex += 1;

      document.querySelector('._current-result-index').innerHTML = `${1 + appState.activeResultIndex}`;
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    chrome.tabs.sendMessage(tab.id, {
      type: 'SET_SEARCH_HIGHLIGHT_FOCUS',
      index: appState.activeResultIndex,
      clientRect: appState.highlightRects[appState.activeResultIndex],
    });
  });

});

let timer;

document.querySelector('._search-query-input').addEventListener('input', async function(e) {
  const { target } = e;
  clearTimeout(timer);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  timer = setTimeout(async () => {
    const { value } = target;

    await chrome.storage.local.set({ [`${tab.id}_${KEY}`]: value });
  }, 100);
});

const performSearch = async (searchQuery, caseSensitive, wholeWords, useRegex) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.tabs.sendMessage(tab.id, {
    type: 'PERFORM_SEARCH',
    searchQuery,
    searchParams: {
      caseSensitive,
      wholeWords,
      useRegex,
    }
  });
}

document.querySelector('._search-button').addEventListener('click', async function(e) {
  e.preventDefault();
  e.stopPropagation();

  const $input = document.querySelector('._search-query-input');

  const $caseSensitive = document.querySelector('._case-sensitive');
  const $wholeWords = document.querySelector('._whole-words');
  const $useRegex = document.querySelector('._use-regex');

  await performSearch($input.value, $caseSensitive.checked, $wholeWords.checked, $useRegex.checked);
});

document.querySelector('._clear-button').addEventListener('click', async function(e) {
  e.preventDefault();
  e.stopPropagation();

  const $input = document.querySelector('._search-query-input');

  $input.value = null ;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  await chrome.storage.local.set({ [`${tab.id}_${KEY}`]: '' });

  chrome.tabs.sendMessage(tab.id, { type: 'CLEAR_SEARCH_HIGHLIGHT' });
});

/*
let port;

async function connectToActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id) {
    return;
  }

  port = chrome.tabs.connect(tab.id, { name: 'sigma-search' });
}

document.addEventListener('DOMContentLoaded', connectToActiveTab);

window.addEventListener('unload', () => {
  try {
    port?.disconnect();
  } catch {}
});
*/

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type === 'SIGMA_SEARCH_DATA_TRANSFER') {
    const { payload: { highlightRects } } = msg;

    appState.highlightRects = [...highlightRects];

    if (highlightRects && highlightRects.length > 0) {
      document.querySelector('._results-container').style.display = 'block';

      appState.totalResults = highlightRects.length;
      document.querySelector('._total-results').innerHTML = highlightRects.length;
    } else {
      document.querySelector('._results-container').style.display = 'none';
    }
  }
});
