import type { MessageRole } from "../types/chat";

export const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 45000;

export interface ChatCompletionTextPart {
  type: "text";
  text: string;
}

export interface ChatCompletionImagePart {
  type: "image_url";
  image_url: {
    url: string;
  };
}

export type ChatCompletionContent = string | Array<ChatCompletionTextPart | ChatCompletionImagePart>;

export interface ChatCompletionRequestMessage {
  role: MessageRole;
  content: ChatCompletionContent;
}

interface StreamChatCompletionOptions {
  apiKey: string;
  model: string;
  messages: ChatCompletionRequestMessage[];
  onToken: (token: string) => void;
  temperature?: number;
  maxTokens?: number;
  tools?: OpenRouterToolDefinition[];
  toolChoice?: OpenRouterToolChoice;
  reasoningEnabled?: boolean;
  signal?: AbortSignal;
}

interface CreateChatCompletionOptions {
  apiKey: string;
  model: string;
  messages: ChatCompletionRequestMessage[];
  temperature?: number;
  maxTokens?: number;
  tools?: OpenRouterToolDefinition[];
  toolChoice?: OpenRouterToolChoice;
  reasoningEnabled?: boolean;
  signal?: AbortSignal;
}

export interface OpenRouterToolDefinition {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
}

export type OpenRouterToolChoice = "none" | "auto" | "required";

export interface OpenRouterToolCall {
  id?: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: ChatCompletionContent;
      tool_calls?: OpenRouterToolCall[];
    };
  }>;
}

type OpenRouterErrorCode =
  | "NETWORK"
  | "INVALID_API_KEY"
  | "RATE_LIMIT"
  | "TIMEOUT"
  | "EMPTY_RESPONSE"
  | "UNKNOWN";

export class OpenRouterError extends Error {
  code: OpenRouterErrorCode;
  userMessage: string;

  constructor(code: OpenRouterErrorCode, userMessage: string, details?: string) {
    super(details ?? userMessage);
    this.name = "OpenRouterError";
    this.code = code;
    this.userMessage = userMessage;
  }
}

export const modelSupportsImageInput = (model: string) => {
  const normalized = model.toLowerCase();
  return ["gpt-4o", "vision", "vl", "gemini", "claude-3", "llava"].some((token) =>
    normalized.includes(token)
  );
};

export const modelLikelySupportsToolCalling = (model: string) => {
  const normalized = model.toLowerCase();
  return [
    "gpt",
    "claude",
    "gemini",
    "qwen",
    "llama",
    "mistral",
    "deepseek",
    "command-r",
    "mixtral",
  ].some((token) => normalized.includes(token));
};

export const modelLikelySupportsReasoning = (model: string) => {
  const normalized = model.toLowerCase();
  return ["o1", "o3", "o4", "gpt-5", "reason", "r1", "qwq", "sonnet", "opus"].some((token) =>
    normalized.includes(token)
  );
};

const toPlainText = (content: ChatCompletionContent | undefined) => {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((part) => {
      if (part.type === "text") {
        return part.text;
      }
      return "";
    })
    .join("\n")
    .trim();
};

const parseErrorMessage = async (response: Response) => {
  try {
    const data = await response.json();
    if (data?.error?.message) {
      return data.error.message as string;
    }
    if (data?.message) {
      return data.message as string;
    }
  } catch {
    // no-op
  }

  return `Request failed with status ${response.status}`;
};

const mapStatusToError = (status: number, details: string) => {
  if (status === 401 || status === 403) {
    return new OpenRouterError("INVALID_API_KEY", details || "Invalid API key", details);
  }

  if (status === 429) {
    return new OpenRouterError("RATE_LIMIT", details || "Rate limit reached", details);
  }

  return new OpenRouterError("UNKNOWN", details || "Request failed", details);
};

const fetchWithTimeout = async (input: RequestInfo | URL, init: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  const signals = [init.signal, controller.signal].filter(Boolean) as AbortSignal[];
  const mergedSignal =
    signals.length > 1 && "any" in AbortSignal
      ? AbortSignal.any(signals)
      : (signals[0] ?? undefined);

  try {
    return await fetch(input, {
      ...init,
      signal: mergedSignal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new OpenRouterError("TIMEOUT", "Request timed out", error.message);
    }

    if (error instanceof TypeError) {
      throw new OpenRouterError("NETWORK", "Network error", error.message);
    }

    throw new OpenRouterError("UNKNOWN", "Request failed", error instanceof Error ? error.message : undefined);
  } finally {
    window.clearTimeout(timeout);
  }
};

const parseEventLine = (line: string, onToken: (token: string) => void) => {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.startsWith("data:")) {
    return false;
  }

  const payload = trimmed.slice(5).trim();
  if (payload === "[DONE]") {
    return true;
  }

  try {
    const parsed = JSON.parse(payload);
    const token = parsed?.choices?.[0]?.delta?.content;
    if (typeof token === "string" && token.length > 0) {
      onToken(token);
    }
  } catch {
    // Ignore malformed chunks.
  }

  return false;
};

