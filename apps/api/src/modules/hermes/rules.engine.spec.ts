import { HermesDecision, RiskLevel } from '@hermes/database';
import {
  evaluateRules,
  decisionFromConfidence,
  mostRestrictive,
  highestRisk,
} from './rules.engine';

describe('rules.engine', () => {
  describe('evaluateRules', () => {
    it('returns null for clean text', () => {
      expect(evaluateRules('halo kak, mau tanya harga produk')).toBeNull();
    });

    it('flags legal/threat keywords as pause_ai/critical', () => {
      const hit = evaluateRules('saya akan lapor polisi dan tuntut kalian');
      expect(hit).not.toBeNull();
      expect(hit!.decision).toBe(HermesDecision.pause_ai);
      expect(hit!.riskLevel).toBe(RiskLevel.critical);
    });

    it('flags refund as takeover_required/high', () => {
      const hit = evaluateRules('saya minta refund sekarang');
      expect(hit!.decision).toBe(HermesDecision.takeover_required);
      expect(hit!.riskLevel).toBe(RiskLevel.high);
    });

    it('matches batalkan as refund rule', () => {
      const hit = evaluateRules('tolong batalkan pesanan saya');
      expect(hit!.decision).toBe(HermesDecision.takeover_required);
    });

    it('flags complaint keywords as draft/medium', () => {
      const hit = evaluateRules('saya komplain, produknya jelek');
      expect(hit!.decision).toBe(HermesDecision.draft);
      expect(hit!.riskLevel).toBe(RiskLevel.medium);
    });

    it('most restrictive rule wins when multiple match', () => {
      // contains both complaint (draft) and legal (pause_ai)
      const hit = evaluateRules('saya kecewa dan mau lapor polisi');
      expect(hit!.decision).toBe(HermesDecision.pause_ai);
    });

    it('is case-insensitive', () => {
      expect(evaluateRules('REFUND please')!.decision).toBe(
        HermesDecision.takeover_required,
      );
    });
  });

  describe('decisionFromConfidence', () => {
    it('>=90 approves', () => {
      expect(decisionFromConfidence(90)).toBe(HermesDecision.approve);
      expect(decisionFromConfidence(100)).toBe(HermesDecision.approve);
    });
    it('70-89 drafts (supervised)', () => {
      expect(decisionFromConfidence(70)).toBe(HermesDecision.draft);
      expect(decisionFromConfidence(89)).toBe(HermesDecision.draft);
    });
    it('50-69 drafts', () => {
      expect(decisionFromConfidence(50)).toBe(HermesDecision.draft);
      expect(decisionFromConfidence(69)).toBe(HermesDecision.draft);
    });
    it('<50 blocks', () => {
      expect(decisionFromConfidence(49)).toBe(HermesDecision.block);
      expect(decisionFromConfidence(0)).toBe(HermesDecision.block);
    });
  });

  describe('mostRestrictive', () => {
    it('picks higher-rank decision', () => {
      expect(
        mostRestrictive(HermesDecision.approve, HermesDecision.pause_ai),
      ).toBe(HermesDecision.pause_ai);
      expect(
        mostRestrictive(HermesDecision.block, HermesDecision.draft),
      ).toBe(HermesDecision.block);
    });
    it('returns first when equal', () => {
      expect(
        mostRestrictive(HermesDecision.draft, HermesDecision.draft),
      ).toBe(HermesDecision.draft);
    });
  });

  describe('highestRisk', () => {
    it('picks higher risk level', () => {
      expect(highestRisk(RiskLevel.low, RiskLevel.critical)).toBe(
        RiskLevel.critical,
      );
      expect(highestRisk(RiskLevel.high, RiskLevel.medium)).toBe(
        RiskLevel.high,
      );
    });
  });
});
