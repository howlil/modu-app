import type { LanguageIsland } from '../core/learning.ts';

/** Non-user, versioned sample content for the pre-launch kernel workspace.
 * No account, provider, networking or storage dependency. */
export const STARTER_ISLAND: LanguageIsland = {
  id: 'starter-en-cafe',
  revision: 1,
  title: 'At the café',
  sourceLanguage: 'id',
  targetLanguage: 'en',
  sentences: [
    { id: 'cafe-order', revision: 1, prompt: 'Saya ingin memesan kopi.', answer: "I'd like to order a coffee." },
    { id: 'cafe-menu', revision: 1, prompt: 'Boleh saya lihat menunya?', answer: 'Could I see the menu, please?' },
    { id: 'cafe-price', revision: 1, prompt: 'Berapa total harganya?', answer: 'How much is it altogether?' }
  ]
};
