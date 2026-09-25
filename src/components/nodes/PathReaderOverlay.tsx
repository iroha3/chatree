import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Brain, ChevronDown, BookOpen, GitBranch, Settings, CornerDownRight } from 'lucide-react';
import { MdPreview } from 'md-editor-rt';
import 'md-editor-rt/lib/preview.css';
import { ChatNode } from '../../types';
import { useThemeStore } from '../../stores/themeStore';
import { useModelStore } from '../../stores/modelStore';
import { useSessionStore } from '../../stores/sessionStore';
import { useT } from '../../i18n';
import CopyButton from '../CopyButton';
import { countChars } from '../../utils/text';
import { cardConsumesWheel } from '../../utils/wheelChain';
import { buildPath, branchGroup, childrenOf } from '../../utils/tree';

/**
 * 连续阅读浮层（双击任意节点打开）。
 *
 * 以前它只渲染**被双击的那一个节点**，于是「一条 20 轮的对话」还是得一个节点一个节点
 * 双击着看。现在它把「根 → 这个节点」**整条路径**摊成一列卡片，从上往下读就行，
 * 不用在画布上拖来拖去（画布处理的是「结构」，这里处理的是「线性阅读」）。
 *
 * 路径旁边（右侧）会把**兄弟分支**列出来 —— 就是画布上横向那一排 —— 点一下就切过去。
 * 切过去 = 把阅读终点改成那个节点；如果它还有后续，卡片流末尾会出现「从这条继续」。
 *
 * 只读：不改任何数据，不碰 store 的写接口。
 *
 * 用 portal 挂到 body：节点在 React Flow 的 transform 容器里，直接渲染会被
 * transform / overflow 裁掉，也会被别的节点盖住。
 */
interface PathReaderOverlayProps {
  /** 双击的那个节点：阅读路径的终点。 */
  targetId: string;
  /** 流式期间的实时思维链（只对 targetId 那个节点生效） */
  streamingReasoning?: string | null;
  onClose: () => void;
}

/** 读到底后还要再往下滚多少像素才翻到下一轮（防手滑，一个滚轮格大约 100）。 */
const ADVANCE_AFTER = 140;

