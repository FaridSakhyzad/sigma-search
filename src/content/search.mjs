export function clearResults() {
  document.querySelectorAll('.__sigma-search-highlight-el__').forEach(($el) => $el.remove());
}

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

function getInputTextRangeClientRects(input, start, end) {
  if (!(input instanceof HTMLInputElement)) {
    throw new Error('Pass an HTMLInputElement');
  }

  const value = input.value ?? '';
  if (start > end) [start, end] = [end, start];
  start = Math.max(0, Math.min(start, value.length));
  end = Math.max(0, Math.min(end, value.length));
  if (start === end) return [];

  const cs = getComputedStyle(input);
  const r = input.getBoundingClientRect();

  // === content box ===
  const bL = parseFloat(cs.borderLeftWidth) || 0;
  const bR = parseFloat(cs.borderRightWidth) || 0;
  const bT = parseFloat(cs.borderTopWidth) || 0;
  const bB = parseFloat(cs.borderBottomWidth) || 0;
  const pIS = parseFloat(cs.paddingInlineStart || cs.paddingLeft) || 0;
  const pIE = parseFloat(cs.paddingInlineEnd || cs.paddingRight) || 0;
  const pT = parseFloat(cs.paddingTop) || 0;
  const pB = parseFloat(cs.paddingBottom) || 0;

  const contentLeft = r.left + bL + pIS;
  const contentRight = r.right - bR - pIE;
  const contentTop = r.top + bT + pT;
  const contentBottom = r.bottom - bB - pB;
  const contentWidth = Math.max(0, contentRight - contentLeft);
  const contentHeight = Math.max(0, contentBottom - contentTop);

  // line-height (на практике текст в input вертикально центрируется внутри content box)
  const lineHeight = (() => {
    const lh = cs.lineHeight;
    if (!lh || lh === 'normal') return (parseFloat(cs.fontSize) || 16) * 1.2;
    if (lh.endsWith('px')) return parseFloat(lh) || 0;
    const n = parseFloat(lh);
    return Number.isFinite(n) ? n * (parseFloat(cs.fontSize) || 16) : (parseFloat(cs.fontSize) || 16) * 1.2;
  })();
  const rowTop = contentTop + Math.max(0, (contentHeight - lineHeight) / 2);

  // измерения текста
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = cs.font || [
    cs.fontStyle, cs.fontVariant, cs.fontWeight,
    cs.fontSize + '/' + (cs.lineHeight || 'normal'),
    cs.fontFamily
  ].filter(Boolean).join(' ');

  const fullW = ctx.measureText(value).width;
  const beforeW = ctx.measureText(value.slice(0, start)).width;
  const targetW = ctx.measureText(value.slice(start, end)).width;

  const isRTL = cs.direction === 'rtl';
  const textIndent = parseFloat(cs.textIndent) || 0;

  // Chrome: если текст не переполняет contentWidth и scrollLeft == 0,
  // применяется text-align. Иначе — левый край + scrollLeft (для RTL наоборот).
  const overflow = fullW > contentWidth + 0.5; // допуск
  const sc = input.scrollLeft;                 // для RTL Chrome использует отрицательные значения
  const align = (cs.textAlign === 'start' ? (isRTL ? 'right' : 'left')
    : cs.textAlign === 'end' ? (isRTL ? 'left' : 'right')
      : cs.textAlign);

  let baseX;
  if (!overflow && Math.abs(sc) < 0.5) {
    // выравнивание внутри content box
    if (align === 'center') {
      baseX = contentLeft + (contentWidth - fullW) / 2 + textIndent;
    } else if (align === 'right') {
      baseX = contentLeft + (contentWidth - fullW) - (isRTL ? 0 : 0) + textIndent;
    } else { // left
      baseX = contentLeft + textIndent;
    }
  } else {
    // режим прокрутки: текст «прибит» к левому (или правому в RTL) краю + scrollLeft
    // В Chrome для RTL scrollLeft может быть отрицателен: позиции = startEdge - scrollLeft
    // Приведём к единой формуле:
    const scEff = sc; // Chrome-браузерный sc уже «как есть»
    if (isRTL) {
      // В RTL начало текста у правого края contentRight
      baseX = contentRight + textIndent + scEff - fullW; // смещаем базу на ширину полного текста
    } else {
      baseX = contentLeft + textIndent - scEff;
    }
  }

  // позиция начала диапазона
  const left = isRTL
    ? baseX + (fullW - (beforeW + targetW))
    : baseX + beforeW;

  let width = targetW;

  // клип по видимой части content box
  const clipLeft = Math.max(left, contentLeft);
  const clipRight = Math.min(left + width, contentRight);

  if (clipRight <= clipLeft) {
    return {}
  };

  const rect = {
    left: clipLeft,
    top: rowTop,
    width: clipRight - clipLeft,
    height: lineHeight,
    right: clipRight,
    bottom: rowTop + lineHeight,
    x: clipLeft,
    y: rowTop
  };

  return rect;
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
  const after = escapeHtml(val.slice(end));

  // <br> вместо \n, иначе pre-wrap сам перенесёт
  const toHtml = s => s.replace(/\n/g, '<br/>');

  mirror.innerHTML =
    toHtml(before) +
    `<span data-hit>${toHtml(target)}</span>` +
    toHtml(after);

  document.body.appendChild(mirror);

  // Синхронизируем скролл (важно!)
  mirror.scrollTop = textarea.scrollTop;
  mirror.scrollLeft = textarea.scrollLeft;

  // Геометрия цели
  const hit = mirror.querySelector('[data-hit]');
  const hitRects = Array.from(hit.getClientRects());
  const mirrorRect = mirror.getBoundingClientRect();
  const taRect = textarea.getBoundingClientRect();

  // Переводим rect'ы из системы «mirror/viewport» в систему «textarea/viewport»
  const rects = hitRects.map(r => ({
    x: taRect.left + (r.left - mirrorRect.left),
    y: taRect.top + (r.top - mirrorRect.top),
    left: taRect.left + (r.left - mirrorRect.left),
    top: taRect.top + (r.top - mirrorRect.top),
    right: taRect.left + (r.right - mirrorRect.left),
    bottom: taRect.top + (r.bottom - mirrorRect.top),
    width: r.width,
    height: r.height,
  }));

  mirror.remove();

  return rects;

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
  end = Math.max(0, Math.min(end, text.length));
  if (start === end) return [];

  const cs = getComputedStyle(select);
  const selRect = select.getBoundingClientRect();

  // === контент-бокс select ===
  const bL = parseFloat(cs.borderLeftWidth) || 0;
  const bR = parseFloat(cs.borderRightWidth) || 0;
  const bT = parseFloat(cs.borderTopWidth) || 0;
  const bB = parseFloat(cs.borderBottomWidth) || 0;

  // логические паддинги (RTL-aware) → Chrome их считает, но держим запас
  const pIS = parseFloat(cs.paddingInlineStart || cs.paddingLeft) || 0;
  const pIE = parseFloat(cs.paddingInlineEnd || cs.paddingRight) || 0;
  const pT = parseFloat(cs.paddingTop) || 0;
  const pB = parseFloat(cs.paddingBottom) || 0;

  const contentLeft = selRect.left + bL + pIS;
  const contentRight = selRect.right - bR - pIE;
  const contentTop = selRect.top + bT + pT;
  const contentBottom = selRect.bottom - bB - pB;
  const contentWidth = Math.max(0, contentRight - contentLeft);

  // === вертикаль строки ===
  const isClosed = !select.multiple && (select.size === 0 || select.size === 1);

  const lineHeight = (() => {
    const lh = cs.lineHeight;
    if (!lh || lh === 'normal') return (parseFloat(cs.fontSize) || 16) * 1.2;
    if (lh.endsWith('px')) return parseFloat(lh) || 0;
    const n = parseFloat(lh);
    return Number.isFinite(n) ? n * (parseFloat(cs.fontSize) || 16) : (parseFloat(cs.fontSize) || 16) * 1.2;
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

  const fullW = ctx.measureText(text).width;
  const beforeW = ctx.measureText(text.slice(0, start)).width;
  const targetW = ctx.measureText(text.slice(start, end)).width;

  // нормализуем text-align с учётом start/end
  const normAlign =
    cs.textAlign === 'start' ? (isRTL ? 'right' : 'left') :
    cs.textAlign === 'end' ? (isRTL ? 'left' : 'right') :
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

const renderHighlight = (clientRects) => {
  const $highlight = document.createElement('SPAN');

  $highlight.style.left = `${clientRects.left + window.scrollX}px`;
  $highlight.style.top = `${clientRects.top + window.scrollY}px`;
  $highlight.style.width = `${clientRects.width}px`;
  $highlight.style.height = `${clientRects.height}px`;

  $highlight.style.position = 'absolute';
  $highlight.style.background = 'rgba(255, 230, 0, 0.35)';
  $highlight.style.outline = '1px solid rgba(180, 140, 0, 0.8)';
  $highlight.style.borderRadius = '3px';
  $highlight.style.pointerEvents = 'none';
  $highlight.style.zIndex = 2147483647;

  $highlight.classList.add('__sigma-search-highlight-el__');

  document.getElementsByTagName('body')[0].append($highlight);
}

export function sSearch(searchQuery, caseSensitive, wholeWords, useRegex) {
  clearResults();

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

  const walker = document.createTreeWalker(document.body,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    {
      acceptNode: (node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const $element = node;
          const tag = $element.tagName;

          if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') {
            return NodeFilter.FILTER_REJECT;
          }

          const cs = getComputedStyle($element);

          if (cs.display === 'none' || cs.visibility === 'hidden') {
            return NodeFilter.FILTER_REJECT;
          }

          if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
            return NodeFilter.FILTER_ACCEPT;
          }

          return NodeFilter.FILTER_SKIP;
        }

        if (node.nodeType === Node.TEXT_NODE) {
          const $parentElement = node.parentElement;

          if (!$parentElement) {
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

        return NodeFilter.FILTER_SKIP;
      }
    });

  let node;

  while ((node = walker.nextNode())) {
    if (node.nodeType === Node.TEXT_NODE) {
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

        const clientRects = range.getClientRects()[0];

        if (!clientRects) {
          continue;
        }

        range.detach?.();
        renderHighlight(clientRects);
      }
    } else {
      let text;

      if (node.tagName === 'INPUT') {
        text = walker.currentNode.value;
      }

      if (node.tagName === 'TEXTAREA') {
        text = walker.currentNode.value;
      }

      if (node.tagName === 'SELECT') {
        const idx = node.selectedIndex;
        text = node.options[idx]?.text ?? '';
      }

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

        let clientRects;

        if (node.tagName === 'INPUT') {
          clientRects = getInputTextRangeClientRects(node, start, end);
        }

        if (node.tagName === 'TEXTAREA') {
          clientRects = getTextareaRangeClientRects(node, start, end)[0];
        }

        if (node.tagName === 'SELECT') {
          clientRects = getSelectedOptionRangeClientRects(node, start, end);
        }

        if (!clientRects) {
          continue;
        }

        renderHighlight(clientRects);
      }
    }
  }
}
