(async () => {
  const { sSearch, clearResults, setHighlightFocus } = await import(chrome.runtime.getURL('src/content/search.mjs'));

  chrome.runtime.onMessage.addListener((msg) => {
    const { type } = msg;

    if (type === 'PERFORM_SEARCH') {
      const { searchQuery, searchParams: { caseSensitive, wholeWords, useRegex } } = msg;

      sSearch(searchQuery, caseSensitive, wholeWords, useRegex);
    }

    if (type === 'CLEAR_SEARCH_HIGHLIGHT') {
      clearResults();
    }

    if (type === 'SET_SEARCH_HIGHLIGHT_FOCUS') {
      const { index, clientRect } = msg;

      setHighlightFocus(index, clientRect);
    }
  });

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'sigma-search') {
      return;
    }

    port.onDisconnect.addListener(() => {
      clearResults();
    });
  });

  window.addEventListener('message', (event) => {
    if (event.source !== window) {
      return;
    }

    const msg = event.data;

    if (!msg || msg.source !== 'sigma-page' || msg.type !== 'SIGMA_SEARCH_DATA_TRANSFER') {
      return
    };

    chrome.runtime.sendMessage({
      type: 'SIGMA_SEARCH_DATA_TRANSFER',
      payload: msg.payload,
    });
  });
})();
