<p align="center">
  <img src="assets/hero.png" alt="Chatree — 本地优先的树状大模型对话工作台" width="100%">
</p>

<div align="center">

# Chatree

[![CI](https://img.shields.io/github/actions/workflow/status/iroha3/chatree/ci.yml?branch=master&style=flat-square&label=CI)](https://github.com/iroha3/chatree/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/github/license/iroha3/chatree?style=flat-square&color=2F7A5A)](LICENSE)
[![Release](https://img.shields.io/github/v/release/iroha3/chatree?style=flat-square&color=3178C6)](https://github.com/iroha3/chatree/releases)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=0B172A)](package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](src/)

**让每个念头都能分叉，保留每一次探索。**

面向非线性思考与决策推演的本地优先 LLM 工作台。支持自由分叉、模型并排对比与整条路径沉浸阅读。提供跨平台桌面客户端。

🌐 **中文** | [**English**](README.md)

</div>

传统的线性对话将所有思考强行压缩进单一时间轴：想要尝试不同假设，原来的思路就会被覆盖或挤出视野；多轮对话往往伴随着上下文污染与不可控的 Token 膨胀。

Chatree 将对话转化为二维画布与分支路径。用户可以从任意节点分叉探索、在不同分支上挂载不同模型或参数、并排对比生成质量，同时通过沉浸式路径阅读器流畅浏览长对话链。

所有会话与模型配置均保存在浏览器本地 IndexedDB 中，直连配置的 API 端点，无任何应用层后端。

<p align="center">
  <img src="assets/treeai-workspace.png" alt="Chatree 画布：从系统提示词分出两条独立分支并继续衍生后续对话" width="100%">
</p>

<p align="center"><sub>同一个问题，衍生多条互不干扰的探索路径。随时分叉、随时对照。</sub></p>

## 核心特性

### 1. 分支即推演 (Branching as Reasoning)
- **从任意节点分叉**：换一种问法、换一个假设、调整提示词，历史探索完整保留。
- **祖先上下文自动回溯**：发送请求时仅严格提取该分支的父代消息链，兄弟分支天然物理隔离，根除上下文污染与模型幻觉。

### 2. 双模体验：画布拓扑 + 连续阅读 (Dual-Mode Experience)
- **画布全局俯瞰**：直观展示思路演进图谱，支持拖拽平移、缩放与分支重排。
- **整条路径连续阅读**：双击任意节点即可展开自根节点至当前节点的沉浸阅读流。阅读长文本无需在画布上反复拖拽；遇到分叉点可在右侧一键切轨，到底继续滚动平滑翻至下一轮。

### 3. 节点级独立调参与模型横向评测 (Per-Node Control)
- **自由配置参数**：每个分支节点可单独指定模型（DeepSeek、OpenAI、Claude、Ollama 等）、采样温度及思考强度（Reasoning Effort）。
- **同屏直观对照**：在同一前置上下文下并排观察不同模型的逻辑论证与代码质量。

### 4. 本地优先与工程透明度 (Local-First & Transparency)
- **离线与数据自持**：零第三方 CDN 依赖，数据全量驻留本地 IndexedDB，内网与离线环境皆可运行。
- **透明度指标**：单次回答实时解析并展示 Token 用量（区分输入、输出、思考 Token）、上下文缓存命中率及生成速率（tok/s）。
- **推理模型深度集成**：思考链独立通道实时流式展示，生成完毕静默折叠。

---

## 快速开始

### 依赖环境
- [Bun](https://bun.sh)（本项目全程基于 Bun 工具链）
- 支持流式 `POST /chat/completions` 的 OpenAI 兼容 API 端点
- 接口需支持浏览器端 CORS 跨域请求

### 本地运行

```bash
git clone https://github.com/iroha3/chatree.git
cd chatree
bun install
bun run dev
```

在浏览器中打开控制台输出的地址（默认为 `http://127.0.0.1:5175`）。

### 开始使用

1. 点击左下角齿轮打开 **设置 → 模型**。
2. 添加模型名称、API 地址（如 `https://api.deepseek.com/v1`）、API Key 及模型标识（Model ID）。
3. 新建会话，在系统提示词节点中输入全局设定。
4. 点击底部 `+` 添加对话节点，输入问题并发送。
5. 点击任意节点下方的 `+` 开启分支或继续追问；双击卡片开启连续路径阅读。

> [!IMPORTANT]
> Chatree 为纯客户端架构，API Key 仅存放于当前浏览器的 IndexedDB 中。请妥善保管凭据，避免在不受信任的公共设备上配置密钥。备份导出文件已默认剔除 API Key。

---

## 桌面客户端

基于 [Pake](https://github.com/tw93/Pake) 构建轻量跨平台原生客户端（Windows / macOS / Linux）：

```bash
bun run desktop:build        # 当前平台完整安装包
bun run desktop:build:fast   # 快速构建单二进制可执行文件
```

打包规范与环境排查详见 [`docs/DEV.md`](docs/DEV.md)。

---

## 开发与工程规范

| 命令 | 说明 |
|---|---|
| `bun run dev` | 启动开发服务器 |
| `bun run lint` | 代码风格与语法检查 |
| `bun run build` | 生产环境打包到 `dist/` |
| `bun test:edge` | 连线契约与核心状态逻辑测试 |
| `bun test:usage` | Token 与用量解析契约测试 |
| `bun test:tree` | 分支拓扑与路径回溯算法测试 |
| `bun test:ux` | 节点交互与排版断言（需 Edge + CDP） |

修改代码前请阅读 [`docs/DEV.md`](docs/DEV.md) 了解数据契约、交互规范与已知边界。

---

## 部署

- **静态托管（Cloudflare Pages 等）**：构建产物为 `dist/` 纯静态文件。构建命令推荐配置为 `bun install --frozen-lockfile && bun run build`，输出目录为 `dist`，并配置 SPA 回退规则 `/* → /index.html 200`。
- **Docker 容器化**：仓库包含预置 `Dockerfile`（Bun 多阶段构建 + Nginx 静态分发），支持私有化集群部署。

---

## 许可证与致谢

Chatree 基于开源项目 [Anionex/treeAI](https://github.com/Anionex/treeAI)（MIT 协议）二次开发与演进，感谢原作者奠定的优秀基础。

本项目采用 [MIT 许可证](LICENSE) 开源。
