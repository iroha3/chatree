import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/*
 * 版本号单一来源：package.json。
 *
 * 通过 `npm run xxx` 启动时 npm 会注入 npm_package_version，用它注入成
 * 全局常量 __APP_VERSION__（见 src/vite-env.d.ts 的声明），这样应用里只读这一个
 * 常量，不用再在 AboutPanel 里手写一份、改版本时两处漏一处。
 * 直接 `npx vite` 跑（不经过 npm）时拿不到，退化成 0.0.0。
 */
const APP_VERSION = process.env.npm_package_version ?? '0.0.0';

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  plugins: [react()],
  server: {
    port: 5175,
    host: '127.0.0.1',
    strictPort: false,
    /*
     * 等文件「写完不再变」再通知 HMR。
     *
     * 不加这个，Windows 上偶尔会出现：编辑器/工具把文件截断重写的瞬间 chokidar
     * 就发了 change 事件，Vite 读到半截（甚至 0 字节）的内容并**缓存**下来 ——
     * 之后这个模块一直返回 `Content-Length: 0`，浏览器报
     * `does not provide an export named 'default'`，整个应用白屏，
     * 只有删掉 node_modules/.vite 重启才能恢复。
     * 让 watcher 多等一会儿，等 size 稳定了再读，就不会读到写一半的文件。
     */
    watch: {
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 50,
      },
    },
  },
});
