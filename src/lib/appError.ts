import { OpenRouterError } from "./openrouter";

export type AppErrorSource =
  | "config"
  | "openrouter"
  | "tool"
  | "stream"
  | "memory"
  | "persistence"
  | "unknown";

export type AppErrorCode =
  | "MISSING_API_KEY"
  | "MISSING_MODEL"
  | "INVALID_MODEL"
  | "IMAGE_INPUT_DISABLED"
  | "MODEL_NO_IMAGE_SUPPORT"
  | "OPENROUTER_INVALID_API_KEY"
  | "OPENROUTER_RATE_LIMIT"
  | "OPENROUTER_TIMEOUT"
  | "OPENROUTER_NETWORK"
  | "MODEL_EMPTY_RESULT"
  | "MODEL_MALFORMED_RESPONSE"
  | "TOOL_CALL_PARSE_FAILED"
  | "TOOL_EXECUTION_FAILED"
  | "MISSING_TAVILY_API_KEY"
  | "STREAM_INTERRUPTED"
  | "MEMORY_EXTRACTION_FAILED"
  | "PERSISTENCE_FAILED"
  | "UNKNOWN";

export interface AppError {
  code: AppErrorCode;
  source: AppErrorSource;
  message: string;
  retryable: boolean;
  userMessage: string;
  debugContext?: Record<string, unknown>;
}

export const createAppError = (error: AppError): AppError => error;

export const isAppError = (value: unknown): value is AppError =>
  Boolean(
    value &&
      typeof value === "object" &&
      "code" in value &&
      "source" in value &&
      "message" in value &&
      "retryable" in value &&
      "userMessage" in value
  );

export const mapOpenRouterError = (error: OpenRouterError, context?: Record<string, unknown>): AppError => {
  if (error.code === "INVALID_API_KEY") {
    return createAppError({
      code: "OPENROUTER_INVALID_API_KEY",
      source: "openrouter",
      message: error.message,
      retryable: false,
      userMessage: "OpenRouter API Key 无效，请在设置中检查后重试。",
      debugContext: context,
    });
  }

  if (error.code === "RATE_LIMIT") {
    return createAppError({
      code: "OPENROUTER_RATE_LIMIT",
      source: "openrouter",
      message: error.message,
      retryable: true,
      userMessage: "模型请求达到频率限制，请稍后重试。",
      debugContext: context,
    });
  }

  if (error.code === "TIMEOUT") {
    return createAppError({
      code: "OPENROUTER_TIMEOUT",
      source: "stream",
      message: error.message,
      retryable: true,
      userMessage: "请求超时，请重试。",
      debugContext: context,
    });
  }

  if (error.code === "NETWORK") {
    return createAppError({
      code: "OPENROUTER_NETWORK",
      source: "openrouter",
      message: error.message,
      retryable: true,
      userMessage: "网络请求失败，请检查网络连接后重试。",
      debugContext: context,
    });
  }

  if (error.code === "EMPTY_RESPONSE") {
    return createAppError({
      code: "MODEL_EMPTY_RESULT",
      source: "stream",
      message: error.message,
      retryable: true,
      userMessage:
        "模型返回了空结果，请重试。如果持续出现，请检查当前模型或 API 设置。",
      debugContext: context,
    });
  }

  return createAppError({
    code: "UNKNOWN",
    source: "openrouter",
    message: error.message,
    retryable: true,
    userMessage: "模型请求失败，请稍后重试。",
    debugContext: context,
  });
};

export const mapUnknownError = (
  error: unknown,
  fallback: Omit<AppError, "message"> & { message?: string }
): AppError =>
  createAppError({
    ...fallback,
    message: error instanceof Error ? error.message : fallback.message || "Unknown error",
  });
