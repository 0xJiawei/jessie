# Jessie

<details open>
<summary><strong>English</strong></summary>

## What Jessie Is

Jessie is a local-first desktop AI workspace built with **Tauri + React + TypeScript**, powered by **OpenRouter**.

It is designed for daily, serious use: fast chat, reliable memory, real tool execution, and low-noise UX.

## Why We Built It

Most AI chat apps fail real daily workflows because they are:

1. Stateless: every chat forgets your long-term context.
2. Opaque: tool failures are hidden behind vague messages.
3. Cloud-heavy: data leaves your machine by default.
4. Noisy: too many toggles, too little signal.

Jessie addresses these pain points with a practical local-first architecture and strict reliability boundaries.

## Core Product Advantages

1. Local-first persistence
   - Chats, settings, and memory are stored locally.
   - No remote telemetry pipeline is required.
2. Real tool execution
   - Tavily web search is executed for real (not prompt-faked).
   - MCP tools are executed against connected servers.
3. Reliability-first chat pipeline
   - Typed error categories.
   - Clear user-facing failure messages.
   - Non-critical subsystems (memory/title/persistence) do not crash the full response path.
4. Minimal UX with high signal
   - Focused settings model.
   - Low-friction defaults for daily work.

## Memory System (v2+) Logic

Jessie memory is intentionally conservative:

1. Retrieval
   - Ranked by pin, recency, keyword overlap, and weight.
   - Deduped before prompt injection.
2. Extraction
   - Extracted from conversation with strict semantic filtering.
   - Only durable memory is accepted: preference / identity / project context / standing instruction.
   - Temporary tasks, one-off requests, generic Q&A, and assistant-style outputs are rejected.
3. Conflict + dedupe
   - Near-duplicates are merged.
   - Newer stronger memories can supersede old variants.
4. English-normalized memory path
   - Memory context is unified in English.
   - If user input is Chinese, Jessie translates it to English before memory retrieval/injection path.
   - Long memories are compressed by LLM into concise durable English context and cached for token efficiency.

## Tooling: Web Search + MCP

### Tavily Web Search

1. Model emits tool call (`web_search`).
2. Jessie calls Tavily Search API.
3. Tool result is returned as tool message.
4. Model continues final generation.

If Tavily is unavailable, Jessie degrades clearly (no fabricated results).

### MCP (v1 host foundation)

Supported:

1. Local `stdio` MCP servers.
2. Remote HTTP MCP servers (Streamable HTTP + legacy SSE fallback).
3. Tool discovery + namespacing + execution.
4. MCP Apps rendering in chat bubble (when UI resource is provided).

Security for remote MCP:

1. HTTPS only.
2. Domain allowlist enforcement.
3. Per-server headers supported.

## Tech Stack

1. Tauri 2
2. React + TypeScript + Vite
3. Zustand
4. TailwindCSS
5. OpenRouter Chat Completions API
6. Tavily Search API

## Quick Start

```bash
npm install
npm run tauri:dev
```

## Build

```bash
npm run build
npm run tauri:build
```

## Required Config

Set keys in Settings:

1. OpenRouter API Key
2. Tavily API Key (for real-time search)

## Main Modules

1. `src/store/useChatStore.ts` — chat pipeline, streaming, tool loop, reliability boundaries
2. `src/store/useMemoryStore.ts` — memory import/extract/retrieve/injection/compression
3. `src/lib/memoryQuality.ts` — semantic gating for memory acceptance
4. `src/lib/openrouter.ts` — OpenRouter request layer
5. `src/lib/mcpHost.ts` + `src-tauri/src/mcp.rs` — MCP host runtime and dispatch
6. `src/components/settings/*` — settings UI

## Security Notes

1. Never commit real API keys.
2. Keep `.env*` and private exports out of version control.
3. Use `SECURITY.md` process for vulnerability reporting.

## License

MIT. See [LICENSE](./LICENSE).

</details>

<details>
<summary><strong>简体中文</strong></summary>

## Jessie 是什么

