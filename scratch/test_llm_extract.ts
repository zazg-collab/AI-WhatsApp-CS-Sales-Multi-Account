import { config } from 'dotenv';
config();
import { createProvider } from './packages/ai/src/index';
import { SHIPPING_EXTRACT_SYSTEM, SHIPPING_EXTRACT_USER } from './apps/api/src/i18n/bot-prompts';

async function run() {
  const provider = createProvider('google', 'gemini-2.5-flash');
  const history = [
    { role: 'user', content: 'waduh mahal ya, kalau gitu ke purwokerto timur aja berapa mbak?' }
  ];
  
  const raw = await provider.chat([
    { role: 'system', content: SHIPPING_EXTRACT_SYSTEM.id },
    ...history,
    { role: 'user', content: SHIPPING_EXTRACT_USER.id },
  ] as any, { temperature: 0, json: true, maxTokens: 300 });
  
  console.log('LLM Result:', raw);
}
run().catch(console.error);
