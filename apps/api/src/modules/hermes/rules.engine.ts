import { HermesDecision, RiskLevel } from '@hermes/database';

export interface RuleHit {
  decision: HermesDecision;
  riskLevel: RiskLevel;
  reason: string;
}

interface Rule {
  pattern: RegExp;
  decision: HermesDecision;
  riskLevel: RiskLevel;
  reason: string;
}

// Deterministic safety net so critical cases never depend on the LLM alone
// (PRD section 16). Most-restrictive decision wins when several match.
const RULES: Rule[] = [
  {
    pattern: /\b(lapor polisi|penipu|penipuan|tuntut|pengacara|hukum|viralkan|sebar)\b/i,
    decision: HermesDecision.pause_ai,
    riskLevel: RiskLevel.critical,
    reason: 'Kata kunci sensitif (legal/ancaman) terdeteksi',
  },
  {
    pattern: /\b(refund|pengembalian dana|uang kembali|batal(kan)?)\b/i,
    decision: HermesDecision.takeover_required,
    riskLevel: RiskLevel.high,
    reason: 'Pembahasan refund/pembatalan — perlu admin',
  },
  {
    pattern: /\b(komplain|kecewa|marah|parah|jelek|nipu|bohong)\b/i,
    decision: HermesDecision.draft,
    riskLevel: RiskLevel.medium,
    reason: 'Indikasi komplain/emosi negatif',
  },
];

const RANK: Record<HermesDecision, number> = {
  [HermesDecision.approve]: 0,
  [HermesDecision.draft]: 1,
  [HermesDecision.takeover_required]: 2,
  [HermesDecision.block]: 3,
  [HermesDecision.pause_ai]: 4,
};

const RISK_RANK: Record<RiskLevel, number> = {
  [RiskLevel.low]: 0,
  [RiskLevel.medium]: 1,
  [RiskLevel.high]: 2,
  [RiskLevel.critical]: 3,
};

export function evaluateRules(text: string): RuleHit | null {
  let hit: RuleHit | null = null;
  for (const rule of RULES) {
    if (rule.pattern.test(text)) {
      if (!hit || RANK[rule.decision] > RANK[hit.decision]) {
        hit = {
          decision: rule.decision,
          riskLevel: rule.riskLevel,
          reason: rule.reason,
        };
      }
    }
  }
  return hit;
}

/** Apply PRD 16 confidence gates on top of an LLM decision. */
export function decisionFromConfidence(confidence: number): HermesDecision {
  if (confidence < 50) return HermesDecision.block;
  if (confidence < 70) return HermesDecision.draft;
  if (confidence < 90) return HermesDecision.draft; // 70-89: supervise → draft
  return HermesDecision.approve;
}

export function mostRestrictive(
  a: HermesDecision,
  b: HermesDecision,
): HermesDecision {
  return RANK[a] >= RANK[b] ? a : b;
}

export function highestRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  return RISK_RANK[a] >= RISK_RANK[b] ? a : b;
}
