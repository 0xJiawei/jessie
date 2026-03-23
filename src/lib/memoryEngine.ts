import type { MemoryItem, MemoryType } from "../types/memory";

const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();

const tokenize = (value: string) =>
  normalize(value)
    .split(/[^a-z0-9\u4e00-\u9fa5]+/)
    .filter((token) => token.length >= 2);

const dedupeMemories = (memories: MemoryItem[]) => {
  const seen = new Set<string>();
  const output: MemoryItem[] = [];

  for (const memory of memories) {
    const key = normalize(memory.compressedContent || memory.content);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(memory);
  }

  return output;
};

const getRecencyScore = (updatedAt: number) => {
  const ageHours = (Date.now() - updatedAt) / (1000 * 60 * 60);
  if (ageHours <= 12) return 3;
  if (ageHours <= 48) return 2;
  if (ageHours <= 168) return 1;
  return 0;
};

const getKeywordScore = (inputTokens: Set<string>, content: string) => {
  if (inputTokens.size === 0) {
    return 0;
  }

  let score = 0;
  const lower = normalize(content);
  inputTokens.forEach((token) => {
    if (lower.includes(token)) {
      score += 1;
    }
  });
  return score;
};

export function retrieveRelevantMemory(input: string, memories: MemoryItem[]) {
  const cleanInput = input.trim();
  const inputTokens = new Set(tokenize(cleanInput));
  const unique = dedupeMemories(memories);

  const ranked = unique
    .map((memory) => {
      const pinnedScore = memory.pinned ? 100 : 0;
      const recencyScore = getRecencyScore(memory.updatedAt || memory.createdAt);
      const keywordScore = getKeywordScore(inputTokens, memory.compressedContent || memory.content);
      const weightScore = memory.weight ?? 0;

      return {
        memory,
        score: pinnedScore + recencyScore + keywordScore + weightScore,
        pinnedScore,
        recencyScore,
        keywordScore,
      };
    })
    .sort((a, b) => {
      if (b.pinnedScore !== a.pinnedScore) return b.pinnedScore - a.pinnedScore;
      if (b.recencyScore !== a.recencyScore) return b.recencyScore - a.recencyScore;
      if (b.keywordScore !== a.keywordScore) return b.keywordScore - a.keywordScore;
      return b.score - a.score;
    })
    .slice(0, 5)
    .map((entry) => entry.memory);

  return ranked;
}

const typeLabel: Record<MemoryType, string> = {
  preference: "User preference",
  fact: "User fact",
  context: "Context",
};

export function formatMemory(memories: MemoryItem[]) {
  if (memories.length === 0) {
    return "";
  }

  const lines = ["[Memory Context]"];
  let charBudget = 2600;

  for (const memory of memories) {
    const prefix = `- ${typeLabel[memory.type]}: `;
    const line = `${prefix}${memory.content}`;
    if (line.length > charBudget) {
      continue;
    }

    lines.push(line);
    charBudget -= line.length;
  }

  return lines.join("\n");
}

export function buildPrompt(memoryBlock: string, userInput: string) {
  const systemParts = [
    "You are Jessie, a helpful AI assistant.",
    memoryBlock,
    "Use the memory when relevant. Do not explicitly mention it unless necessary.",
    "Never expose raw memory entries unless the user explicitly asks for them.",
  ].filter((part) => part.trim().length > 0);

  return {
    systemPrompt: systemParts.join("\n\n"),
    userPrompt: userInput,
  };
}
