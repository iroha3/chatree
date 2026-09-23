import React, { useEffect, useRef, useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { useT } from '../i18n';
import { showSuccess } from '../utils/notification';

interface CopyButtonProps {
  text: string;
  /** 图标尺寸 */
  size?: number;
  /** 给了就显示文字（覆盖层底栏那种） */
  label?: string;
  className?: string;
  title?: string;
}

/**
 * 把文本写进剪贴板。
 *
 * 优先用 `document.execCommand('copy')`：它是同步的、在用户手势里就能用，
 * 而且**不弹权限框**。`navigator.clipboard.writeText` 在桌面端（WebView2）会
 * 弹一个原生的「是否允许访问剪贴板」授权框，既打扰用户，又因为是异步的、
 * 要等用户点掉才 resolve，导致按钮的「已复制」反馈迟迟出不来。
 * 所以把它降级成兜底方案。
 */
function writeClipboard(text: string) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    if (ok) return;
  } catch {
    // execCommand 不可用时走后面的兜底
  }
  navigator.clipboard?.writeText(text).catch(() => {});
}

/**
 * 复制按钮：点完图标立刻变成「对号」，约 1.5s 后变回。
 *
 * 之前只有底部悬浮的那个复制按钮有反馈，而且是用 `document.activeElement`
 * 做背景色动画 —— 点哪个按钮哪个就是 activeElement，凑巧能亮一下，
 * 但提问区右上角、阅读覆盖层里的复制按钮完全没有反馈。
 * 现在统一抽出来：复制 → 图标换成绿色对号。
 */
const CopyButton: React.FC<CopyButtonProps> = ({ text, size = 14, label, className = '', title }) => {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  const handleCopy = () => {
    // 先给反馈，再复制：反馈不等剪贴板，任何权限/策略问题都不影响手感。
    setCopied(true);
    showSuccess(t('内容已复制到剪贴板'));
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1500);
    writeClipboard(text);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`nodrag nopan ${className}`}
      title={title ?? t('复制到剪贴板')}
    >
      {copied ? (
        <Check size={size} className="text-emerald-500" />
      ) : (
        <Copy size={size} />
      )}
      {label ? <span>{label}</span> : null}
    </button>
  );
};

export default CopyButton;
