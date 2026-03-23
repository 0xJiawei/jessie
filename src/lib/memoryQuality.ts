import type { MemoryType } from "../types/memory";

export type MemoryCandidateCategory =
  | "preference"
  | "identity"
  | "project"
  | "standing_instruction"
  | "reject";

export interface MemoryCandidateDecision {
  category: MemoryCandidateCategory;
  confidence: number;
  summary: string;
  rationale: string;
}

export interface MemoryCandidateInput {
  content: string;
}

export const MEMORY_ACCEPT_CONFIDENCE = 0.75;

const normalizeSpaces = (text: string) => text.replace(/\s+/g, " ").trim();
const lower = (text: string) => normalizeSpaces(text).toLowerCase();

const USER_QUESTION_PATTERN =
  /[?？]|\b(can you|could you|would you|how|what|why|when|where|who)\b|请问|怎么|如何|为什么|是什么/i;
const TEMPORAL_PATTERN =
  /\b(today|tomorrow|tonight|this week|next week|for now|temporary|one-time)\b|今天|明天|这周|下周|临时|一次性/i;
const ASSISTANT_STYLE_PATTERN =
  /\b(as an ai|here is|here's|i suggest|you should)\b|作为ai|建议|你可以|步骤/i;
const GENERIC_FACT_PATTERN = /\b(earth|history|capital|physics|math|wikipedia)\b|百科|首都|历史|物理|数学/i;

const PREFERENCE_PATTERN =
  /\b(i prefer|i like|i usually|i want responses|prefer concise|prefer detailed|concise answers|detailed answers)\b|我(偏好|更喜欢|习惯).*(回答|风格|格式)|希望回答(简洁|详细)/i;
const IDENTITY_PATTERN =
  /\b(i am|i'm|my role is|i work as|my background)\b|我是|我从事|我的职业|我的背景/i;
const PROJECT_PATTERN =
  /\b(project|codebase|architecture|stack|local-first|tauri|react|typescript|openrouter|jessie)\b|项目|代码库|架构|技术栈|本地优先|tauri|react|typescript|openrouter|jessie/i;
const STANDING_INSTRUCTION_PATTERN =
  /\b(always|never|avoid|focus on|do not|must|should prioritize|respond in|answer in|use chinese|use english)\b|总是|不要|避免|重点|优先|必须|请用中文|请用英文|请保持|请始终/i;

const removeConversationalPrefix = (text: string) =>
  normalizeSpaces(
    text
      .replace(/^user:\s*/i, "")
      .replace(/^i think\s*/i, "")
      .replace(/^please\s*/i, "")
  );

const removeTemporalWording = (text: string) =>
  normalizeSpaces(
    text
      .replace(/\b(today|tomorrow|tonight|this week|next week)\b/gi, "")
      .replace(/今天|明天|今晚|这周|下周/g, "")
  );

const normalizeAsProfileMemory = (category: MemoryCandidateCategory, text: string) => {
  const cleaned = removeTemporalWording(removeConversationalPrefix(text)).replace(/[.。]+$/, "");
  const compact = normalizeSpaces(cleaned);

  if (!compact) {
    return "";
  }

  if (category === "preference") {
    if (/^user prefers\b/i.test(compact)) return compact;
    return `User prefers ${compact}`;
  }

  if (category === "identity") {
    if (/^user is\b/i.test(compact)) return compact;
    if (/^i am\b/i.test(compact)) return compact.replace(/^i am\b/i, "User is");
    if (/^i'm\b/i.test(compact)) return compact.replace(/^i'm\b/i, "User is");
    return `User is ${compact}`;
  }

  if (category === "project") {
    if (/^project context:/i.test(compact)) return compact;
    return `Project context: ${compact}`;
  }

  if (category === "standing_instruction") {
    if (/^standing instruction:/i.test(compact)) return compact;
    return `Standing instruction: ${compact}`;
  }

  return compact;
};

export const classifyMemoryCandidate = (input: MemoryCandidateInput): MemoryCandidateDecision => {
  const raw = normalizeSpaces(input.content);
  const normalized = lower(raw);

  if (!raw) {
    return {
      category: "reject",
      confidence: 0,
      summary: "",
      rationale: "empty content",
    };
  }

  if (raw.length > 240) {
    return {
      category: "reject",
      confidence: 0.1,
      summary: "",
      rationale: "too long and likely conversational",
    };
  }

  if (USER_QUESTION_PATTERN.test(raw)) {
    return {
      category: "reject",
      confidence: 0.05,
      summary: "",
      rationale: "question or request, not durable memory",
    };
  }

  if (TEMPORAL_PATTERN.test(raw)) {
    return {
      category: "reject",
      confidence: 0.1,
      summary: "",
      rationale: "time-sensitive content",
    };
  }

  if (ASSISTANT_STYLE_PATTERN.test(raw)) {
    return {
      category: "reject",
      confidence: 0.05,
      summary: "",
      rationale: "assistant-style output",
    };
  }

  if (GENERIC_FACT_PATTERN.test(raw) && !normalized.includes("user")) {
    return {
      category: "reject",
      confidence: 0.1,
      summary: "",
      rationale: "generic factual content not tied to user",
    };
  }

  if (PREFERENCE_PATTERN.test(raw)) {
    return {
      category: "preference",
      confidence: 0.9,
      summary: normalizeAsProfileMemory("preference", raw),
      rationale: "explicit stable preference",
    };
  }

  if (IDENTITY_PATTERN.test(raw)) {
    return {
      category: "identity",
      confidence: 0.88,
      summary: normalizeAsProfileMemory("identity", raw),
      rationale: "explicit identity/role fact",
    };
  }

  if (STANDING_INSTRUCTION_PATTERN.test(raw) && !USER_QUESTION_PATTERN.test(raw)) {
    return {
      category: "standing_instruction",
      confidence: 0.84,
      summary: normalizeAsProfileMemory("standing_instruction", raw),
      rationale: "durable standing instruction",
    };
  }

  if (PROJECT_PATTERN.test(raw) && /\b(project|jessie|app|codebase)\b|项目|jessie|应用|代码库/i.test(raw)) {
    return {
      category: "project",
      confidence: 0.8,
      summary: normalizeAsProfileMemory("project", raw),
      rationale: "long-term project context",
    };
  }

  return {
    category: "reject",
    confidence: 0.2,
    summary: "",
    rationale: "not clearly durable",
  };
};

export const shouldPersistMemoryDecision = (decision: MemoryCandidateDecision) =>
  decision.category !== "reject" &&
  decision.confidence >= MEMORY_ACCEPT_CONFIDENCE &&
  decision.summary.trim().length > 0;

export const categoryToMemoryType = (category: MemoryCandidateCategory): MemoryType => {
  if (category === "preference" || category === "standing_instruction") {
    return "preference";
  }
  if (category === "identity") {
    return "fact";
  }
  return "context";
};

export const isSupersedingMemory = (existingContent: string, incomingContent: string) => {
  const existing = lower(existingContent);
  const incoming = lower(incomingContent);

  if (existing.startsWith("project context:") && incoming.startsWith("project context:")) {
    return true;
  }

  if (existing.startsWith("standing instruction:") && incoming.startsWith("standing instruction:")) {
    return true;
  }

  if (existing.startsWith("user prefers") && incoming.startsWith("user prefers")) {
    return true;
  }

  return false;
};
