import { z } from "zod";

const OLLAMA_BASE_URL = "/ollama";

const WordDefinitionSchema = z.object({
  phrase: z.string(),
  definition: z.string(),
  partOfSpeech: z.string(),
});

const GrammarIssueSchema = z.object({
  phrase: z.string(),
  correction: z.string(),
  explanation: z.string(),
});

const DefinitionsResultSchema = z.object({
  language: z.string(),
  definitions: z.array(WordDefinitionSchema),
});

const GrammarResultSchema = z.object({
  isTargetLanguage: z.boolean(),
  issues: z.array(GrammarIssueSchema),
  grade: z.string().nullable(),
  gradeFeedback: z.string().nullable(),
});

const WordBreakdownResultSchema = z.object({
  words: z.array(z.object({ word: z.string(), meaning: z.string() })),
});

export type WordDefinition = z.infer<typeof WordDefinitionSchema>;
export type GrammarIssue = z.infer<typeof GrammarIssueSchema>;
export type DefinitionsResult = z.infer<typeof DefinitionsResultSchema>;
export type GrammarResult = z.infer<typeof GrammarResultSchema>;
export type WordBreakdownResult = z.infer<typeof WordBreakdownResultSchema>;

async function ollamaGenerate(prompt: string): Promise<string> {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gemma4",
      prompt,
      stream: false,
      format: "json",
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.status}`);
  }

  const data = await response.json();
  return data.response;
}

export async function getDefinitions(
  segment: string,
  targetLanguage: string,
  nativeLanguage: string,
): Promise<DefinitionsResult> {
  const raw = await ollamaGenerate(
    `You are a language tutor. The student speaks ${nativeLanguage} and is learning ${targetLanguage}.

Given the following sentence, provide a definition for every word or short phrase.

- First, identify what language the text is written in and set "language" to that language name.
- For EACH word or natural phrase grouping, provide a definition in ${targetLanguage}.
  - If the text is already in ${targetLanguage}, define each word/phrase in ${targetLanguage} (monolingual dictionary style — meaning, usage).
  - If the text is in ${nativeLanguage} or another language, translate each word/phrase into ${targetLanguage}.
- Cover every word. Prefer grouping words into natural phrases (verb phrases, idioms, noun phrases) over single words where they form a unit. Do not overlap phrases.

Return JSON: {"language": "...", "definitions": [{"phrase": "exact text", "definition": "definition in ${targetLanguage}", "partOfSpeech": "noun/verb/adj/etc"}]}

Text: "${segment}"

Respond ONLY with valid JSON.`,
  );

  try {
    return DefinitionsResultSchema.parse(JSON.parse(raw));
  } catch {
    return { language: "unknown", definitions: [] };
  }
}

export async function getGrammarCheck(
  segment: string,
  targetLanguage: string,
): Promise<GrammarResult> {
  const raw = await ollamaGenerate(
    `You are a strict ${targetLanguage} grammar checker and writing evaluator.

Determine if the following text is written in ${targetLanguage}. If it is NOT in ${targetLanguage}, return: {"isTargetLanguage": false, "issues": [], "grade": null, "gradeFeedback": null}

If it IS in ${targetLanguage}:
1. Check for grammar, spelling, conjugation, gender agreement, accent marks, and word order errors. For each issue found, return an entry in "issues".
2. Give an overall letter grade (A+, A, A-, B+, B, B-, C+, C, C-, D, F) based on correctness, naturalness, and complexity of the ${targetLanguage} used.
3. Write a brief "gradeFeedback" (1-2 sentences) explaining the grade — what was done well and what needs work.

If the text is grammatically perfect, still provide a grade based on complexity and naturalness.

Return JSON: {"isTargetLanguage": true/false, "issues": [{"phrase": "...", "correction": "...", "explanation": "..."}], "grade": "B+", "gradeFeedback": "..."}

Text: "${segment}"

Respond ONLY with valid JSON.`,
  );

  try {
    return GrammarResultSchema.parse(JSON.parse(raw));
  } catch {
    return { isTargetLanguage: false, issues: [], grade: null, gradeFeedback: null };
  }
}

export async function getWordBreakdown(
  phrase: string,
  targetLanguage: string,
  nativeLanguage: string,
): Promise<WordBreakdownResult> {
  const raw = await ollamaGenerate(
    `Break down the following ${targetLanguage} phrase word by word. For each word, give a brief ${nativeLanguage} meaning.

Return JSON: {"words": [{"word": "...", "meaning": "..."}]}

Cover every word in order. Keep meanings concise (a few words each).

Phrase: "${phrase}"

Respond ONLY with valid JSON.`,
  );

  try {
    return WordBreakdownResultSchema.parse(JSON.parse(raw));
  } catch {
    return { words: [] };
  }
}