Jessie 是一个 **本地优先（local-first）** 的桌面 AI 工作应用，基于 **Tauri + React + TypeScript**，模型能力由 **OpenRouter** 提供。

它面向高频日常使用：流式对话、稳定记忆、真实工具调用、低噪音交互。

## 为什么做 Jessie

很多 AI 聊天产品在真实工作流里会暴露几个核心问题：

1. 无状态：每次对话都像第一次认识你。
2. 不透明：工具失败只给模糊报错，定位困难。
3. 云依赖重：默认把数据交给远端。
4. 噪音高：设置很多，但有效信息很少。

Jessie 的目标是用更务实的本地架构，把这些问题逐个解决。

## 产品优势

1. 本地优先存储
   - 聊天、设置、记忆均保存在本地。
   - 不依赖远程日志系统。
2. 工具是真调用，不是“提示词假联网”
   - Tavily 联网搜索是真 API 调用。
   - MCP 工具是真实连接 server 执行。
3. 可靠性优先的对话主链路
   - 统一错误分类。
   - 用户可读、可操作的报错。
   - 非关键子系统失败不会拖垮主回复。
4. 高信噪比 UI
   - 设置结构克制、可理解。
   - 默认行为适配高频使用。

## 记忆系统（v2+）逻辑

Jessie 的记忆策略是“宁缺毋滥”：

1. 召回
   - 按置顶、时效、关键词重合、权重综合排序。
   - 注入前去重。
2. 提取
   - 对话后自动提取候选记忆，并经过严格语义筛选。
   - 仅接受长期有效信息：偏好 / 身份事实 / 项目上下文 / 长期指令。
   - 拒绝临时任务、一次性请求、泛化问答、助手口吻文本。
3. 冲突与去重
   - 近似记忆合并。
   - 新的强事实可覆盖旧弱版本。
4. 英文统一与省 token
   - 记忆上下文统一为英文。
   - 用户输入中文时，会先转换为英文再进入记忆检索/注入链路。
   - 超长记忆会先由 LLM 精简为英文短版并缓存，降低 token 成本。

## 工具能力：联网搜索 + MCP

### Tavily 联网搜索

1. 模型触发 `web_search` 工具调用。
2. Jessie 调用 Tavily API。
3. 结果以 tool message 回传模型。
4. 模型继续生成最终回答。

若 Tavily 不可用，Jessie 会明确降级，不会伪造联网结果。

### MCP（v1 主机基础）

已支持：

1. 本地 `stdio` MCP server。
2. 远程 HTTP MCP server（优先 Streamable HTTP，自动回退 legacy SSE）。
3. 工具发现、命名规避冲突、执行回传。
4. MCP Apps 在聊天气泡内嵌展示（server 提供 UI 资源时）。

远程 MCP 安全策略：

1. 仅允许 HTTPS。
2. 域名白名单校验。
3. 支持每个 server 独立 Header。

## 技术栈

1. Tauri 2
2. React + TypeScript + Vite
3. Zustand
4. TailwindCSS
5. OpenRouter Chat Completions API
6. Tavily Search API

## 快速开始

```bash
npm install
npm run tauri:dev
```

## 构建

```bash
npm run build
npm run tauri:build
```

## 必要配置

请在设置中配置：

1. OpenRouter API Key
2. Tavily API Key（用于联网搜索）

## 关键模块

1. `src/store/useChatStore.ts`：对话主链路、流式输出、工具循环、可靠性控制
2. `src/store/useMemoryStore.ts`：记忆导入/提取/召回/注入/压缩
3. `src/lib/memoryQuality.ts`：记忆筛选与语义门控
4. `src/lib/openrouter.ts`：OpenRouter 请求层
5. `src/lib/mcpHost.ts` + `src-tauri/src/mcp.rs`：MCP 运行时与调度
6. `src/components/settings/*`：设置页面

## 安全说明

1. 不要提交真实 API Key。
2. `.env*` 和私有导出数据不要入库。
3. 安全问题请按 `SECURITY.md` 流程反馈。

## License

MIT，详见 [LICENSE](./LICENSE)。

</details>

