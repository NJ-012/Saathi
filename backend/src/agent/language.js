/**
 * agent/language.js
 * ------------------
 * Cheap, deterministic detection of which language style the customer is
 * writing in, so the draft-generation prompt (promptBuilder.js) can tell
 * the LLM which style to mirror. This is a starting hint for the prompt,
 * not a hard classification — the LLM is still shown the actual message
 * and can adjust, this just gives it a clear default.
 */

const DEVANAGARI_PATTERN = /[\u0900-\u097F]/;

// Common Romanized-Hindi words that show up in Hinglish even when the
// message is written entirely in Latin script (e.g. "order kab aayega",
// "size available hai kya").
const HINGLISH_WORDS = [
  'kab', 'kaise', 'kyu', 'kyun', 'kya', 'hai', 'haina', 'nahi', 'nahin',
  'karo', 'kar', 'karna', 'chahiye', 'bhai', 'yaar', 'mujhe', 'aap',
  'aapka', 'mera', 'meri', 'mere', 'hoga', 'hogi', 'milega', 'milegi',
  'aayega', 'aayegi', 'bata', 'batao', 'accha', 'theek', 'thik', 'sahi',
  'paisa', 'paise', 'wapas', 'jaldi', 'abhi',
];

function tokenize(message) {
  return message.toLowerCase().split(/\W+/).filter(Boolean);
}

/**
 * Returns one of 'hindi' | 'hinglish' | 'english'.
 */
export function detectLanguageStyle(message) {
  if (!message) return 'english';

  if (DEVANAGARI_PATTERN.test(message)) {
    return 'hindi';
  }

  const tokens = tokenize(message);
  const hasHinglishWord = tokens.some((t) => HINGLISH_WORDS.includes(t));

  return hasHinglishWord ? 'hinglish' : 'english';
}
