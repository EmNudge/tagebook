import { getDefinitions, getGrammarCheck, type WordDefinition, type GrammarIssue } from "./ollama";

export interface SegmentInfo {
  text: string;
  /** Character offset in the full plain text */
  start: number;
  end: number;
}

export interface SegmentAnalysis {
  text: string;
  definitions: WordDefinition[];
  grammarIssues: GrammarIssue[];
  detectedLanguage: string | null;
  isTargetLanguage: boolean;
  grade: string | null;
  gradeFeedback: string | null;
}

interface CacheEntry {
  definitions: WordDefinition[];
  grammarIssues: GrammarIssue[];
  detectedLanguage: string | null;
  isTargetLanguage: boolean;
  grade: string | null;
  gradeFeedback: string | null;
}

// Cache keyed as "targetLang\0segmentText" so different languages don't collide
const cache = new Map<string, CacheEntry>();

function cacheKey(targetLanguage: string, segment: string): string {
  return `${targetLanguage}\0${segment}`;
}

/** Split text into segments with character offsets. */
export function splitSegments(text: string): SegmentInfo[] {
  const results: SegmentInfo[] = [];
  const lines = text.split(/\n/);
  let offset = 0;

  for (const line of lines) {
    if (line.trim()) {
      const sentences = line.match(/[^.!?]*[.!?]+[\s]?|[^.!?]+$/g);
      if (sentences) {
        let lineOffset = offset;
        for (const s of sentences) {
          // Find this sentence's position within the line
          const idx = line.indexOf(s.trimEnd(), lineOffset - offset);
          const trimmed = s.trim();
          if (trimmed) {
            const start = offset + (idx >= 0 ? idx : lineOffset - offset);
            results.push({ text: trimmed, start, end: start + trimmed.length });
          }
          lineOffset = offset + (idx >= 0 ? idx : lineOffset - offset) + s.length;
        }
      }
    }
    offset += line.length + 1; // +1 for \n
  }

  return results;
}

/** Find which segment the cursor (as a character offset in plain text) falls in. */
export function getActiveSegmentIndex(segments: SegmentInfo[], cursorOffset: number): number {
  for (let i = 0; i < segments.length; i++) {
    if (cursorOffset >= segments[i].start && cursorOffset <= segments[i].end) {
      return i;
    }
  }
  // If cursor is between segments or at end, return the nearest
  if (segments.length === 0) return -1;
  // Find the closest segment
  let closest = 0;
  let closestDist = Infinity;
  for (let i = 0; i < segments.length; i++) {
    const dist = Math.min(
      Math.abs(cursorOffset - segments[i].start),
      Math.abs(cursorOffset - segments[i].end),
    );
    if (dist < closestDist) {
      closestDist = dist;
      closest = i;
    }
  }
  return closest;
}

export function isCached(targetLanguage: string, text: string): boolean {
  return cache.has(cacheKey(targetLanguage, text));
}

/** Analyze a single segment (both passes in parallel), using cache. */
export async function analyzeOne(
  segment: string,
  targetLanguage: string,
  nativeLanguage: string,
): Promise<SegmentAnalysis> {
  const key = cacheKey(targetLanguage, segment);
  const existing = cache.get(key);
  if (existing) {
    return {
      text: segment,
      definitions: existing.definitions,
      grammarIssues: existing.grammarIssues,
      detectedLanguage: existing.detectedLanguage,
      isTargetLanguage: existing.isTargetLanguage,
      grade: existing.grade,
      gradeFeedback: existing.gradeFeedback,
    };
  }

  const [defResult, grammarResult] = await Promise.all([
    getDefinitions(segment, targetLanguage, nativeLanguage),
    getGrammarCheck(segment, targetLanguage),
  ]);

  const entry: CacheEntry = {
    definitions: defResult.definitions,
    grammarIssues: grammarResult.issues,
    detectedLanguage: defResult.language,
    isTargetLanguage: grammarResult.isTargetLanguage,
    grade: grammarResult.grade,
    gradeFeedback: grammarResult.gradeFeedback,
  };

  cache.set(key, entry);

  return {
    text: segment,
    definitions: entry.definitions,
    grammarIssues: entry.grammarIssues,
    detectedLanguage: entry.detectedLanguage,
    isTargetLanguage: entry.isTargetLanguage,
    grade: entry.grade,
    gradeFeedback: entry.gradeFeedback,
  };
}

export function getCacheSize(): number {
  return cache.size;
}

export function clearCache(): void {
  cache.clear();
}
