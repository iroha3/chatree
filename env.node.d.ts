/**
 * 只为 vite.config.ts 里的 `process.env.npm_package_version` 提供最小声明。
 *
 * 项目没有安装 @types/node —— 为了读一个环境变量引一整套 Node 类型不划算，
 * 所以这里手动补这一行。tsconfig.node.json 的 include 里有它。
 */
declare const process: {
  env: Record<string, string | undefined>;
};
