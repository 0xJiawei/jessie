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

## Capability Matrix: Jessie vs Generic Chat

| Capability | Jessie | Generic Chat |
| --- | --- | --- |
| Multi-model access | Unified model access through OpenRouter | Usually tied to one provider or a small fixed set |
| Task-level model routing | Pick fast/cheap/reasoning-strong models by task | One model strategy for most tasks |
| Real-time web retrieval | Tavily API is executed as a real tool call | Often prompt-level claims without verifiable tool execution |
| External tools | MCP host for local and remote MCP servers | Limited built-in integrations |
| Memory quality control | Strict extraction gate + dedupe + supersede rules | Often stores noisy conversational fragments |
| Reliability diagnostics | Typed errors with explicit user-facing messages | Vague failures like empty/unknown responses |
| Failure isolation | Tool/memory/title failures are isolated from core chat path | Subsystem failures can break full flow |
| Privacy boundary | Local-first storage by default | Frequently cloud-first by default |
| Maintainability | Explicit module boundaries for chat/tools/memory/runtime | Tighter coupling across features |

## What OpenRouter Unlocks

OpenRouter is not used here as a simple "model dropdown." In Jessie, it enables capability-level gains:

1. One integration point, many model families
   - Keep a single chat pipeline while switching providers/models as needed.
2. Task-level model choice inside one workflow
   - Draft quickly with lower-latency models, then switch to stronger reasoning models for critical steps.
3. Practical quality/speed/cost control
   - Make explicit tradeoffs per task instead of forcing one default for everything.
4. Lower provider lock-in risk
   - Jessie stays stable even when your preferred model mix changes over time.
5. Better fit with tools and memory
   - The same model layer works with Tavily, MCP tools, and memory injection without redesigning app flow.

## Real Workflow Scenarios

1. Research workflow
   - Ask a current-events question.
   - Model triggers `web_search`, Jessie calls Tavily, then returns tool output into generation.
   - If the tool fails, Jessie shows a clear, actionable error instead of pretending it searched.
2. Development workflow
   - Use a faster model for drafting and a stronger model for review/refinement.
   - Durable preferences (style, constraints) are remembered and reused across sessions.
   - Non-critical memory/title failures are isolated and do not block the main answer.
3. Visual collaboration workflow
   - Connect an MCP App server (for example, Excalidraw MCP).
   - Execute MCP tools and render app resources in chat when provided by the server.
   - If app resources are unavailable, Jessie degrades to text output cleanly.

## Non-Goals

Jessie intentionally avoids "fake capability" patterns:

1. No fabricated web search results.
2. No hidden tool failures behind generic success text.
3. No UI clutter from unnecessary toggles.
4. No overpromising beyond currently implemented architecture.

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

## 能力对比矩阵：Jessie vs 普通聊天

| 能力项 | Jessie | 普通聊天 |
| --- | --- | --- |
| 多模型接入 | 通过 OpenRouter 统一接入多模型生态 | 通常绑定单一厂商或少量固定模型 |
| 任务级模型选择 | 可按任务选择速度/成本/推理能力不同的模型 | 多数场景用同一模型策略 |
| 实时联网检索 | Tavily 作为真实工具调用执行 | 常见为提示词层“可联网”声明，缺乏可验证执行 |
| 外部工具扩展 | 作为 MCP Host 支持本地与远程 MCP server | 集成能力通常受限于内置工具 |
| 记忆质量控制 | 严格提取门控 + 去重 + 可覆盖更新 | 容易积累噪声对话片段 |
| 可诊断性 | Typed error + 明确用户提示 | 常见模糊报错（空返回/未知错误） |
| 故障隔离 | 工具/记忆/标题失败不拖垮主对话 | 子系统异常可能影响整条链路 |
| 隐私边界 | 默认本地优先存储 | 常见云优先 |
| 可维护性 | 聊天/工具/记忆/运行时边界清晰 | 功能耦合更高，演进成本更大 |

## OpenRouter 带来的能力

在 Jessie 里，OpenRouter 不是“多一个模型下拉框”，而是能力层面的放大器：

1. 单入口接入多模型生态
   - 保持同一套聊天主链路，同时按需切换不同模型与提供方。
2. 同一工作流内做任务级选型
   - 起草阶段可选低延迟模型，关键推理阶段切到更强模型。
3. 质量/速度/成本可实际权衡
   - 按任务显式做取舍，而不是被迫用一个默认模型覆盖所有场景。
4. 降低厂商锁定风险
   - 你的模型组合变化时，Jessie 的工作流仍可稳定延续。
5. 与工具链和记忆链路协同
   - 同一模型层可以无缝配合 Tavily、MCP 与记忆注入，无需重构流程。

## 真实工作流场景

1. 研究场景
   - 提问后，模型触发 `web_search`，Jessie 调用 Tavily 并把结果回注给模型。
   - 若工具失败，会给出可操作报错，不会伪装成“已联网”。
2. 开发场景
   - 用快模型完成草稿，再用强推理模型做审阅与收敛。
   - 长期偏好（表达风格、约束）可跨会话复用。
   - 即使记忆或标题子流程异常，也不会阻断主回复。
3. 可视化协作场景
   - 连接 MCP Apps server（例如 Excalidraw MCP）。
   - 工具执行后可在聊天中渲染 server 提供的 app 资源。
   - 资源不可用时优雅降级为文本，不中断对话。

## Non-Goals / 边界声明

Jessie 明确不做这些“伪能力”：

1. 不伪造联网搜索结果。
2. 不隐藏工具失败并假装成功。
3. 不用大量无效开关堆砌 UI。
4. 不对未实现能力做超前承诺。

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