const buildRequestBody = ({
  model,
  messages,
  stream,
  temperature,
  maxTokens,
  tools,
  toolChoice,
  reasoningEnabled,
}: {
  model: string;
  messages: ChatCompletionRequestMessage[];
  stream: boolean;
  temperature?: number;
  maxTokens?: number;
  tools?: OpenRouterToolDefinition[];
  toolChoice?: OpenRouterToolChoice;
  reasoningEnabled?: boolean;
}) => ({
  model,
  messages,
  stream,
  ...(typeof temperature === "number" ? { temperature } : {}),
  ...(typeof maxTokens === "number" ? { max_tokens: maxTokens } : {}),
  ...(Array.isArray(tools) && tools.length > 0 ? { tools } : {}),
  ...(toolChoice ? { tool_choice: toolChoice } : {}),
  ...(reasoningEnabled ? { reasoning: { enabled: true } } : {}),
});

export const streamChatCompletion = async ({
  apiKey,
  model,
  messages,
  onToken,
  temperature,
  maxTokens,
  tools,
  toolChoice,
  reasoningEnabled,
  signal,
}: StreamChatCompletionOptions) => {
  const response = await fetchWithTimeout(OPENROUTER_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://localhost",
      "X-Title": "Jessie Desktop",
    },
    body: JSON.stringify(buildRequestBody({
      model,
      messages,
      stream: true,
      temperature,
      maxTokens,
      tools,
      toolChoice,
      reasoningEnabled,
    })),
    signal,
  });

  if (!response.ok) {
    const message = await parseErrorMessage(response);
    throw mapStatusToError(response.status, message);
  }

  if (!response.body) {
    throw new OpenRouterError(
      "EMPTY_RESPONSE",
      "No response received from model. Please try again.",
      "No response stream"
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let emittedTokenCount = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const before = emittedTokenCount;
      const isDone = parseEventLine(line, onToken);
      if (!isDone) {
        try {
          const parsed = JSON.parse(line.trim().slice(5).trim());
          if (typeof parsed?.choices?.[0]?.delta?.content === "string") {
            emittedTokenCount += 1;
          }
        } catch {
          // no-op
        }
      }
      if (isDone) {
        if (before === 0 && emittedTokenCount === 0) {
          throw new OpenRouterError(
            "EMPTY_RESPONSE",
            "No response received from model. Please try again."
          );
        }
        return;
      }
    }
  }

  if (buffer.length > 0) {
    parseEventLine(buffer, onToken);
  }

  if (emittedTokenCount === 0) {
    throw new OpenRouterError("EMPTY_RESPONSE", "No response received from model. Please try again.");
  }
};

export const createChatCompletionText = async ({
  apiKey,
  model,
  messages,
  temperature = 0,
  maxTokens,
  tools,
  toolChoice,
  reasoningEnabled,
  signal,
}: CreateChatCompletionOptions) => {
  const response = await fetchWithTimeout(OPENROUTER_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://localhost",
      "X-Title": "Jessie Desktop",
    },
    body: JSON.stringify(buildRequestBody({
      model,
      messages,
      stream: false,
      temperature,
      maxTokens,
      tools,
      toolChoice,
      reasoningEnabled,
    })),
    signal,
  });

  if (!response.ok) {
    const message = await parseErrorMessage(response);
    throw mapStatusToError(response.status, message);
  }

  const data = (await response.json()) as ChatCompletionResponse;
  const content = data.choices?.[0]?.message?.content;
  const text = toPlainText(content);
  if (!text) {
    throw new OpenRouterError("EMPTY_RESPONSE", "No response received from model. Please try again.");
  }

  return text;
};

export const createChatCompletionWithTools = async ({
  apiKey,
  model,
  messages,
  tools,
  toolChoice = "auto",
  temperature = 0,
  maxTokens,
  reasoningEnabled,
  signal,
}: CreateChatCompletionOptions & { tools: OpenRouterToolDefinition[] }) => {
  const response = await fetchWithTimeout(OPENROUTER_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://localhost",
      "X-Title": "Jessie Desktop",
    },
    body: JSON.stringify(buildRequestBody({
      model,
      messages,
      stream: false,
      temperature,
      maxTokens,
      tools,
      toolChoice,
      reasoningEnabled,
    })),
    signal,
  });

  if (!response.ok) {
    const message = await parseErrorMessage(response);
    throw mapStatusToError(response.status, message);
  }

  const data = (await response.json()) as ChatCompletionResponse;
  const message = data.choices?.[0]?.message;
  const text = toPlainText(message?.content);
  const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];

  if (!text && toolCalls.length === 0) {
    throw new OpenRouterError("EMPTY_RESPONSE", "No response received from model. Please try again.");
  }

  return {
    text,
    toolCalls,
  };
};
