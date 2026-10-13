import React, { useId } from 'react';

interface CanvasDotsProps {
  /** 点间距（屏幕像素，恒定）。 */
  gap?: number;
  /** 点的屏幕半径（px，恒定）。 */
  radius?: number;
  color?: string;
}

/**
 * 画布背景点阵 —— 一块**固定在屏幕空间**的底纹。
 *
 * 缩放、平移画布时，它都不跟着动、不跟着缩放：只有卡片（和连线）在动。
 * 所以这里刻意**不读** `useViewport()`，图案的间距 / 半径 / 偏移全按屏幕像素写死。
 *
 * 为什么不用 React Flow 自带的 `<Background variant="dots">`：它把点半径乘了缩放
 * （`radius = size × zoom / 2`），而且整块图案跟着 translate 一起平移 —— 放大时每个点
 * 胀成色斑、平移时点阵滑走。这里两样都不要。
 *
 * 这个组件挂在 `<ReactFlow>` 内部，占位与自带的 Background 一致（屏幕空间、位于
 * 节点层之下），只是不订阅视口变换。
 */
const CanvasDots: React.FC<CanvasDotsProps> = ({ gap = 28, radius = 0.75, color }) => {
  // useId 会带 `:`（如 `:r0:`），放进 SVG id / url(#…) 里不合法，去掉。
  const patternId = `chatree-dots-${useId().replace(/:/g, '')}`;

  return (
    <svg
      className="react-flow__background"
      aria-hidden
      style={{ position: 'absolute', width: '100%', height: '100%', top: 0, left: 0 }}
    >
      <pattern
        id={patternId}
        width={gap}
        height={gap}
        patternUnits="userSpaceOnUse"
        patternTransform={`translate(-${radius},-${radius})`}
      >
        <circle cx={radius} cy={radius} r={radius} fill={color} />
      </pattern>
      <rect x="0" y="0" width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  );
};

export default CanvasDots;
