import { createAppError, type AppError } from "./appError";

export const safeSetLocalStorage = (key: string, value: string): AppError | null => {
  try {
    window.localStorage.setItem(key, value);
    return null;
  } catch (error) {
    return createAppError({
      code: "PERSISTENCE_FAILED",
      source: "persistence",
      message: error instanceof Error ? error.message : "localStorage setItem failed",
      retryable: true,
      userMessage: "本地保存失败，但当前回复仍可查看。",
      debugContext: {
        key,
      },
    });
  }
};
