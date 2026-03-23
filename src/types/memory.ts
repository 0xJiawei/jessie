export interface ProfileMemory {
  preferences: string;
}

export type MemoryType = "preference" | "fact" | "context";

export interface MemoryItem {
  id: string;
  content: string;
  compressedContent?: string;
  type: MemoryType;
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
  weight?: number;
  source?: "auto" | "imported" | "manual";
}
