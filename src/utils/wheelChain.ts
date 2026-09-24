import { useEffect, type RefObject } from 'react';

/**
 * 画布里的滚轮「滚动链」。
 *
 * 背景：`ChatFlow` 开了 `panOnScroll`（滚轮 = 平移画布，Ctrl/⌘+滚轮 = 缩放）。
 * 但节点卡片内部本来就有好几层能滚的区域：
 *   - 回答区 `.assistant-message`（`max-height: 520px; overflow-y: auto`）
 *   - 思考过程 `pre`（`max-h-[240px] overflow-auto`）
 *   - 用户消息只读态（`max-h-[200px] overflow-auto`）
 *   - 编辑态的 `textarea`
 *
 * 如果**不拦**：React Flow 会 `preventDefault()` 去平移画布，内层就永远滚不动。
 * 如果**无脑拦**（旧实现）：鼠标停在卡片上时画布一动不动 —— 卡片宽 516px，
 * 画布上大部分面积都是卡片，表现就是「长对话根本没法往下读，感觉卡死」。
 *
 * 所以按浏览器的嵌套滚动语义来：**内层还能滚 → 滚内层；滚到底 / 根本没溢出 →
 * 放行，让画布平移。**
 */
export function cardConsumesWheel(root: HTMLElement | null, e: WheelEvent): boolean {
  if (!root) return false;

  // 从事件目标往上找到卡片根，逐个检查是否是可滚动的祖先。
  // 只拦「目标方向还有余量」的那种，否则放行给画布。
  let el = e.target as HTMLElement | null;
  while (el && root.contains(el)) {
    const style = getComputedStyle(el);
    const oy = style.overflowY;
    const ox = style.overflowX;
    const scrollableY = oy === 'auto' || oy === 'scroll' || oy === 'overlay';
    const scrollableX = ox === 'auto' || ox === 'scroll' || ox === 'overlay';
    const canY = scrollableY && el.scrollHeight > el.clientHeight + 1;
    const canX = scrollableX && el.scrollWidth > el.clientWidth + 1;

    if (
      (canY && e.deltaY < 0 && el.scrollTop > 0) ||
      (canY && e.deltaY > 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 1) ||
      (canX && e.deltaX < 0 && el.scrollLeft > 0) ||
      (canX && e.deltaX > 0 && el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
    ) {
      return true;
    }

    if (el === root) break;
    el = el.parentElement;
  }

  return false;
}

/**
 * 给节点卡片挂上滚轮处理（capture + `passive: false`）：
 * - Ctrl/⌘ + 滚轮 → 放行给 React Flow 缩放；同时 `preventDefault` 压掉浏览器整页缩放。
 * - 普通滚轮 → 内层还能滚就 `stopPropagation`（滚内层）；否则放行（画布平移）。
 *
 * 必须用 capture 阶段：React Flow 的平移监听挂在画布元素的冒泡阶段，
 * 我们要在它之前决定拦不拦。`passive: false` 是 `preventDefault` 的前提。
 */
export function useCardWheelChain(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const onWheel = (e: WheelEvent) => {
      if (!node.contains(e.target as Node)) return;

      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        return;
      }

      if (cardConsumesWheel(node, e)) e.stopPropagation();
    };

    const opts = { capture: true, passive: false } as const;
    node.addEventListener('wheel', onWheel, opts);
    return () => node.removeEventListener('wheel', onWheel, opts);
  }, [ref]);
}
