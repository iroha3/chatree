import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useSessionStore } from '../stores/sessionStore';
import {
  Search, Plus, Settings, Trash2, Edit, X, ChevronLeft, ChevronRight,
  MessageSquare, Sun, Moon, Star, Folder, FolderPlus, Check
} from 'lucide-react';
import Logo from './Logo';
import { gsap } from 'gsap';
import { showSuccess, showWarning, showInfo } from '../utils/notification';
import { requestConfirm } from '../stores/confirmStore';
import { useThemeStore } from '../stores/themeStore';
import { useModelStore } from '../stores/modelStore';
import { useSyncStore } from '../stores/syncStore';
import { defaultSessionTitle, isDefaultSessionTitle } from '../utils/sessionTitle';
import { generateId } from '../utils/id';
import type { SettingsTab } from './SettingsModal';
import { useT } from '../i18n';
import { Session, Folder as FolderType } from '../types';

interface SidebarProps {
  onOpenSettings: (tab?: SettingsTab) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

/** 搜索时提取匹配消息的摘要片段 */
function getSessionMatchSnippet(session: Session, query: string): string | null {
  const needle = query.trim().toLowerCase();
  if (!needle) return null;
  for (const node of session.nodes) {
    for (const text of [node.userMessage, node.assistantMessage]) {
      if (text && text.toLowerCase().includes(needle)) {
        const idx = text.toLowerCase().indexOf(needle);
        const start = Math.max(0, idx - 12);
        const end = Math.min(text.length, idx + needle.length + 20);
        const prefix = start > 0 ? '…' : '';
        const suffix = end < text.length ? '…' : '';
        return `${prefix}${text.slice(start, end).replace(/\s+/g, ' ')}${suffix}`;
      }
    }
  }
  return null;
}

/** 会话需要移动到的目标：某个文件夹，或 null 表示「未分类」 */
type MoveTarget = string | null;

// 标记应用是否已在浏览器中首屏渲染过一次，用于避免刷新页面时的位移动画，同时保留收起后再展开时的平滑入场动效
let hasAppMountedOnce = false;

const Sidebar: React.FC<SidebarProps> = ({ onOpenSettings, collapsed, onToggleCollapse }) => {
  const {
    sessions,
    folders,
    currentSessionId,
    currentFolderView,
    setCurrentSessionId,
    setFolderView,
    createSession,
    deleteSession,
    updateSession,
    searchQuery,
    setSearchQuery,
    filteredSessions,
    toggleStarred,
    createFolder,
    renameFolder,
    deleteFolder,
    moveSessionToFolder,
  } = useSessionStore();
  const hasRemoteUpdate = useSyncStore((s) => s.hasRemoteUpdate);

  const { theme, toggleTheme } = useThemeStore();
  const { models } = useModelStore();
  const t = useT();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [starredOnly, setStarredOnly] = useState(false);
  // 新建文件夹的内联输入
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  // 重命名文件夹
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [folderNameDraft, setFolderNameDraft] = useState('');
  // 拖拽目标高亮
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  // 上下文菜单（桌面右键 / 移动端长按）：fixed 定位并自动贴合视口
  const [contextMenu, setContextMenu] = useState<
    | { type: 'session'; x: number; y: number; session: Session }
    | { type: 'folder'; x: number; y: number; folder: FolderType }
    | null
  >(null);
  // 会话右键菜单里的二级文件夹展开面板
  const [sessionFolderSubmenu, setSessionFolderSubmenu] = useState(false);

  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressTriggered = useRef(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const folderBarRef = useRef<HTMLDivElement>(null);
  const newFolderInputRef = useRef<HTMLInputElement>(null);

  // 搜索来自 store，收藏过滤只是本地视图层的事，不需要进 store
  const visibleSessions = starredOnly
    ? filteredSessions.filter(s => s.starred)
    : filteredSessions;

  // O(1) 文件夹字典映射，规避列表频繁 find 的渲染开销
  const folderMap = useMemo(() => new Map(folders.map(f => [f.id, f])), [folders]);

  // 点击别处或按 ESC 关掉上下文菜单
  useEffect(() => {
    if (!contextMenu) {
      setSessionFolderSubmenu(false);
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenu(null);
        setSessionFolderSubmenu(false);
      }
    };
    const handleResize = () => {
      setContextMenu(null);
      setSessionFolderSubmenu(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleResize);
    };
  }, [contextMenu]);

  const [isMobile, setIsMobile] = useState(() => {
    return typeof window !== 'undefined' ? window.innerWidth < 768 : false;
  });

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 侧边栏展开动画：首屏静默渲染，收起后再展开时播放流畅的滑入动画
  useEffect(() => {
    if (!hasAppMountedOnce) {
      hasAppMountedOnce = true;
      return;
    }

    const el = sidebarRef.current;
    if (!el) return;

    const tween = gsap.fromTo(
      el,
      { x: isMobile ? '-100%' : -20, opacity: isMobile ? 1 : 0 },
      {
        x: 0,
        opacity: 1,
        duration: 0.22,
        ease: 'power2.out',
        clearProps: 'transform,opacity',
      }
    );

    return () => {
      tween.kill();
      gsap.set(el, { clearProps: 'transform,opacity' });
    };
  }, [isMobile]);

  /*
   * 新建 / 切换到某个文件夹后，把它滚进横滑栏的可见范围。
   * store 的 createFolder 已经会 `currentFolderView = 新文件夹`，但标签栏是横向
   * 滚动的 —— 新 chip 长在末尾，视野不跟过去的话用户根本看不到「新建成功了」。
   * 用 `scrollIntoView({ nearest })`：已在视野内就什么都不做，比手算 scrollLeft
   * 少一维（StrictMode 下 effect 双跑也不会把它推过头）。
   */
  useEffect(() => {
    const bar = folderBarRef.current;
    if (!bar) return;
    if (currentFolderView === 'all') return;
    const el = bar.querySelector<HTMLElement>(`[data-folder-id="${currentFolderView}"]`);
    el?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
  }, [currentFolderView, folders.length]);

  /*
   * 点「新建」：把横滑栏挪到末尾的输入槽并聚焦，让用户直接在空位里敲名字。
   * 输入槽就在「新文件夹会落到的位置」（列表末尾），回车后 chip 原地长出来，
   * 视野不用再跨半个横条去找它。
   */
  useEffect(() => {
    if (!isCreatingFolder) return;
    const input = newFolderInputRef.current;
    input?.focus({ preventScroll: true });
    input?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
  }, [isCreatingFolder]);

  const handleCreateSession = () => {
    // 一个模型都没有就先别建会话：建出来只会是个空画板（画布上一个节点都没有），
    // 新人看到白屏完全不知道下一步该干嘛。直接把他送到「设置 → 模型」。
    // 和 App 欢迎页那个按钮保持同一套行为。
    if (models.length === 0) {
      showInfo(t('先添加一个模型，再开始对话。'));
      onOpenSettings('models');
      return;
    }

    // 当前正停在某个文件夹里新建，就直接归进去，省一次拖动；全部视图下不预设归属
    const folderId = currentFolderView !== 'all' ? currentFolderView : null;

    const newSession = {
      id: generateId(),
      title: defaultSessionTitle(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: [],
      folderId,
    };
    createSession(newSession);
    if (isMobile) {
      onToggleCollapse();
    }
  };

  const handleTouchStart = (
    e: React.TouchEvent,
    target: { type: 'session'; session: Session } | { type: 'folder'; folder: FolderType }
  ) => {
    if (e.touches.length !== 1) return;
    if ((e.target as HTMLElement).closest('button, input')) return;

    const touch = e.touches[0];
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };
    isLongPressTriggered.current = false;

    if (longPressTimer.current) clearTimeout(longPressTimer.current);

    longPressTimer.current = setTimeout(() => {
      isLongPressTriggered.current = true;
      try {
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          navigator.vibrate(15);
        }
      } catch {}

      const x = Math.max(10, Math.min(touch.clientX, window.innerWidth - 200));
      const y = Math.max(10, Math.min(touch.clientY, window.innerHeight - 280));

      if (target.type === 'session') {
        setContextMenu({ type: 'session', x, y, session: target.session });
      } else {
        setContextMenu({ type: 'folder', x, y, folder: target.folder });
      }
    }, 450);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartPos.current || !longPressTimer.current) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartPos.current.x;
    const dy = touch.clientY - touchStartPos.current.y;
    if (Math.hypot(dx, dy) > 8) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    touchStartPos.current = null;
    if (isLongPressTriggered.current) {
      setTimeout(() => {
        isLongPressTriggered.current = false;
      }, 200);
    }
  };

  const handleTouchCancel = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    touchStartPos.current = null;
    isLongPressTriggered.current = false;
  };

  const handleOpenSessionContextMenu = (e: React.MouseEvent, session: Session) => {
    e.preventDefault();
    e.stopPropagation();
    const x = Math.max(10, Math.min(e.clientX, window.innerWidth - 200));
    const y = Math.max(10, Math.min(e.clientY, window.innerHeight - 280));
    setContextMenu({ type: 'session', x, y, session });
  };

  const handleOpenFolderContextMenu = (e: React.MouseEvent, folder: FolderType) => {
    e.preventDefault();
    e.stopPropagation();
    const x = Math.max(10, Math.min(e.clientX, window.innerWidth - 200));
    const y = Math.max(10, Math.min(e.clientY, window.innerHeight - 280));
    setContextMenu({ type: 'folder', x, y, folder });
  };

  const handleStartEdit = (id: string, title: string) => {
    setEditingId(id);
    setEditTitle(title);
  };

  const handleSaveEdit = (id: string) => {
    const session = sessions.find(s => s.id === id);
    if (session && editTitle.trim()) {
      updateSession({
        ...session,
        title: editTitle.trim()
      });
      showSuccess(t('会话名称已更新'));
    } else if (!editTitle.trim()) {
      showWarning(t('会话名称不能为空'));
    }
    setEditingId(null);
  };

  const handleKeyPress = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter') {
      handleSaveEdit(id);
    } else if (e.key === 'Escape') {
      setEditingId(null);
    }
  };

  const handleDeleteSession = (id: string) => {
    deleteSession(id);
    showInfo(t('会话已删除'));
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      setIsCreatingFolder(false);
      return;
    }
    const folder = await createFolder(newFolderName);
    if (folder) {
      showSuccess(t('已创建文件夹「{name}」', { name: folder.name }));
    }
    setNewFolderName('');
    setIsCreatingFolder(false);
  };

  const handleRenameFolder = async (id: string) => {
    if (folderNameDraft.trim()) {
      await renameFolder(id, folderNameDraft);
      showSuccess(t('文件夹已重命名'));
    }
    setEditingFolderId(null);
    setFolderNameDraft('');
  };

  const handleDeleteFolder = async (id: string, name: string) => {
    // 会话不会被删，仍保留在「全部」列表中
    const ok = await requestConfirm({
      title: t('删除文件夹'),
      message: t('删除文件夹「{name}」？\n其中的会话仍会保留在「全部」列表中，不会被删除。', { name }),
      confirmLabel: t('删除'),
      cancelLabel: t('取消'),
      danger: true,
    });
    if (!ok) return;
    await deleteFolder(id);
    showInfo(t('文件夹已删除，会话已保留在列表中'));
  };

  const handleDropOnFolder = (e: React.DragEvent, target: MoveTarget) => {
    e.preventDefault();
    setDragOverFolder(null);
    const sessionId = e.dataTransfer.getData('text/session-id');
    if (!sessionId) return;
    moveSessionToFolder(sessionId, target);
  };

  const chipClass = (active: boolean) =>
    `flex-shrink-0 inline-flex items-center h-[26px] px-2.5 py-1 rounded-full text-xs border transition-colors select-none ${
      active
        ? 'bg-neutral-900 text-white border-neutral-900 dark:bg-neutral-100 dark:text-neutral-900 dark:border-neutral-100'
        : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50 dark:bg-neutral-900 dark:text-neutral-300 dark:border-neutral-800 dark:hover:bg-neutral-800'
    }`;

  if (collapsed) return null;

  return (
    <div
      ref={sidebarRef}
      className={`sidebar w-64 h-full bg-white border-r border-neutral-200 flex flex-col ${
        isMobile ? 'fixed inset-y-0 left-0 z-30 shadow-2xl' : 'relative z-10'
      }`}
    >
      <button
        className="absolute -right-3 top-4 bg-white p-1.5 rounded-full border border-neutral-200 shadow-minimal z-20"
        onClick={onToggleCollapse}
      >
        <ChevronLeft size={14} className="text-neutral-600" />
      </button>

      <div className="px-4 py-4 border-b border-neutral-100 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {/* 和浏览器标签页 favicon、「关于」页用同一个标识 */}
          <Logo size={24} />
          <h1 className="text-base font-medium gradient-text whitespace-nowrap">Chatree</h1>
        </div>
        {/* 设置 / 主题从底部挤上来，顺手缩到 15px。
            px-4 + pr-4 让图标右缘离侧栏边 32px，给浮在边框上的折叠小圆钮
            （占右侧 14px）留出约 18px 空隙，两者不撞。 */}
        <div className="flex items-center gap-0.5 shrink-0 pr-4">
          <button
            className="relative flex items-center justify-center p-1.5 text-neutral-400 hover:text-neutral-800 hover:bg-neutral-100 rounded-md transition-colors"
            onClick={() => onOpenSettings(hasRemoteUpdate ? 'data' : 'models')}
            title={hasRemoteUpdate ? t('设置（WebDAV 云端有更新）') : t('设置')}
          >
            <Settings size={15} />
            {hasRemoteUpdate && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-white dark:ring-neutral-900" />
            )}
          </button>
          <button
            className="flex items-center justify-center p-1.5 text-neutral-400 hover:text-neutral-800 hover:bg-neutral-100 rounded-md transition-colors"
            onClick={toggleTheme}
            title={theme === 'dark' ? t('切换到日间模式') : t('切换到夜间模式')}
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      </div>

      <div className="px-4 py-3">
        <div className="relative">
          <input
            ref={searchInputRef}
            type="text"
            placeholder={t('搜索标题或内容...')}
            className="w-full pl-9 pr-16 py-2 rounded-md border border-neutral-200 bg-neutral-50 focus:outline-none focus:ring-1 focus:ring-neutral-300 focus:border-neutral-300 text-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {/* 用 inset-y-0 + items-center 让放大镜和右侧按钮都相对输入框真实高度垂直居中，
              不再靠 top-2.5 这种写死的偏移（字号或 padding 一改就错位）。 */}
          <Search className="pointer-events-none absolute left-3 inset-y-0 my-auto text-neutral-400" size={16} />
          <div className="absolute right-2 inset-y-0 flex items-center gap-0.5">
            {searchQuery && (
              <button
                className="text-neutral-400 hover:text-neutral-600 p-1"
                onClick={() => setSearchQuery('')}
                title={t('清除搜索')}
              >
                <X size={14} />
              </button>
            )}
            <button
              className={`p-1 rounded transition-colors ${
                starredOnly
                  ? 'text-amber-400'
                  : 'text-neutral-300 hover:text-neutral-500'
              }`}
              onClick={() => setStarredOnly(v => !v)}
              title={starredOnly ? t('显示全部会话') : t('只看收藏')}
            >
              <Star size={14} fill={starredOnly ? 'currentColor' : 'none'} />
            </button>
          </div>
        </div>
      </div>

      {/* 文件夹栏：左边「新建」钉死在原位，右边是可横滑的分类标签。
          新建是**动作**不是筛选，所以只留一颗图标、不随标签横滑 —— 滑到多远都够得着，
          也不占文字宽度（把更多宽度让给标签）。
          顺序：全部 → 未分类（系统视图） → 用户文件夹 → [新建时的空输入槽]；
          新文件夹追加在最后，输入槽就在它将要出现的位置。 */}
      <div className="px-4 pb-2 flex items-center gap-1.5 shrink-0">
        <button
          className="flex-shrink-0 inline-flex h-[26px] w-[26px] items-center justify-center rounded-full text-neutral-400 border border-dashed border-neutral-300 hover:text-neutral-700 hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-500 dark:hover:text-neutral-300 transition-colors"
          onClick={() => setIsCreatingFolder(true)}
          title={t('新建文件夹')}
        >
          <FolderPlus size={13} />
        </button>

        {/* 可横滑的标签区：全部 + 用户文件夹 */}
        <div
          ref={folderBarRef}
          className="flex min-w-0 items-center gap-1.5 overflow-x-auto overscroll-x-contain scrollbar-hide flex-nowrap"
          onWheel={(e) => {
            if (e.deltaY !== 0) e.currentTarget.scrollLeft += e.deltaY;
          }}
        >
          <button
            className={`${chipClass(currentFolderView === 'all')} ${
              dragOverFolder === '__all__' ? 'ring-2 ring-inset ring-amber-300 border-amber-300' : ''
            }`}
            onClick={() => setFolderView('all')}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverFolder('__all__');
            }}
            onDragLeave={() => setDragOverFolder(prev => (prev === '__all__' ? null : prev))}
            onDrop={(e) => handleDropOnFolder(e, null)}
          >
            {t('全部')}
          </button>

          {folders.map(folder => {
            const active = currentFolderView === folder.id;
            if (editingFolderId === folder.id) {
              return (
                <div
                  key={folder.id}
                  className="flex-shrink-0 relative inline-flex items-center gap-1.5 h-[26px] px-2.5 py-1 rounded-full text-xs border border-neutral-400 dark:border-neutral-500 bg-white dark:bg-neutral-900 shadow-sm select-none"
                >
                  <Folder size={12} className="shrink-0 text-neutral-600 dark:text-neutral-300" />
                  <span className="invisible whitespace-pre text-xs min-w-[2ch] max-w-[140px] pointer-events-none">
                    {folderNameDraft || ' '}
                  </span>
                  <input
                    autoFocus
                    onFocus={(e) => e.target.select()}
                    className="absolute left-[28px] right-2.5 top-0 bottom-0 bg-transparent text-xs text-neutral-800 dark:text-neutral-200 outline-none border-none p-0 focus:ring-0 leading-normal"
                    value={folderNameDraft}
                    onChange={(e) => setFolderNameDraft(e.target.value)}
                    onBlur={() => handleRenameFolder(folder.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRenameFolder(folder.id);
                      if (e.key === 'Escape') { setEditingFolderId(null); setFolderNameDraft(''); }
                    }}
                  />
                </div>
              );
            }
            return (
              <div
                key={folder.id}
                data-folder-id={folder.id}
                onDragOver={(e) => { e.preventDefault(); setDragOverFolder(folder.id); }}
                onDragLeave={() => setDragOverFolder(prev => (prev === folder.id ? null : prev))}
                onDrop={(e) => handleDropOnFolder(e, folder.id)}
                onContextMenu={(e) => handleOpenFolderContextMenu(e, folder)}
                onTouchStart={(e) => handleTouchStart(e, { type: 'folder', folder })}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchCancel}
                onDoubleClick={() => {
                  setEditingFolderId(folder.id);
                  setFolderNameDraft(folder.name);
                }}
                className={`select-none ${chipClass(active)} ${
                  dragOverFolder === folder.id ? 'ring-2 ring-inset ring-amber-300 border-amber-300' : ''
                }`}
              >
                <button
                  className="inline-flex min-w-0 items-center gap-1.5 text-left"
                  onClick={() => {
                    if (isLongPressTriggered.current) return;
                    setFolderView(folder.id);
                  }}
                  title={folder.name}
                >
                  <Folder size={12} className="shrink-0" />
                  <span className="truncate max-w-[140px]">{folder.name}</span>
                </button>
              </div>
            );
          })}

          {isCreatingFolder && (
            <div className="flex-shrink-0 relative inline-flex items-center gap-1.5 h-[26px] px-2.5 py-1 rounded-full text-xs border border-neutral-400 dark:border-neutral-500 bg-white dark:bg-neutral-900 shadow-sm select-none">
              <Folder size={12} className="shrink-0 text-neutral-600 dark:text-neutral-300" />
              <span className="invisible whitespace-pre text-xs min-w-[5ch] max-w-[140px] pointer-events-none">
                {newFolderName || t('文件夹名')}
              </span>
              <input
                ref={newFolderInputRef}
                className="absolute left-[28px] right-2.5 top-0 bottom-0 bg-transparent text-xs text-neutral-800 dark:text-neutral-200 placeholder:text-neutral-400 outline-none border-none p-0 focus:ring-0 leading-normal"
                placeholder={t('文件夹名')}
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onBlur={handleCreateFolder}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateFolder();
                  if (e.key === 'Escape') { setIsCreatingFolder(false); setNewFolderName(''); }
                }}
              />
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-1 scrollbar-hide">
        {visibleSessions.length === 0 ? (
          <div className="text-center text-neutral-400 py-8 text-sm">
            {searchQuery
              ? t('没有匹配的会话')
              : starredOnly
                ? t('还没有收藏的会话')
                : currentFolderView !== 'all'
                  ? t('这个文件夹还是空的')
                  : t('暂无会话')}
          </div>
        ) : (
          visibleSessions.map(session => {
            const matchSnippet = searchQuery ? getSessionMatchSnippet(session, searchQuery) : null;
            const folder = session.folderId ? folderMap.get(session.folderId) : null;

            return (
              <div
                key={session.id}
                draggable={folders.length > 0}
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/session-id', session.id);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onContextMenu={(e) => handleOpenSessionContextMenu(e, session)}
                onTouchStart={(e) => handleTouchStart(e, { type: 'session', session })}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchCancel}
                className={`sidebar-session py-2 px-3 flex justify-between items-center rounded-md group relative select-none ${
                  currentSessionId === session.id
                    ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100'
                    : 'text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
                }`}
                onClick={() => {
                  if (isLongPressTriggered.current) return;
                  setCurrentSessionId(session.id);
                  if (isMobile) onToggleCollapse();
                }}
              >
                {editingId === session.id ? (
                  <input
                    type="text"
                    className="flex-1 px-2 py-1 border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 rounded text-sm focus:outline-none focus:ring-1 focus:ring-neutral-400"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onBlur={() => handleSaveEdit(session.id)}
                    onKeyDown={(e) => handleKeyPress(e, session.id)}
                    autoFocus
                  />
                ) : (
                  <div className="flex min-w-0 flex-1 items-center cursor-pointer">
                    <button
                      className={`mr-2 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full transition-colors ${
                        session.starred
                          ? 'text-amber-400 hover:text-amber-500'
                          : 'text-neutral-300 hover:text-amber-400'
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleStarred(session.id);
                      }}
                      title={session.starred ? t('取消收藏') : t('收藏')}
                    >
                      {session.starred ? (
                        <Star size={16} fill="currentColor" />
                      ) : (
                        <>
                          <MessageSquare size={16} className="group-hover:hidden" />
                          <Star size={16} className="hidden group-hover:block" />
                        </>
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between min-w-0">
                        <span className="truncate text-sm mr-2 flex-1 min-w-0">
                          {isDefaultSessionTitle(session.title) ? defaultSessionTitle() : session.title}
                        </span>
                        {/* 「全部」心智模型：在全部会话视图中，已归类的会话展示精致微型胶囊徽标，靠右端齐 */}
                        {currentFolderView === 'all' && folder && (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-neutral-400 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800 border border-neutral-200/50 dark:border-neutral-700/50 shrink-0 font-normal max-w-[80px] truncate ml-auto group-hover:opacity-0 transition-opacity"
                            title={folder.name}
                          >
                            <Folder size={9} className="shrink-0" />
                            <span className="truncate">{folder.name}</span>
                          </span>
                        )}
                      </div>
                      {matchSnippet && (
                        <div className="truncate text-xs text-amber-600/90 dark:text-amber-400/90 mt-0.5">
                          {matchSnippet}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 桌面悬停快速操作（保留重命名与删除） */}
                {editingId !== session.id && (
                  <div
                    className="absolute right-2 top-1/2 z-10 flex -translate-y-1/2 items-center space-x-0.5 bg-inherit pl-1 opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      className="text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 p-1 rounded-md hover:bg-neutral-200/50 dark:hover:bg-neutral-700/50"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartEdit(session.id, isDefaultSessionTitle(session.title) ? defaultSessionTitle() : session.title);
                      }}
                      title={t('重命名')}
                    >
                      <Edit size={14} />
                    </button>
                    <button
                      className="text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 p-1 rounded-md hover:bg-neutral-200/50 dark:hover:bg-neutral-700/50"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteSession(session.id);
                      }}
                      title={t('删除')}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* 底部只留「新建会话」一整条 */}
      <div className="px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-neutral-100 dark:border-neutral-800 shrink-0">
        <button
          className="w-full flex items-center justify-center space-x-2 py-2 px-4 bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 rounded-md hover:bg-neutral-800 dark:hover:bg-white transition-colors"
          onClick={handleCreateSession}
        >
          <Plus size={16} />
          <span className="text-sm">{t('新建会话')}</span>
        </button>
      </div>

      {/* 右键 & 移动端长按上下文菜单 */}
      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-40 bg-transparent"
            onClick={() => {
              setContextMenu(null);
              setSessionFolderSubmenu(false);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu(null);
              setSessionFolderSubmenu(false);
            }}
          />

          {/* 主上下文菜单 */}
          <div
            className="fixed z-50 min-w-[170px] max-w-[220px] bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-xl py-1 text-sm select-none"
            style={{ top: contextMenu.y, left: contextMenu.x }}
            onClick={(e) => e.stopPropagation()}
          >
            {contextMenu.type === 'session' && (
              isMobile && sessionFolderSubmenu ? (
                /* 移动端下推二级视图：带返回按钮与高度限制滚动 */
                <div className="px-1 py-0.5">
                  <button
                    className="w-full text-left px-2 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg flex items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-300 font-medium border-b border-neutral-100 dark:border-neutral-800 mb-1"
                    onClick={() => setSessionFolderSubmenu(false)}
                  >
                    <ChevronLeft size={13} className="shrink-0" />
                    <span>{t('返回')}</span>
                  </button>

                  <div className="max-h-52 overflow-y-auto overscroll-contain scrollbar-hide space-y-0.5">
                    {contextMenu.session.folderId && (
                      <button
                        className="w-full text-left px-2.5 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400 transition-colors"
                        onClick={() => {
                          moveSessionToFolder(contextMenu.session.id, null);
                          setContextMenu(null);
                          setSessionFolderSubmenu(false);
                        }}
                      >
                        <X size={12} className="text-neutral-400 shrink-0" />
                        <span>{t('移出文件夹')}</span>
                      </button>
                    )}
                    {folders.map(folder => {
                      const isCurrent = contextMenu.session.folderId === folder.id;
                      return (
                        <button
                          key={folder.id}
                          className="w-full text-left px-2.5 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg flex items-center justify-between text-xs text-neutral-700 dark:text-neutral-200 transition-colors"
                          onClick={() => {
                            moveSessionToFolder(contextMenu.session.id, folder.id);
                            setContextMenu(null);
                            setSessionFolderSubmenu(false);
                          }}
                        >
                          <span className="truncate flex items-center gap-1.5 mr-2">
                            <Folder
                              size={12}
                              className={`shrink-0 ${isCurrent ? 'text-amber-500' : 'text-neutral-400'}`}
                            />
                            <span className="truncate">{folder.name}</span>
                          </span>
                          {isCurrent && <Check size={12} className="text-neutral-500 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>

                  <div className="border-t border-neutral-100 dark:border-neutral-800 mt-1 pt-1">
                    <button
                      className="w-full text-left px-2.5 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors"
                      onClick={() => {
                        setContextMenu(null);
                        setSessionFolderSubmenu(false);
                        setIsCreatingFolder(true);
                      }}
                    >
                      <FolderPlus size={12} className="shrink-0" />
                      <span>{t('新建文件夹…')}</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* 会话主操作项：紧凑干净，仅展示核心操作与文件夹入口 */
                <>
                  <div className="px-1 py-0.5">
                    <button
                      className="w-full text-left px-2.5 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg flex items-center gap-2 text-xs text-neutral-700 dark:text-neutral-200 transition-colors"
                      onMouseEnter={() => setSessionFolderSubmenu(false)}
                      onClick={() => {
                        const s = contextMenu.session;
                        setContextMenu(null);
                        handleStartEdit(s.id, isDefaultSessionTitle(s.title) ? defaultSessionTitle() : s.title);
                      }}
                    >
                      <Edit size={13} className="text-neutral-400 shrink-0" />
                      <span>{t('重命名')}</span>
                    </button>
                    <button
                      className="w-full text-left px-2.5 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg flex items-center gap-2 text-xs text-neutral-700 dark:text-neutral-200 transition-colors"
                      onMouseEnter={() => setSessionFolderSubmenu(false)}
                      onClick={() => {
                        const s = contextMenu.session;
                        toggleStarred(s.id);
                        setContextMenu(null);
                      }}
                    >
                      <Star
                        size={13}
                        className={`shrink-0 ${
                          contextMenu.session.starred
                            ? 'text-amber-400 fill-amber-400'
                            : 'text-neutral-400'
                        }`}
                      />
                      <span>{contextMenu.session.starred ? t('取消收藏') : t('收藏')}</span>
                    </button>
                  </div>

                  <div className="border-t border-neutral-100 dark:border-neutral-800 my-1" />

                  <div className="px-1 py-0.5 relative">
                    <button
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between text-xs transition-colors ${
                        sessionFolderSubmenu
                          ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100'
                          : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                      }`}
                      onMouseEnter={() => setSessionFolderSubmenu(true)}
                      onClick={() => setSessionFolderSubmenu(v => !v)}
                    >
                      <span className="flex items-center gap-2 truncate mr-1">
                        <Folder size={13} className="text-neutral-400 shrink-0" />
                        <span className="truncate">{t('移动到文件夹')}</span>
                      </span>
                      <ChevronRight size={12} className="text-neutral-400 shrink-0" />
                    </button>
                  </div>

                  <div className="border-t border-neutral-100 dark:border-neutral-800 my-1" />

                  <div className="px-1 py-0.5">
                    <button
                      className="w-full text-left px-2.5 py-1.5 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 rounded-lg flex items-center gap-2 text-xs transition-colors"
                      onMouseEnter={() => setSessionFolderSubmenu(false)}
                      onClick={() => {
                        const s = contextMenu.session;
                        setContextMenu(null);
                        handleDeleteSession(s.id);
                      }}
                    >
                      <Trash2 size={13} className="shrink-0" />
                      <span>{t('删除会话')}</span>
                    </button>
                  </div>
                </>
              )
            )}

            {contextMenu.type === 'folder' && (
              <div className="px-1 py-0.5">
                <div className="px-2.5 py-1 text-[11px] font-medium text-neutral-400 truncate max-w-[170px]">
                  {contextMenu.folder.name}
                </div>
                <button
                  className="w-full text-left px-2.5 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg flex items-center gap-2 text-xs text-neutral-700 dark:text-neutral-200 transition-colors"
                  onClick={() => {
                    const fid = contextMenu.folder.id;
                    const fname = contextMenu.folder.name;
                    setContextMenu(null);
                    setEditingFolderId(fid);
                    setFolderNameDraft(fname);
                  }}
                >
                  <Edit size={13} className="text-neutral-400 shrink-0" />
                  <span>{t('重命名')}</span>
                </button>
                <div className="border-t border-neutral-100 dark:border-neutral-800 my-1" />
                <button
                  className="w-full text-left px-2.5 py-1.5 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 rounded-lg flex items-center gap-2 text-xs transition-colors"
                  onClick={() => {
                    const f = contextMenu.folder;
                    setContextMenu(null);
                    handleDeleteFolder(f.id, f.name);
                  }}
                >
                  <Trash2 size={13} className="shrink-0" />
                  <span>{t('删除文件夹')}</span>
                </button>
              </div>
            )}
          </div>

          {/* 桌面端：二级文件夹悬浮侧栏（支持大量文件夹滚动，不撑爆屏幕） */}
          {!isMobile && contextMenu.type === 'session' && sessionFolderSubmenu && (
            <div
              className="fixed z-50 min-w-[170px] max-w-[220px] bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-xl py-1 text-sm select-none"
              style={{
                top: Math.min(contextMenu.y + 35, window.innerHeight - 260),
                left: contextMenu.x + 185 > window.innerWidth - 190
                  ? Math.max(10, contextMenu.x - 175)
                  : contextMenu.x + 175,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-2.5 py-1 text-[11px] font-medium text-neutral-400 flex items-center gap-1 border-b border-neutral-100 dark:border-neutral-800 mb-1">
                <Folder size={11} />
                <span>{t('选择文件夹')}</span>
              </div>

              <div className="max-h-52 overflow-y-auto overscroll-contain scrollbar-hide px-1 py-0.5 space-y-0.5">
                {contextMenu.session.folderId && (
                  <button
                    className="w-full text-left px-2.5 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400 transition-colors"
                    onClick={() => {
                      moveSessionToFolder(contextMenu.session.id, null);
                      setContextMenu(null);
                      setSessionFolderSubmenu(false);
                    }}
                  >
                    <X size={12} className="text-neutral-400 shrink-0" />
                    <span>{t('移出文件夹')}</span>
                  </button>
                )}
                {folders.map(folder => {
                  const isCurrent = contextMenu.session.folderId === folder.id;
                  return (
                    <button
                      key={folder.id}
                      className="w-full text-left px-2.5 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg flex items-center justify-between text-xs text-neutral-700 dark:text-neutral-200 transition-colors"
                      onClick={() => {
                        moveSessionToFolder(contextMenu.session.id, folder.id);
                        setContextMenu(null);
                        setSessionFolderSubmenu(false);
                      }}
                    >
                      <span className="truncate flex items-center gap-1.5 mr-2">
                        <Folder
                          size={12}
                          className={`shrink-0 ${isCurrent ? 'text-amber-500' : 'text-neutral-400'}`}
                        />
                        <span className="truncate">{folder.name}</span>
                      </span>
                      {isCurrent && <Check size={12} className="text-neutral-500 shrink-0" />}
                    </button>
                  );
                })}
              </div>

              <div className="border-t border-neutral-100 dark:border-neutral-800 mt-1 pt-1 px-1">
                <button
                  className="w-full text-left px-2.5 py-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors"
                  onClick={() => {
                    setContextMenu(null);
                    setSessionFolderSubmenu(false);
                    setIsCreatingFolder(true);
                  }}
                >
                  <FolderPlus size={12} className="shrink-0" />
                  <span>{t('新建文件夹…')}</span>
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Sidebar;
