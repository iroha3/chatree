<div align="center">

# 🌳 Chatree

[![CI](https://img.shields.io/github/actions/workflow/status/iroha3/chatree/ci.yml?branch=master&style=flat-square&label=CI)](https://github.com/iroha3/chatree/actions/workflows/ci.yml)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL_3.0-blue.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/iroha3/chatree?style=flat-square&color=3178C6)](https://github.com/iroha3/chatree/releases)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=0B172A)](package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](src/)

**面向非线性对话的本地优先 LLM 工作台。**

支持自由分叉、模型并排对比与整条路径沉浸阅读。

🌐 **中文** | [**English**](README.md)

</div>

<p align="center">
  <img src="assets/treeai-workspace.png" alt="Chatree 画布：从系统提示词分出两条独立分支并继续衍生后续对话" width="100%">
</p>

<p align="center"><sub>同一个问题，衍生多条互不干扰的探索路径。随时分叉、随时对照。</sub></p>

## 核心特性

### 自由分叉
- **从任意节点分叉**：换一种问法、换一个假设、调整提示词，历史探索完整保留。
- **祖先上下文自动回溯**：发送请求时仅严格提取该分支的父代消息链，兄弟分支天然物理隔离，根除上下文污染与模型幻觉。

### 画布拓扑 + 连续阅读
- **画布全局俯瞰**：直观展示思路演进图谱，支持拖拽平移、缩放与分支重排。
- **整条路径连续阅读**：双击任意节点即可展开自根节点至当前节点的沉浸式阅读流。阅读长文本无需在画布上反复拖拽；遇到分叉点可在右侧一键切轨，到底继续滚动平滑翻至下一轮。

### 横向对比
- **节点级独立配置**：每个分支节点可单独指定模型（DeepSeek、LM Studio、Ollama 等）及采样温度。
- **同屏直观对照**：在同一前置上下文下并排观察不同模型的逻辑论证与生成质量。

---

## 隐私与安全

- **本地优先**：纯客户端架构，所有会话数据与模型配置仅保存在当前浏览器的 IndexedDB 中，无任何第三方应用后端。
- **凭据直连**：API Key 仅存放于本地并在浏览器端直接发起请求；备份导出文件自动剔除 API Key，避免导出时凭据泄露。
- **完全离线**：零第三方 CDN 依赖，在局域网与断网环境下均可独立运行。
- **用量透明**：单次回答实时解析并展示 Token 用量（区分输入、输出、思考 Token）、上下文缓存命中率及生成速率（tok/s）。

---

## 使用方式

### 网页版
访问 [chatree.pages.dev](https://chatree.pages.dev)，浏览器内即开即用。

### 桌面客户端
前往 [Releases](https://github.com/iroha3/chatree/releases) 下载适用于当前操作系统的安装包或便携版：
- **Windows**: `.msi` 安装包 / 便携版 `Chatree.exe`
- **macOS**: 通用安装包（兼容 Apple Silicon 与 Intel 芯片）
- **Linux**: `.deb` / `.AppImage`

### Docker 部署
可通过预构建的容器镜像私有化运行：

```bash
docker run -d -p 8080:80 ghcr.io/iroha3/chatree:latest
```

访问 `http://localhost:8080` 即可使用。

---

## 开发调试

```bash
git clone https://github.com/iroha3/chatree.git
cd chatree
bun install
bun run dev
```

打开终端输出的地址（默认为 `http://127.0.0.1:5175`）即可开始对话。

> 架构设计、数据契约、端到端测试及桌面构建说明请直接查阅 [`docs/DEV.md`](docs/DEV.md)。

---

## 许可证与致谢

Chatree 基于开源项目 [Anionex/treeAI](https://github.com/Anionex/treeAI)（MIT 协议）二次开发与演进，感谢原作者奠定的优秀基础。

本项目采用 [GNU AGPLv3 许可证](LICENSE) 开源。
