import { describe, expect, it } from "vitest";
import { createAppError, mapOpenRouterError, mapUnknownError } from "./appError";
import { safeSetLocalStorage } from "./localPersistence";
import { OpenRouterError } from "./openrouter";

describe("reliability error mapping", () => {
  it("handles missing API key", () => {
    const error = createAppError({
      code: "MISSING_API_KEY",
      source: "config",
      message: "OpenRouter API key is missing.",
      retryable: false,
      userMessage: "请先在设置里填写 OpenRouter API Key。",
    });
    expect(error.code).toBe("MISSING_API_KEY");
    expect(error.retryable).toBe(false);
  });

  it("maps OpenRouter non-200 style invalid key error", () => {
    const mapped = mapOpenRouterError(new OpenRouterError("INVALID_API_KEY", "invalid key"));
    expect(mapped.code).toBe("OPENROUTER_INVALID_API_KEY");
    expect(mapped.source).toBe("openrouter");
  });

  it("maps malformed model response", () => {
    const mapped = mapUnknownError(new Error("bad shape"), {
      code: "MODEL_MALFORMED_RESPONSE",
      source: "openrouter",
      retryable: true,
      userMessage: "模型返回了无法解析的数据，请重试。",
    });
    expect(mapped.code).toBe("MODEL_MALFORMED_RESPONSE");
  });

  it("maps tool call parse failure", () => {
    const mapped = mapUnknownError(new Error("cannot parse tool args"), {
      code: "TOOL_CALL_PARSE_FAILED",
      source: "tool",
      retryable: true,
      userMessage: "Web search 请求解析失败，请重试。",
    });
    expect(mapped.code).toBe("TOOL_CALL_PARSE_FAILED");
  });

  it("maps Tavily failure", () => {
    const mapped = mapUnknownError(new Error("tavily down"), {
      code: "TOOL_EXECUTION_FAILED",
      source: "tool",
      retryable: true,
      userMessage: "Web search unavailable：联网搜索失败，请稍后重试。",
    });
    expect(mapped.code).toBe("TOOL_EXECUTION_FAILED");
  });

  it("maps stream empty result", () => {
    const mapped = mapOpenRouterError(new OpenRouterError("EMPTY_RESPONSE", "empty"));
    expect(mapped.code).toBe("MODEL_EMPTY_RESULT");
  });

  it("maps memory extraction failure", () => {
    const mapped = mapUnknownError(new Error("memory extract failed"), {
      code: "MEMORY_EXTRACTION_FAILED",
      source: "memory",
      retryable: true,
      userMessage: "记忆提取失败，本次回复不受影响。",
    });
    expect(mapped.code).toBe("MEMORY_EXTRACTION_FAILED");
  });
});

describe("local persistence safety", () => {
  it("returns typed error when localStorage write fails", () => {
    const originalWindow = globalThis.window;
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        setItem: () => {
          throw new Error("quota exceeded");
        },
      },
    };

    const error = safeSetLocalStorage("x", "y");
    expect(error?.code).toBe("PERSISTENCE_FAILED");

    (globalThis as { window?: unknown }).window = originalWindow;
  });
});
