/**
 * Scenario Loader
 * 
 * Loads predefined test scenarios untuk debugging Sentinel funnel flow.
 * 3 scenarios: Golden Case (normal), Money Gate violation, qtyPasti regression.
 * 
 * Created: 2026-08-08
 */

import { Injectable } from '@nestjs/common';
import type { TestScenario } from './types';

@Injectable()
export class ScenarioLoader {
  /**
   * Get all available test scenarios
   */
  listScenarios(): TestScenario[] {
    return [
      this.goldenCaseNormal(),
      this.moneyGateRekap(),
      this.qtyPastiRegression(),
    ];
  }

  /**
   * Get scenario by name
   */
  getScenario(name: string): TestScenario | null {
    const scenarios = this.listScenarios();
    return scenarios.find((s) => s.name === name) || null;
  }

  /**
   * Golden Case: Normal pembelian golok dengan ongkir (happy path)
   */
  private goldenCaseNormal(): TestScenario {
    return {
      name: 'golden-case-normal',
      description: 'Happy path: pilih produk → qty → alamat → quote ongkir → closing',
      messages: [
        { role: 'user', content: 'ada golok?' },
        {
          role: 'assistant',
          content:
            'Kami punya 3 jenis golok: Golok Kecil (Rp150.000), Golok Sedang (Rp250.000), dan Golok Besar (Rp350.000). Mau yang mana kak?',
        },
        { role: 'user', content: 'golok sedang' },
        { role: 'assistant', content: 'Oke kak, Golok Sedang ya. Mau pesan berapa pcs?' },
        { role: 'user', content: '2 pcs' },
        {
          role: 'assistant',
          content: 'Siap kak, 2 pcs Golok Sedang. Boleh minta alamat lengkapnya untuk hitung ongkir?',
        },
        { role: 'user', content: 'mataram ntb' },
        {
          role: 'assistant',
          content:
            'Baik kak, alamat di Mataram, NTB ya. Ongkir ke sana Rp50.000 (JNE REG). Total pesanan:\n\n- Golok Sedang x2: Rp500.000\n- Ongkir: Rp50.000\n- Total: Rp550.000\n\nKakak mau bayar via transfer atau COD?',
        },
        { role: 'user', content: 'transfer' },
        {
          role: 'assistant',
          content:
            'Siap kak! Silakan transfer ke:\n\n📱 BCA 1234567890 a.n. Toko Golok\n💰 Total: Rp550.000\n\nSetelah transfer, kirim bukti transfer ya kak!',
        },
      ],
    };
  }

  /**
   * Edge Case: Money Gate violation (rekap total di state patokan)
   */
  private moneyGateRekap(): TestScenario {
    return {
      name: 'money-gate-rekap',
      description: 'Money Gate violation: user minta rekap total sebelum pilih produk',
      messages: [
        { role: 'user', content: 'ada golok?' },
        {
          role: 'assistant',
          content:
            'Kami punya 3 jenis golok: Golok Kecil (Rp150.000), Golok Sedang (Rp250.000), dan Golok Besar (Rp350.000). Mau yang mana kak?',
        },
        { role: 'user', content: 'rekap total dong' },
        {
          role: 'assistant',
          content:
            'Maaf kak, saya belum bisa kasih total karena kakak belum pilih produk dan alamat. Mau pilih golok yang mana dulu kak?',
        },
      ],
    };
  }

  /**
   * Edge Case: qtyPasti regression (qty explicit di user message)
   */
  private qtyPastiRegression(): TestScenario {
    return {
      name: 'qty-pasti-regression',
      description: 'qtyPasti flag: user sebutkan qty explicit (5 pisau dapur)',
      messages: [
        { role: 'user', content: '5 pisau dapur' },
        {
          role: 'assistant',
          content:
            'Baik kak, 5 pcs Pisau Dapur ya (Rp75.000/pcs). Total: Rp375.000. Boleh minta alamat lengkapnya untuk hitung ongkir?',
        },
        { role: 'user', content: 'jakarta selatan' },
        {
          role: 'assistant',
          content:
            'Oke kak, alamat di Jakarta Selatan ya. Ongkir ke sana Rp25.000 (JNE REG). Total pesanan:\n\n- Pisau Dapur x5: Rp375.000\n- Ongkir: Rp25.000\n- Total: Rp400.000\n\nKakak mau bayar via transfer atau COD?',
        },
      ],
    };
  }
}