const PathReaderOverlay: React.FC<PathReaderOverlayProps> = ({ targetId, streamingReasoning, onClose }) => {
  const t = useT();
  const { theme } = useThemeStore();
  const { models } = useModelStore();
  const [currentId, setCurrentId] = useState(targetId);
  const [openReasoning, setOpenReasoning] = useState<Record<string, boolean>>({});
  /** 刚翻到的卡片：给它一个短促的落点高亮，告诉你「现在读的是这张」。 */
  const [landedId, setLandedId] = useState<string | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const scrollerRef = useRef<HTMLDivElement>(null);
  /** 读到底之后又继续往下滚的累计量（防手滑，见 handleReaderWheel）。 */
  const overscrollRef = useRef(0);
  /** 平滑滚动刚起步的那几十毫秒里，容器还停在底部，得挡住重复翻页。 */
  const advanceLockRef = useRef(0);
  /** 打开浮层那一下用瞬到（平滑滑一大段反而慢），之后就一律和点分支同一种滚动。 */
  const behaviorRef = useRef<ScrollBehavior>('auto');
  const mountedRef = useRef(false);

  // 节点组件只知道自己，拿不到整棵树，所以从 store 里把所在会话找出来。
  const session = useSessionStore((s) => s.sessions.find((x) => x.nodes.some((n) => n.id === targetId)));
  const nodes = useMemo(() => session?.nodes ?? [], [session]);

  const path = useMemo(() => buildPath(nodes, currentId), [nodes, currentId]);
  const last = path[path.length - 1];
  const nextBranches = useMemo(() => (last ? childrenOf(nodes, last.id) : []), [nodes, last]);
  const turns = path.filter((n) => n.type === 'chat').length;

  // 定位到目标卡片的**顶部** —— 双击的意图是「从这里开始读」，不是看卡片中间。
  // 滚轮翻页和点分支用**同一种**平滑滚动 —— 之前滚轮用瞬到，结果就是「内容直接
  // 传送走了，我也跟着不知道读到哪了」。首屏例外：刚打开浮层就滑一大段很别扭。
  useEffect(() => {
    const behavior = behaviorRef.current;
    behaviorRef.current = 'smooth';
    overscrollRef.current = 0;
    // 平滑滚动起步前（下面 60ms 那一段）容器还在底部，把重复翻页挡住。
    advanceLockRef.current = Date.now() + 400;
    if (mountedRef.current) setLandedId(currentId);
    mountedRef.current = true;
    const id = window.setTimeout(() => {
      cardRefs.current[currentId]?.scrollIntoView({ behavior, block: 'start' });
    }, 60);
    // 高亮只留一下，别让它在已经读完的卡片上一直亮着。
    const clear = window.setTimeout(() => setLandedId(null), 1200);
    return () => {
      window.clearTimeout(id);
      window.clearTimeout(clear);
    };
  }, [currentId]);

  // Esc 关闭。挂在 window 上，不依赖内层元素是否聚焦。打开期间锁掉 body 滚动。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const preview = (m: ChatNode) => {
    const text = m.userMessage || (m.type === 'system' ? t('系统提示词') : t('（空）'));
    return text.length > 40 ? text.slice(0, 40) + '…' : text;
  };

  // 读到头再继续滚 = 翻到下一轮。和画布里「卡片滚到底、画布接着走」是同一套手感。
  // 只在**恰好一个**后续时才自动翻：有分叉就得让用户自己选（D-013）。多滑一截
  // （阈值）才翻，否则刚看到最后一行还没读完就被顶走了。
  const handleReaderWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (nextBranches.length !== 1 || e.deltaY <= 0) {
      overscrollRef.current = 0;
      return;
    }
    if (Date.now() < advanceLockRef.current) {
      overscrollRef.current = 0;
      return;
    }
    const el = scrollerRef.current;
    if (!el) return;
    // 还有任何一层能滚（比如思考过程的长文本没到底）就不算「读到头」。
    if (cardConsumesWheel(el, e.nativeEvent)) {
      overscrollRef.current = 0;
      return;
    }
    overscrollRef.current += e.deltaY;
    if (overscrollRef.current >= ADVANCE_AFTER) {
      overscrollRef.current = 0;
      setCurrentId(nextBranches[0].id);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        // 只有点到遮罩本身才关；拖动选择文字时滑出面板不关
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[92vh] w-[min(1040px,96vw)] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-neutral-100 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <BookOpen size={14} className="shrink-0 text-neutral-400" />
            <span className="truncate text-sm font-medium text-neutral-700">
              {session?.title || t('阅读')}
            </span>
            <span className="shrink-0 text-[11px] text-neutral-400">{t('{n} 轮', { n: turns })}</span>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
            title={t('关闭')}
          >
            <X size={16} />
          </button>
        </div>

        <div ref={scrollerRef} onWheel={handleReaderWheel} className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {path.length === 0 ? (
            <p className="py-10 text-center text-sm italic text-neutral-400">{t('这条路径没有内容')}</p>
          ) : (
            path.map((node) => {
              const group = branchGroup(nodes, node.id);
              const idx = group.findIndex((g) => g.id === node.id) + 1;
              const isSystem = node.type === 'system';
              const modelName = models.find((m) => m.id === node.modelId)?.name;
              const reasoning = node.id === targetId ? streamingReasoning || node.reasoning || '' : node.reasoning || '';
              const showReasoning = !!openReasoning[node.id];

              return (
                <div key={node.id} className="flex gap-4 pb-6">
                  <div
                    ref={(el) => {
                      cardRefs.current[node.id] = el;
                    }}
                    className={`min-w-0 flex-1 ${landedId === node.id ? 'reader-land' : ''}`}
                    data-reader-node={node.id}
                  >
                    <div
                      className={`rounded-xl border border-neutral-200 px-5 py-4 shadow-sm ${
                        isSystem ? 'bg-neutral-50' : 'bg-white'
                      }`}
                    >
                      <div className="mb-3 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                        {isSystem ? (
                          <>
                            <Settings size={12} />
                            {t('系统提示词')}
                          </>
                        ) : (
                          modelName || t('对话节点')
                        )}
                      </div>

                      {isSystem ? (
                        <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-neutral-700">
                          {node.userMessage || <span className="italic text-neutral-400">{t('（空）')}</span>}
                        </div>
                      ) : (
                        <>
                          <div className="group relative rounded-lg bg-neutral-50 px-4 py-3">
                            <div className="whitespace-pre-wrap pr-6 text-[15px] leading-relaxed text-neutral-700">
                              {node.userMessage || <span className="italic text-neutral-400">{t('（空）')}</span>}
                            </div>
                            {node.userMessage ? (
                              <CopyButton
                                text={node.userMessage}
                                className="absolute right-2 top-2 rounded p-1 text-neutral-400 opacity-0 transition-opacity hover:text-neutral-700 group-hover:opacity-100"
                              />
                            ) : null}
                          </div>

                          {reasoning ? (
                            <div className="mt-3 overflow-hidden rounded-lg border border-neutral-100">
                              <button
                                type="button"
                                onClick={() => setOpenReasoning((s) => ({ ...s, [node.id]: !s[node.id] }))}
                                className="flex w-full items-center justify-between px-3 py-2 text-xs text-neutral-500 transition-colors hover:bg-neutral-50 hover:text-neutral-700"
                              >
                                <span className="flex items-center">
                                  <Brain size={13} className="mr-1.5" />
                                  {t('思考过程')}
                                </span>
                                <ChevronDown
                                  size={13}
                                  className={`transition-transform ${showReasoning ? 'rotate-180' : ''}`}
                                />
                              </button>
                              {showReasoning ? (
                                <pre className="m-0 max-h-[40vh] overflow-auto whitespace-pre-wrap break-words border-t border-neutral-100 bg-neutral-50/50 px-3 py-2.5 font-sans text-xs leading-relaxed text-neutral-500">
                                  {reasoning}
                                </pre>
                              ) : null}
                            </div>
                          ) : null}

                          {node.assistantMessage ? (
                            <div className="mt-3">
                              <MdPreview
                                editorId={`reader-${node.id}`}
                                modelValue={node.assistantMessage}
                                theme={theme}
                                noMermaid
                                className="md-preview reader overflow-auto break-words"
                                style={{ backgroundColor: 'transparent', maxWidth: '100%' }}
                                previewTheme="vuepress"
                              />
                            </div>
                          ) : (
                            <p className="py-6 text-center text-sm italic text-neutral-400">
                              {node.isStreaming ? t('思考中...') : t('回答将显示在这里')}
                            </p>
                          )}

                          {node.assistantMessage ? (
                            <div className="mt-2 flex items-center justify-end gap-3 border-t border-neutral-100 pt-2 text-[11px] text-neutral-400">
                              <span>{t('{n} 字', { n: countChars(node.assistantMessage) })}</span>
                              <CopyButton
                                text={node.assistantMessage}
                                size={12}
                                label={t('复制')}
                                className="flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
                              />
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>
                  </div>

                  {/* 右侧：这一排在画布上横向的那些兄弟分支，点一下切过去 */}
                  {group.length > 1 ? (
                    <div className="hidden w-44 shrink-0 md:block">
                      <div className="sticky top-0 rounded-lg border border-dashed border-neutral-200 bg-neutral-50/60 p-2">
                        <div className="mb-1.5 flex items-center gap-1 text-[11px] text-neutral-400">
                          <GitBranch size={12} />
                          {t('分支 {i}/{n}', { i: idx, n: group.length })}
                        </div>
                        <div className="space-y-1">
                          {group.map((m, i) => (
                            <button
                              key={m.id}
                              onClick={() => {
                              behaviorRef.current = 'smooth';
                              setCurrentId(m.id);
                            }}
                              className={`w-full rounded-md px-2 py-1.5 text-left text-[12px] leading-snug transition-colors ${
                                m.id === node.id
                                  ? 'bg-neutral-900 text-white'
                                  : 'text-neutral-600 hover:bg-neutral-100'
                              }`}
                            >
                              <span className="mr-1 opacity-60">{i + 1}.</span>
                              {preview(m)}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}

          {/* 路径终点 */}
          {nextBranches.length === 1 ? (
            <div className="rounded-lg border border-dashed border-neutral-200 bg-neutral-50/60 p-3 text-center">
              <div className="flex items-center justify-center gap-1 text-[11px] text-neutral-400">
                <CornerDownRight size={12} />
                {t('向下滚动阅读下一轮')}
              </div>
              <button
                onClick={() => {
                  behaviorRef.current = 'smooth';
                  setCurrentId(nextBranches[0].id);
                }}
                className="mt-2 max-w-[320px] truncate rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-[12px] text-neutral-600 transition-colors hover:border-neutral-300 hover:bg-neutral-50"
              >
                {preview(nextBranches[0])}
              </button>
            </div>
          ) : nextBranches.length > 1 ? (
            <div className="rounded-lg border border-dashed border-neutral-200 bg-neutral-50/60 p-3">
              <div className="mb-2 flex items-center gap-1 text-[11px] text-neutral-400">
                <CornerDownRight size={12} />
                {t('选择分支继续')}
              </div>
              <div className="flex flex-wrap gap-2">
                {nextBranches.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      behaviorRef.current = 'smooth';
                      setCurrentId(m.id);
                    }}
                    className="max-w-[260px] truncate rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-left text-[12px] text-neutral-600 transition-colors hover:border-neutral-300 hover:bg-neutral-50"
                  >
                    {preview(m)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default PathReaderOverlay;
