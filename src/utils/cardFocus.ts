import type { ReactFlowInstance } from 'reactflow';

/**
 * 卡片里的「聚焦 / 看见这张卡」两个小工具。
 *
 * 共同的前提（踩过的坑，见 DEV §4.9）：
 *
 * 画布外层 `.react-flow` 是 React Flow 内联的 `overflow: hidden` —— 没有滚动条，
 * 可在浏览器眼里它**仍然是一个可滚动容器**。而它里面装着几千像素高的节点，
 * 所以它的 `scrollHeight` 可能有上万。于是：
 *
 *   - `el.focus()`（默认会把焦点元素滚进视野）
 *   - `el.scrollIntoView()`
 *
 * 都会去改它的 `scrollTop`。整块画布连同左下角的 Controls 一起被平移出去，
 * 而用户没有任何滚动条能拉回来 —— 表现就是「画布突然滚不动了，左下角那四个
 * 按钮反而跑到了中间」。卡片越多、树的坐标越深，一次被推走的距离越大，
 * 所以它看起来「时有时无」。
 *
 * 两道护栏：
 *   1. `index.css` 把 `.react-flow` 设成 `overflow: clip`（根本不是滚动容器）；
 *   2. 这边所有聚焦都带 `preventScroll`，手机上的「把卡片挪到视野中间」
 *      改用画布自己的平移。
 */

/** 聚焦，但绝不让浏览器顺手去滚任何祖先（特别是画布）。 */
export function focusWithoutScrolling(el: HTMLElement | null | undefined) {
  el?.focus({ preventScroll: true });
}

/** 窄屏（手机）—— 布局切到单列，软键盘会吃掉下半屏。 */
export function isNarrowLayout() {
  return typeof window !== 'undefined' && window.innerWidth < 640;
}

/**
 * 窄屏下把正在编辑的卡片挪到视野中央。
 *
 * ❌ 不能用 `scrollIntoView` 实现：那会去滚上面说的「假滚动容器」，
 * 画布和 Controls 会被永久推歪。这里用画布自己的平移（`setCenter`），
 * 平移量记在 React Flow 的视口里，不会和布局状态打架。
 *
 * `xPos` / `yPos` 是 NodeProps 给的世界坐标；尺寸用 `offsetWidth/offsetHeight`
 * —— 它们不带视口 `scale()`，正好等于卡片在世界坐标里的宽高。
 */
export function centerCardOnNarrowScreen(
  rf: ReactFlowInstance,
  el: HTMLElement | null,
  xPos: number,
  yPos: number
) {
  if (!isNarrowLayout()) return;
  // 等软键盘弹完（视口高度会变）再算，否则算出来的中心马上又是错的
  window.setTimeout(() => {
    if (!el) return;
    rf.setCenter(xPos + el.offsetWidth / 2, yPos + el.offsetHeight / 2, {
      zoom: rf.getZoom(),
      duration: 300,
    });
  }, 300);
}
