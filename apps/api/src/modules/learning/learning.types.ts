export type LearningType = 'knowledge' | 'persona' | 'customer_memory' | 'playbook';
export type LearningStatus = 'pending' | 'approved' | 'rejected';

/** Proposed content shapes, by proposal type, stored in `payload` JSON. */
export interface KnowledgePayload {
  content: string;
  category?: string;
  productName?: string;
}

export interface PersonaPayload {
  name: string;
  soulMd: string;
  tone?: string;
  style?: string;
  rules?: string;
  forbiddenWords?: string[];
}

export interface CustomerMemoryPayload {
  /** A short, durable fact list to append to the customer's notes. */
  facts: string[];
}

/** Result of a mining run: how many proposals were produced per type. */
export interface MineResult {
  botId: string;
  knowledge: number;
  persona: number;
  customerMemory: number;
  playbook: number;
  skippedDuplicates: number;
}
