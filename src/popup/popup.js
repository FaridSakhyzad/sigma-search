document.querySelector('._search-button').addEventListener('click', function(e) {
  e.preventDefault();
  e.stopPropagation();

  const $input = document.querySelector('._search-query-input');

  const $caseSensitive = document.querySelector('._case-sensitive');
  const $wholeWords = document.querySelector('._whole-words');
  const $useRegex = document.querySelector('._use-regex');

  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      function: sSearch,
      args: [ $input.value, $caseSensitive.checked, $wholeWords.checked, $useRegex.checked ]
    });
  });
});

function sSearch(searchQuery, caseSensitive, wholeWords, useRegex) {
  function buildRegex(source, flags) {
    try {
      return new RegExp(source, flags);
    } catch (e) {
      return null;
    }
  }

  function isWordChar(char) {
    if (!char || char.length < 1) {
      return false;
    }

    return /\p{L}|\p{N}|_/u.test(char);
  }

  function getTextareaRangeClientRects(textarea, start, end) {
    if (!(textarea instanceof HTMLTextAreaElement)) {
      throw new Error('Pass an HTMLTextAreaElement');
    }

    if (start > end) {
      [start, end] = [end, start]
    }

    const cs = getComputedStyle(textarea);

    // Создаём одноразовый «микро-зеркальный» контейнер
    const mirror = document.createElement('div');
    mirror.style.position = 'absolute';
    mirror.style.visibility = 'hidden';
    mirror.style.whiteSpace = 'pre-wrap';
    mirror.style.wordWrap = 'break-word';
    mirror.style.boxSizing = 'border-box';
    mirror.style.overflow = 'auto';
    mirror.style.tabSize = cs.tabSize;

    // Синхронизируем метрики: шрифт, межбуквье, отступы/бордеры, ширину/высоту
    mirror.style.font = cs.font;
    mirror.style.lineHeight = cs.lineHeight;
    mirror.style.letterSpacing = cs.letterSpacing;
    mirror.style.padding = cs.padding;
    mirror.style.border = cs.border;
    mirror.style.width = textarea.clientWidth + 'px';
    mirror.style.height = textarea.clientHeight + 'px';

    // Размещаем вне экрана, чтобы не прыгал layout
    mirror.style.left = '-9999px';
    mirror.style.top = '-9999px';

    // Три части: до/цель/после — цель оборачиваем в span
    const val = textarea.value;
    const before = escapeHtml(val.slice(0, start));
    const target = escapeHtml(val.slice(start, end)) || ' '; // пустое → хотя бы пробел
    const after  = escapeHtml(val.slice(end));

    // <br> вместо \n, иначе pre-wrap сам перенесёт
    const toHtml = s => s.replace(/\n/g, '<br/>');

    mirror.innerHTML =
      toHtml(before) +
      `<span data-hit>${toHtml(target)}</span>` +
      toHtml(after);

    document.body.appendChild(mirror);

    // Синхронизируем скролл (важно!)
    mirror.scrollTop  = textarea.scrollTop;
    mirror.scrollLeft = textarea.scrollLeft;

    // Геометрия цели
    const hit = mirror.querySelector('[data-hit]');
    const hitRects = Array.from(hit.getClientRects());
    const mirrorRect = mirror.getBoundingClientRect();
    const taRect = textarea.getBoundingClientRect();

    // Переводим rect'ы из системы «mirror/viewport» в систему «textarea/viewport»
    const rects = hitRects.map(r => ({
      x: taRect.left + (r.left - mirrorRect.left),
      y: taRect.top  + (r.top  - mirrorRect.top),
      left:  taRect.left + (r.left - mirrorRect.left),
      top:   taRect.top  + (r.top  - mirrorRect.top),
      right: taRect.left + (r.right - mirrorRect.left),
      bottom:taRect.top  + (r.bottom - mirrorRect.top),
      width: r.width,
      height: r.height,
    }));

    // Уборка
    mirror.remove();

    console.log('rects', rects);

    return rects;

    function escapeHtml(s) {
      return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }
  }

  function getSelectedOptionRangeClientRects(select, start, end) {
    if (!(select instanceof HTMLSelectElement)) throw new Error('select required');
    const idx = select.selectedIndex;
    if (idx < 0) return [];

    const opt = select.options[idx];
    const text = opt?.text ?? '';
    if (!text) return [];

    if (start > end) [start, end] = [end, start];
    start = Math.max(0, Math.min(start, text.length));
    end   = Math.max(0, Math.min(end,   text.length));
    if (start === end) return [];

    const cs = getComputedStyle(select);
    const selRect = select.getBoundingClientRect();

    // === контент-бокс select ===
    const bL = parseFloat(cs.borderLeftWidth)   || 0;
    const bR = parseFloat(cs.borderRightWidth)  || 0;
    const bT = parseFloat(cs.borderTopWidth)    || 0;
    const bB = parseFloat(cs.borderBottomWidth) || 0;

    // логические паддинги (RTL-aware) → Chrome их считает, но держим запас
    const pIS = parseFloat(cs.paddingInlineStart || cs.paddingLeft)  || 0;
    const pIE = parseFloat(cs.paddingInlineEnd   || cs.paddingRight) || 0;
    const pT  = parseFloat(cs.paddingTop)    || 0;
    const pB  = parseFloat(cs.paddingBottom) || 0;

    const contentLeft   = selRect.left + bL + pIS;
    const contentRight  = selRect.right - bR - pIE;
    const contentTop    = selRect.top  + bT + pT;
    const contentBottom = selRect.bottom - bB - pB;
    const contentWidth  = Math.max(0, contentRight - contentLeft);

    // === вертикаль строки ===
    const isClosed = !select.multiple && (select.size === 0 || select.size === 1);

    const lineHeight = (() => {
      const lh = cs.lineHeight;
      if (!lh || lh === 'normal') return (parseFloat(cs.fontSize) || 16) * 1.2;
      if (lh.endsWith('px')) return parseFloat(lh) || 0;
      const n = parseFloat(lh);
      return Number.isFinite(n) ? n * (parseFloat(cs.fontSize)||16) : (parseFloat(cs.fontSize)||16)*1.2;
    })();

    const rowTop = isClosed
      ? contentTop // одна видимая строка
      : contentTop + (idx * lineHeight - select.scrollTop);

    const rowBottom = rowTop + lineHeight;
    if (rowBottom < contentTop || rowTop > contentBottom) return []; // вне видимой области листбокса

    // === горизонталь: учитываем «родной» inset Chrome в закрытом селекте ===
    const CHROME_CLOSED_START_INSET_PX = 4; // эмпирически для Blink; правь при желании
    const textIndent = parseFloat(cs.textIndent) || 0;
    const isRTL = cs.direction === 'rtl';

    // измерения через canvas (Blink даёт очень близко к реальному рендеру)
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = cs.font || [
      cs.fontStyle, cs.fontVariant, cs.fontWeight,
      cs.fontSize + '/' + (cs.lineHeight || 'normal'),
      cs.fontFamily
    ].filter(Boolean).join(' ');

    const fullW   = ctx.measureText(text).width;
    const beforeW = ctx.measureText(text.slice(0, start)).width;
    const targetW = ctx.measureText(text.slice(start, end)).width;

    // нормализуем text-align с учётом start/end
    const normAlign =
      cs.textAlign === 'start' ? (isRTL ? 'right' : 'left') :
        cs.textAlign === 'end'   ? (isRTL ? 'left'  : 'right') :
          cs.textAlign;

    // базовая точка начала текста в контент-боксе
    const startInset = (isClosed ? CHROME_CLOSED_START_INSET_PX : 0) + textIndent;

    const xBase =
      normAlign === 'right'
        ? contentLeft + (contentWidth - fullW) - startInset
        : normAlign === 'center'
          ? contentLeft + (contentWidth - fullW) / 2
          : contentLeft + startInset; // left/start

    const left = isRTL
      ? xBase + (fullW - (beforeW + targetW))
      : xBase + beforeW;

    const rect = {
      x: left,
      y: rowTop,
      left: left,
      top: rowTop,
      width: targetW,
      height: lineHeight,
      right: left + targetW,
      bottom: rowTop + lineHeight
    };

    return rect;
  }

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const $parentElement = node.parentElement;

      if (!$parentElement) {
        return NodeFilter.FILTER_REJECT;
      }

      const tag = $parentElement.tagName;

      if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") {
        return NodeFilter.FILTER_REJECT;
      }

      if (!node.nodeValue || !node.nodeValue.trim()) {
        return NodeFilter.FILTER_REJECT;
      }

      const style = getComputedStyle($parentElement);

      if (style.display === 'none' || style.visibility === 'hidden') {
        return NodeFilter.FILTER_REJECT;
      }

      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const marks = [];

  let searchQueryRegex = null;
  let flags = 'g';

  if (!caseSensitive) {
    flags += 'i';
  }

  flags += 'u';

  if (useRegex) {
    searchQueryRegex = buildRegex(searchQuery, flags);

    if (!searchQueryRegex) {
      console.error('Invalid regular expression');
      return;
    }
  } else {
    const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    searchQueryRegex = new RegExp(escaped, flags);
  }

  let node;
  while ((node = walker.nextNode())) {
    const textNode = walker.currentNode;
    const text = textNode.nodeValue;

    for (const match of text.matchAll(searchQueryRegex)) {

      if (!match[0]) {
        continue;
      }

      const start = match.index;
      const end = start + match[0].length;

      if (wholeWords) {
        const before = text[start - 1];
        const after = text[end];

        if (isWordChar(before) || isWordChar(after)) {
          continue;
        }
      }

      const range = document.createRange();
      range.setStart(textNode, start);
      range.setEnd(textNode, end);

      let clientRects = range.getClientRects()[0];

      if (node.parentElement.tagName === 'TEXTAREA') {
        clientRects = getTextareaRangeClientRects(node.parentElement, start, end)[0];
      }

      if (node.parentElement.tagName === 'OPTION') {
        console.log('node.parentElement', node.parentElement);
        console.log('start', start);
        console.log('end', end);

        clientRects = getSelectedOptionRangeClientRects(node.parentElement.parentElement, start, end);
      }

      // console.log('node.parentElement.tagName', node.parentElement.tagName);
      // console.log('clientRects', clientRects);

      if (!clientRects) {
        continue;
      }

      const $highlight = document.createElement('SPAN');

      $highlight.style.left = `${clientRects.left}px`;
      $highlight.style.top = `${clientRects.top}px`;
      $highlight.style.width = `${clientRects.width}px`;
      $highlight.style.height = `${clientRects.height}px`;
      $highlight.style.position = 'fixed';
      $highlight.style.background = 'rgba(255, 230, 0, 0.35)';
      $highlight.style.outline = '1px solid rgba(180, 140, 0, 0.8)';
      $highlight.style.borderRadius = '3px';
      $highlight.style.pointerEvents = 'none';

      document.getElementsByTagName('body')[0].append($highlight);

      range.detach?.();
    }
  }
}

