// @ts-check
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sessionStoreSrc = readFileSync(join(__dirname, '../src/stores/sessionStore.ts'), 'utf-8').replace(/\r\n/g, '\n');
const sidebarSrc = readFileSync(join(__dirname, '../src/components/Sidebar.tsx'), 'utf-8').replace(/\r\n/g, '\n');

console.log('Testing "全部" (All) mental model & Context Menu implementation...');

// 1. Session store tests
assert.ok(
  !sessionStoreSrc.includes("'uncategorized'"),
  'sessionStore must not define or use "uncategorized" in FolderView'
);
console.log('ok    FolderView type does not contain "uncategorized"');

assert.ok(
  sessionStoreSrc.includes("export type FolderView = 'all' | string;"),
  'FolderView should be "all" | string'
);
console.log('ok    FolderView is strictly "all" | string');

// Verify computeVisible logic in sessionStore
assert.ok(
  sessionStoreSrc.includes("if (folderView !== 'all') {\n    result = result.filter(s => s.folderId === folderView);\n  }"),
  'computeVisible filters by folder only when folderView !== "all"'
);
console.log('ok    computeVisible keeps all sessions visible when folderView === "all"');

// Verify createFolder keeps currentFolderView
assert.ok(
  sessionStoreSrc.includes("currentFolderView: folder.id") === false,
  'createFolder must not forcibly change currentFolderView'
);
console.log('ok    createFolder retains current view so sessions are not cleared out');

// 2. Sidebar component tests
assert.ok(
  !sidebarSrc.includes('__uncategorized__'),
  'Sidebar must not contain __uncategorized__ drag target'
);
console.log('ok    Sidebar does not have __uncategorized__ drag target');

assert.ok(
  !sidebarSrc.includes("setFolderView('uncategorized')"),
  'Sidebar must not switch to "uncategorized"'
);
console.log('ok    Sidebar does not switch to "uncategorized"');

// Context menu checks
assert.ok(
  sidebarSrc.includes('handleOpenSessionContextMenu'),
  'Sidebar must provide right-click handler for sessions'
);
console.log('ok    Sidebar provides desktop right-click for sessions');

assert.ok(
  sidebarSrc.includes('handleOpenFolderContextMenu'),
  'Sidebar must provide right-click handler for folder chips'
);
console.log('ok    Sidebar provides desktop right-click for folder chips');

// Mobile touch long-press checks
assert.ok(
  sidebarSrc.includes('handleTouchStart') &&
  sidebarSrc.includes('handleTouchMove') &&
  sidebarSrc.includes('handleTouchEnd'),
  'Sidebar must provide touch event handlers for mobile long-press'
);
console.log('ok    Sidebar provides touch handlers for mobile long-press');

assert.ok(
  sidebarSrc.includes('isLongPressTriggered'),
  'Sidebar must prevent ghost clicks following a long press'
);
console.log('ok    Sidebar guards against ghost clicks after touch long-press');

// Folder badge in 'all' view
assert.ok(
  sidebarSrc.includes("currentFolderView === 'all' && folder"),
  'Sidebar renders folder badge on sessions in "all" view'
);
console.log('ok    Sidebar renders folder badge for categorized sessions in "all" view');

// Removal of hover-expanding pill icons
assert.ok(
  !sidebarSrc.includes('group-hover/chip:max-w-[34px]'),
  'Sidebar must not have twitchy hover-expanding buttons on folder chips'
);
console.log('ok    Folder capsules are clean and stable without width-jumping hover buttons');

// Context menu items
assert.ok(
  sidebarSrc.includes("t('移出文件夹')"),
  'Context menu includes "移出文件夹" option'
);
console.log('ok    Context menu allows removing a session from its folder');

assert.ok(
  sidebarSrc.includes("t('新建文件夹…')"),
  'Context menu allows quick folder creation'
);
console.log('ok    Context menu provides quick folder creation');

console.log('\nAll checks for the "全部" mental model & context menu passed!');
