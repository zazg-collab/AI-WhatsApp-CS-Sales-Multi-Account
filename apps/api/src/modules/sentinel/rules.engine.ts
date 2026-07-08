import { SentinelDecision, RiskLevel } from '@hermes/database';
import { FALLBACK_PHRASE } from '../../i18n/bot-prompts';

const FALLBACK_MARKERS = Object.values(FALLBACK_PHRASE) as string[];

/** Greetings/smalltalk that need no KB match — never flag these as ungrounded. */
const SMALLTALK = /^(halo|hai|hi|hello|p(a|e)gi|siang|sore|malam|terima ?kasih|makasih|thanks|thank you|ok(e)?|sip|baik|good morning|good afternoon|good evening)\b/i;

export interface RuleHit {
  decision: SentinelDecision;
  riskLevel: RiskLevel;
  reason: string;
}

interface Rule {
  pattern: RegExp;
  decision: SentinelDecision;
  riskLevel: RiskLevel;
  reason: string;
}

// Deterministic safety net so critical cases never depend on the LLM alone
// (PRD section 16). Most-restrictive decision wins when several match.
const RULES: Rule[] = [
  {
    pattern: /\b(lapor polisi|penipu|penipuan|tuntut|pengacara|hukum|viralkan|sebar)\b/i,
    decision: SentinelDecision.pause_ai,
    riskLevel: RiskLevel.critical,
    reason: 'Kata kunci sensitif (legal/ancaman) terdeteksi',
  },
  {
    pattern: /\b(refund|pengembalian dana|uang kembali|batal(kan)?)\b/i,
    decision: SentinelDecision.takeover_required,
    riskLevel: RiskLevel.high,
    reason: 'Pembahasan refund/pembatalan — perlu admin',
  },
  {
    pattern: /\b(komplain|kecewa|marah|parah|jelek|nipu|bohong)\b/i,
    decision: SentinelDecision.draft,
    riskLevel: RiskLevel.medium,
    reason: 'Indikasi komplain/emosi negatif',
  },
];

const RANK: Record<SentinelDecision, number> = {
  [SentinelDecision.approve]: 0,
  [SentinelDecision.draft]: 1,
  [SentinelDecision.takeover_required]: 2,
  [SentinelDecision.block]: 3,
  [SentinelDecision.pause_ai]: 4,
};

const RISK_RANK: Record<RiskLevel, number> = {
  [RiskLevel.low]: 0,
  [RiskLevel.medium]: 1,
  [RiskLevel.high]: 2,
  [RiskLevel.critical]: 3,
};

/**
 * @param extraKeywords Comma-separated, admin-configurable keywords (Settings
 * → Hermes Supervisor) checked on top of the built-in rules above. A match
 * forces takeover_required + high risk — same shape as a built-in rule hit.
 */
export function evaluateRules(text: string, extraKeywords = ''): RuleHit | null {
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

  const extra = extraKeywords.split(',').map((k) => k.trim().toLowerCase()).filter(Boolean);
  const lower = text.toLowerCase();
  const matched = extra.find((k) => lower.includes(k));
  if (matched && (!hit || RANK[SentinelDecision.takeover_required] > RANK[hit.decision])) {
    hit = {
      decision: SentinelDecision.takeover_required,
      riskLevel: RiskLevel.high,
      reason: `Risk keyword terkonfigurasi terdeteksi: "${matched}"`,
    };
  }

  return hit;
}

/**
 * Apply PRD 16 confidence gates on top of an LLM decision.
 *   <50  → block (admin required)
 *   50–89 → draft (hold for admin). The PRD splits this into "draft only"
 *           (50–69) and "light supervision" (70–89), but in this system both
 *           outcomes are the same action — hold as a draft — so they collapse
 *           into one branch deliberately (not a missing case).
 *   ≥90  → approve (eligible for auto-send)
 */
export function decisionFromConfidence(
  confidence: number,
  draftMin = 50,
  autoSendMin = 90,
): SentinelDecision {
  if (confidence < draftMin) return SentinelDecision.block;
  if (confidence < autoSendMin) return SentinelDecision.draft;
  return SentinelDecision.approve;
}

/**
 * Deterministic groundedness check (audit follow-up): flags a draft that
 * states a price-like number (4+ digits — phone/quantity noise is shorter)
 * which does not appear anywhere in the knowledge/product data actually
 * injected into the prompt. Catches outright fabrication that a flaky LLM
 * judge might still approve. Never flags when there is no grounding data to
 * compare against (nothing to fabricate FROM, or the bot has no KB yet).
 */
export function checkPriceGrounding(draftText: string, groundedText: string): RuleHit | null {
  if (!groundedText.trim()) return null;
  const draftNumbers = draftText.match(/\d[\d.,]{3,}/g) ?? [];
  if (draftNumbers.length === 0) return null;
  const groundedDigits = (groundedText.match(/\d+/g) ?? []).join(' ');
  const ungrounded = draftNumbers
    .map((n) => n.replace(/\D/g, ''))
    .filter((n) => n.length >= 4 && !groundedDigits.includes(n));
  if (ungrounded.length === 0) return null;
  return {
    decision: SentinelDecision.draft,
    riskLevel: RiskLevel.medium,
    reason: `Draft menyebut angka (${ungrounded.join(', ')}) yang tidak ditemukan di product knowledge/stok — kemungkinan mengarang`,
  };
}

/**
 * The core "n8n/Dify-style" RAG discipline: if nothing was retrieved from the
 * knowledge base/product data for this question, the bot should say so (the
 * fallback phrase) — not answer from the model's general knowledge. Flags a
 * draft that did neither (no grounding data AND no fallback phrase) for a
 * substantive customer question. Skips greetings/smalltalk, which never need
 * a KB match, and skips trivial/very short customer messages.
 */
export function checkKnowledgeGrounding(
  draftText: string,
  groundedText: string,
  customerText: string,
): RuleHit | null {
  if (groundedText.trim()) return null;
  if (FALLBACK_MARKERS.some((m) => draftText.includes(m))) return null;
  const trimmed = (customerText ?? '').trim();
  if (trimmed.length < 8) return null;
  if (SMALLTALK.test(trimmed)) return null;
  return {
    decision: SentinelDecision.draft,
    riskLevel: RiskLevel.medium,
    reason: 'Tidak ada knowledge/product yang cocok untuk pertanyaan ini, dan bot tidak menjawab dengan kalimat fallback — kemungkinan menjawab dari luar data yang tersedia',
  };
}

export function mostRestrictive(
  a: SentinelDecision,
  b: SentinelDecision,
): SentinelDecision {
  return RANK[a] >= RANK[b] ? a : b;
}

export function highestRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  return RISK_RANK[a] >= RISK_RANK[b] ? a : b;
}
