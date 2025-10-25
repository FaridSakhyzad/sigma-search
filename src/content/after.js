(async () => {
  const { sSearch, clearResults } = await import(chrome.runtime.getURL('src/content/search.mjs'));

  chrome.runtime.onMessage.addListener((msg) => {
    const { type } = msg;

    if (type === 'PERFORM_SEARCH') {
      const { searchQuery, searchParams: { caseSensitive, wholeWords, useRegex } } = msg;

      sSearch(searchQuery, caseSensitive, wholeWords, useRegex);
    }

    if (type === 'CLEAR_SEARCH_HIGHLIGHT') {
      clearResults();
    }
  });
})();
