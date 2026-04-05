import { z } from "zod";

const WordBreakdownSchema = z.object({
  word: z.string(),
  meaning: z.string(),
});

const SavedPhraseSchema = z.object({
  id: z.string(),
  phrase: z.string(),
  definition: z.string(),
  partOfSpeech: z.string(),
  language: z.string(),
  savedAt: z.number(),
  wordBreakdown: z.array(WordBreakdownSchema).optional(),
});

export type WordBreakdown = z.infer<typeof WordBreakdownSchema>;
export type SavedPhrase = z.infer<typeof SavedPhraseSchema>;

const STORAGE_KEY = "tagebook:saved-phrases";

let listeners: Array<() => void> = [];
let phrases: SavedPhrase[] = loadFromStorage();

function loadFromStorage(): SavedPhrase[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return z.array(SavedPhraseSchema).parse(JSON.parse(raw));
  } catch {
    return [];
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(phrases));
  } catch {
    /* quota exceeded — silently ignore */
  }
}

function notify() {
  persist();
  for (const l of listeners) l();
}

export function getSavedPhrases(): SavedPhrase[] {
  return phrases;
}

export function addSavedPhrase(
  phrase: string,
  definition: string,
  partOfSpeech: string,
  language: string,
): void {
  // Don't add duplicates
  if (phrases.some((p) => p.phrase === phrase && p.language === language)) return;
  phrases = [
    {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      phrase,
      definition,
      partOfSpeech,
      language,
      savedAt: Date.now(),
    },
    ...phrases,
  ];
  notify();
}

export function removeSavedPhrase(id: string): void {
  phrases = phrases.filter((p) => p.id !== id);
  notify();
}

export function removeSavedPhraseByContent(phrase: string, language: string): void {
  phrases = phrases.filter((p) => !(p.phrase === phrase && p.language === language));
  notify();
}

export function updateWordBreakdown(id: string, breakdown: WordBreakdown[]): void {
  phrases = phrases.map((p) => (p.id === id ? { ...p, wordBreakdown: breakdown } : p));
  notify();
}

export function isSaved(phrase: string, language: string): boolean {
  return phrases.some((p) => p.phrase === phrase && p.language === language);
}

export function subscribe(listener: () => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}
