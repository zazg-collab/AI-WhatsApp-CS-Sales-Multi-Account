import { SentinelDecision } from '@sentinel/database';
import {
  evaluateRules,
  decisionFromConfidence,
  mostRestrictive,
} from '../modules/sentinel/rules.engine';
import { fenceData, stripDataFences } from '../i18n/bot-prompts';
import {
  RULE_CASES,
  CLEAN_CASES,
  KNOWN_RULE_GAPS,
  CONFIDENCE_CASES,
  INJECTION_STRINGS,
} from './golden-cases';

/**
 * AI safety regression gate (audit item #2). Deterministic only — runs in CI
 * with no provider call. A red here means a safety-critical layer regressed.
 *
 * NOT covered (documented gap → needs a live-model eval harness, future work):
 * groundedness/factuality, the model actually OBEYING the injection refusal,
 * and abstention on out-of-scope questions.
 */
describe('AI safety eval gate', () => {
  describe('rules engine — recall must be 100% on the safety floor', () => {
    it.each(RULE_CASES)('detects [$note]: "$text"', (c) => {
      const hit = evaluateRules(c.text);
      expect(hit).not.toBeNull();
      expect(hit!.decision).toBe(c.decision);
      expect(hit!.riskLevel).toBe(c.riskLevel);
    });

    it.each(CLEAN_CASES)('does not false-positive on: "%s"', (text) => {
      expect(evaluateRules(text)).toBeNull();
    });

    // Documents real coverage — these SHOULD start passing (and this test
    // start failing) the day the rules get smarter. That failure is the signal.
    it.each(KNOWN_RULE_GAPS)('known gap (LLM-only backstop): "$text"', (g) => {
      expect(evaluateRules(g.text)).toBeNull();
    });
  });

  describe('confidence gate (PRD §16)', () => {
    it.each(CONFIDENCE_CASES)(
      'confidence $confidence → $decision',
      ({ confidence, decision }) => {
        expect(decisionFromConfidence(confidence)).toBe(decision);
      },
    );
  });

  describe('most-restrictive merge — a rule must override a permissive LLM', () => {
    it('refund rule overrides an LLM "approve"', () => {
      const ruleHit = evaluateRules('saya minta refund');
      const merged = mostRestrictive(SentinelDecision.approve, ruleHit!.decision);
      expect(merged).toBe(SentinelDecision.takeover_required);
    });

    it('legal rule overrides even a high-confidence approve', () => {
      const ruleHit = evaluateRules('saya lapor polisi');
      const merged = mostRestrictive(
        decisionFromConfidence(95), // approve
        ruleHit!.decision,
      );
      expect(merged).toBe(SentinelDecision.pause_ai);
    });
  });

  describe('output guard — internal fence markers never reach the customer', () => {
    it.each(INJECTION_STRINGS)(
      'strips leaked markers if the model echoes a fenced injection: "%s"',
      (inj) => {
        // Simulate the worst case: model parrots back the fenced block verbatim.
        const echoed = `Tentu kak. ${fenceData(inj, 'id')}`;
        const cleaned = stripDataFences(echoed);
        expect(cleaned).not.toMatch(/<<.*(DATA_REFERENSI|REFERENCE_DATA).*>>/);
        // The injection TEXT may remain (that's the model's job to refuse), but
        // the internal scaffolding must be gone.
        expect(cleaned).not.toContain('DATA_REFERENSI');
      },
    );
  });
});
