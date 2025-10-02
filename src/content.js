chrome.runtime.onMessage.addListener((msg, _sender, _sendResponse) => {
  if (msg?.type === 'LOG_MESSAGE') {
    console.log('From popup:', msg.payload); // это появится в консоли СТРАНИЦЫ
  }
});
