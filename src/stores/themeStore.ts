import { create } from 'zustand';

export type Theme = 'light' | 'dark';
export type GridStyle = 'none' | 'dots';

const STORAGE_KEY = 'treeai-theme';
const GRID_STORAGE_KEY = 'treeai-grid';

function readStoredTheme(): Theme | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'light' || saved === 'dark' ? saved : null;
  } catch {
    // 隐私模式下 localStorage 可能不可用
    return null;
  }
}

function readStoredGrid(): GridStyle {
  try {
    const saved = localStorage.getItem(GRID_STORAGE_KEY);
    return saved === 'none' || saved === 'dots' ? saved : 'dots';
  } catch {
    return 'dots';
  }
}

function systemPrefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches === true
  );
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  // 让原生控件（滚动条、输入框）也跟着切换
  document.documentElement.style.colorScheme = theme;

  // 浏览器工具栏 / 移动端状态栏的颜色也跟着走
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', theme === 'dark' ? '#121212' : '#fafafa');
  }
}

const initialTheme: Theme = readStoredTheme() ?? (systemPrefersDark() ? 'dark' : 'light');
const initialGrid: GridStyle = readStoredGrid();

interface ThemeState {
  theme: Theme;
  grid: GridStyle;
  setTheme: (theme: Theme) => void;
  setGrid: (grid: GridStyle) => void;
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: initialTheme,
  grid: initialGrid,

  setTheme: (theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // 写不进去也无所谓，当前会话仍然生效
    }
    applyTheme(theme);
    set({ theme });
  },

  setGrid: (grid) => {
    try {
      localStorage.setItem(GRID_STORAGE_KEY, grid);
    } catch {
      // 忽略写入失败
    }
    set({ grid });
  },

  toggleTheme: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
}));

// 在 React 首次渲染之前就应用，避免首屏先闪一下白色
applyTheme(initialTheme);
