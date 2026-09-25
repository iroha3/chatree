/**
 * 按 **Unicode 码点** 数「字数」。
 *
 * 不能直接用 `String.prototype.length` —— 它数的是 UTF-16 码元：BMP 之外的字符
 * （emoji、部分生僻字、数学符号）会被算成 2 个，于是「👍」显示 2 字。码点数至少
 * 能把这类错消掉；再往上的字素簇（肤色修饰、ZWJ 组合）不做，成本不值。
 *
 * 注意这只是**字符数**，不是 token 数 —— token 只认服务商返回的 usage。
 */
export function countChars(text: string | undefined | null): number {
  if (!text) return 0;
  let n = 0;
  // for...of 按码点迭代，避免 Array.from 为大字符串额外分配一个数组
  for (const _ of text) n += 1;
  return n;
}

import React from 'react';

/**
 * 将纯文本中匹配 query 的子串用 <mark> 高亮包裹，用于 React JSX 渲染。
 */
export function highlightMatch(text: string | undefined | null, query: string): React.ReactNode {
  if (!text) return '';
  const needle = query.trim();
  if (!needle) return text;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    part.toLowerCase() === needle.toLowerCase() ? (
      React.createElement(
        'mark',
        {
          key: i,
          className: 'search-text-mark bg-amber-200 text-neutral-900 rounded-[2px] px-0.5',
        },
        part
      )
    ) : (
      part
    )
  );
}

/**
 * 在富文本/Markdown 渲染容器 DOM 树内高亮所有匹配文本。
 */
export function highlightDomText(container: HTMLElement | null, query: string) {
  if (!container) return;

  const existing = container.querySelectorAll('mark.search-text-mark');
  existing.forEach(m => {
    const parent = m.parentNode;
    if (parent) {
      parent.replaceChild(document.createTextNode(m.textContent || ''), m);
      parent.normalize();
    }
  });

  const needle = query.trim();
  if (!needle) return;

  const regex = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      if (!node.textContent || !node.parentElement) return NodeFilter.FILTER_REJECT;
      const tag = node.parentElement.tagName.toLowerCase();
      if (tag === 'script' || tag === 'style' || tag === 'mark') return NodeFilter.FILTER_REJECT;
      return regex.test(node.textContent) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });

  const matchedNodes: Text[] = [];
  while (walker.nextNode()) {
    matchedNodes.push(walker.currentNode as Text);
  }

  for (const textNode of matchedNodes) {
    const parent = textNode.parentNode;
    if (!parent) continue;
    const text = textNode.textContent || '';
    regex.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }
      const mark = document.createElement('mark');
      mark.className = 'search-text-mark bg-amber-200 text-neutral-900 rounded-[2px] px-0.5';
      mark.textContent = match[0];
      frag.appendChild(mark);
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
      frag.appendChild(document.createTextNode(text.slice(lastIndex)));
    }

    parent.replaceChild(frag, textNode);
  }
}
