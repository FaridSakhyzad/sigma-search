const KEY = 'sigma_search_query';

document.addEventListener('DOMContentLoaded', async () => {
  const $input = document.querySelector('._search-query-input');

  try {
    const obj = await chrome.storage.sync.get({ [KEY]: '' });
    $input.value = obj[KEY] || '';
  } catch (e) {
    const obj = await chrome.storage.local.get({ [KEY]: '' });
    $input.value = obj[KEY] || '';
  }
});

let timer;

document.querySelector('._search-query-input').addEventListener('input', async function(e) {
  const { target } = e;
  clearTimeout(timer);

  timer = setTimeout(async () => {
    const { value } = target;

    await chrome.storage.local.set({ [KEY]: value });
  }, 100);
});

document.querySelector('._search-button').addEventListener('click', async function(e) {
  e.preventDefault();
  e.stopPropagation();

  const $input = document.querySelector('._search-query-input');

  const $caseSensitive = document.querySelector('._case-sensitive');
  const $wholeWords = document.querySelector('._whole-words');
  const $useRegex = document.querySelector('._use-regex');

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.tabs.sendMessage(tab.id, {
    type: 'PERFORM_SEARCH',
    searchQuery: $input.value,
    searchParams: {
      caseSensitive: $caseSensitive.checked,
      wholeWords: $wholeWords.checked,
      useRegex: $useRegex.checked,
    }
  });
});

document.querySelector('._clear-button').addEventListener('click', async function(e) {
  e.preventDefault();
  e.stopPropagation();

  const $input = document.querySelector('._search-query-input');

  $input.value = null ;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.tabs.sendMessage(tab.id, { type: 'CLEAR_SEARCH_HIGHLIGHT' });
});


