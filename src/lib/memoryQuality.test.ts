import { describe, expect, it } from "vitest";
import { classifyMemoryCandidate, shouldPersistMemoryDecision } from "./memoryQuality";

describe("memoryQuality acceptance", () => {
  it("accepts stable writing preference", () => {
    const decision = classifyMemoryCandidate({ content: "I prefer concise answers with bullet points." });
    expect(decision.category).toBe("preference");
    expect(shouldPersistMemoryDecision(decision)).toBe(true);
  });

  it("accepts stable identity fact", () => {
    const decision = classifyMemoryCandidate({ content: "I am a crypto investor." });
    expect(decision.category).toBe("identity");
    expect(shouldPersistMemoryDecision(decision)).toBe(true);
  });

  it("accepts long-term Jessie project context", () => {
    const decision = classifyMemoryCandidate({
      content: "Jessie is a local-first desktop AI app using Tauri + React + TypeScript.",
    });
    expect(decision.category).toBe("project");
    expect(shouldPersistMemoryDecision(decision)).toBe(true);
  });

  it("accepts standing instruction", () => {
    const decision = classifyMemoryCandidate({
      content: "Always focus on correctness and avoid over-engineering.",
    });
    expect(decision.category).toBe("standing_instruction");
    expect(shouldPersistMemoryDecision(decision)).toBe(true);
  });
});

describe("memoryQuality rejection", () => {
  it("rejects one-off question", () => {
    const decision = classifyMemoryCandidate({ content: "How should I fix this issue?" });
    expect(decision.category).toBe("reject");
    expect(shouldPersistMemoryDecision(decision)).toBe(false);
  });

  it("rejects temporary task", () => {
    const decision = classifyMemoryCandidate({ content: "Please summarize this PR today." });
    expect(decision.category).toBe("reject");
    expect(shouldPersistMemoryDecision(decision)).toBe(false);
  });

  it("rejects assistant-style advice", () => {
    const decision = classifyMemoryCandidate({ content: "As an AI, here is a step-by-step plan." });
    expect(decision.category).toBe("reject");
    expect(shouldPersistMemoryDecision(decision)).toBe(false);
  });

  it("rejects generic factual discussion", () => {
    const decision = classifyMemoryCandidate({ content: "The capital of France is Paris." });
    expect(decision.category).toBe("reject");
    expect(shouldPersistMemoryDecision(decision)).toBe(false);
  });

  it("rejects time-sensitive plan", () => {
    const decision = classifyMemoryCandidate({ content: "Tomorrow I will review this task." });
    expect(decision.category).toBe("reject");
    expect(shouldPersistMemoryDecision(decision)).toBe(false);
  });

  it("rejects raw request without durable context", () => {
    const decision = classifyMemoryCandidate({ content: "Can you rewrite this function?" });
    expect(decision.category).toBe("reject");
    expect(shouldPersistMemoryDecision(decision)).toBe(false);
  });
});
