import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import {
  splitSegments,
  getActiveSegmentIndex,
  isCached,
  analyzeOne,
  getCacheSize,
  type SegmentAnalysis,
  type SegmentInfo,
} from "../lib/segment-cache";
import { DefinitionMark, GrammarMark } from "../lib/translation-mark";
import { TranslationTooltip } from "./TranslationTooltip";
import { SavedPhrases } from "./SavedPhrases";
import { GrainOverlay } from "./GrainOverlay";
import { GradeGutter, buildGutterItems } from "./GradeGutter";
import { addSavedPhrase, getSavedPhrases, updateWordBreakdown } from "../lib/saved-phrases";
import { getWordBreakdown } from "../lib/ollama";
import { DocList } from "./DocList";
import {
  getDocs,
  getActiveDocId,
  setActiveDocId,
  createDoc,
  loadDocContent,
  saveDocContent,
  updateDocTitle,
  migrateOldContent,
} from "../lib/documents";
import { Languages, Loader2, BookOpen, PenLine, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState, useCallback } from "react";

const LANGUAGES = [
  "German",
  "Spanish",
  "French",
  "Italian",
  "Portuguese",
  "Dutch",
  "Russian",
  "Japanese",
  "Korean",
  "Mandarin Chinese",
  "Arabic",
  "Hindi",
  "Turkish",
  "Polish",
  "Swedish",
  "Greek",
  "Hebrew",
  "Vietnamese",
  "Thai",
  "Indonesian",
] as const;

/** Search for a phrase only within a scoped PM position range. */
function findPhraseInRange(
  editor: ReturnType<typeof useEditor>,
  phrase: string,
  rangeFrom: number,
  rangeTo: number,
): Array<{ from: number; to: number }> {
  if (!editor) return [];
  const results: Array<{ from: number; to: number }> = [];
  const lowerPhrase = phrase.toLowerCase();

  editor.state.doc.nodesBetween(rangeFrom, rangeTo, (node, pos) => {
    if (!node.isText || !node.text) return;
    const lowerText = node.text.toLowerCase();
    let searchFrom = 0;
    while (searchFrom < lowerText.length) {
      const idx = lowerText.indexOf(lowerPhrase, searchFrom);
      if (idx === -1) break;
      const from = pos + idx;
      const to = from + phrase.length;
      // Only include if fully within range
      if (from >= rangeFrom && to <= rangeTo) {
        results.push({ from, to });
      }
      searchFrom = idx + phrase.length;
    }
  });

  return results;
}

interface SegmentPMRange {
  segIdx: number;
  pmFrom: number;
  pmTo: number;
}

/**
 * Build a mapping from segments (by plain-text offset) to ProseMirror positions.
 * Walks the doc once and maps character offsets to PM positions.
 */
function mapSegmentsToPM(
  editor: ReturnType<typeof useEditor>,
  segments: SegmentInfo[],
): SegmentPMRange[] {
  if (!editor || segments.length === 0) return [];

  const results: SegmentPMRange[] = [];
  let charOffset = 0;
  let segIdx = 0;

  editor.state.doc.descendants((node, pos) => {
    if (segIdx >= segments.length) return false;

    if (node.isText && node.text) {
      for (let i = 0; i < node.text.length && segIdx < segments.length; i++) {
        const absChar = charOffset + i;
        const seg = segments[segIdx];

        // Check if this character starts the segment
        if (absChar === seg.start) {
          const pmFrom = pos + i;
          // The segment might span multiple text nodes, so compute end
          const pmTo = pmFrom + seg.text.length;
          results.push({ segIdx, pmFrom, pmTo });
          segIdx++;
        }
      }
      charOffset += node.text.length;
    } else if (node.isBlock && pos > 0) {
      charOffset += 1; // newline between blocks
    }
    return;
  });

  return results;
}

/** Convert TipTap selection position to plain-text character offset. */
function posToCharOffset(editor: ReturnType<typeof useEditor>): number {
  if (!editor) return 0;
  const pos = editor.state.selection.from;
  let offset = 0;
  let found = false;

  editor.state.doc.descendants((node, nodePos) => {
    if (found) return false;
    if (node.isText && node.text) {
      if (pos >= nodePos && pos <= nodePos + node.text.length) {
        offset += pos - nodePos;
        found = true;
        return false;
      }
      offset += node.text.length;
    } else if (node.isBlock && nodePos > 0) {
      offset += 1;
    }
    return;
  });

  return offset;
}

const DEBOUNCE_MS = 800;
const LANG_KEY = "tagebook:editor-language";

function loadLanguage(): string {
  try {
    return localStorage.getItem(LANG_KEY) ?? "German";
  } catch {
    return "German";
  }
}

function ensureActiveDoc(): string {
  let id = getActiveDocId();
  if (id && getDocs().some((d) => d.id === id)) return id;
  const docs = getDocs();
  if (docs.length > 0) {
    setActiveDocId(docs[0].id);
    return docs[0].id;
  }
  // Migrate old single-doc content if present
  const oldContent = migrateOldContent();
  const doc = createDoc();
  if (oldContent) saveDocContent(doc.id, oldContent);
  return doc.id;
}

export function Editor() {
  const [activeDocId, setActiveDoc] = useState(ensureActiveDoc);
  const [docTitle, setDocTitle] = useState(() => {
    const doc = getDocs().find((d) => d.id === ensureActiveDoc());
    return doc?.title ?? "";
  });
  const [targetLanguage, setTargetLanguage] = useState(loadLanguage);
  const [pendingCount, setPendingCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [cachedCount, setCachedCount] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [gutterItems, setGutterItems] = useState<ReturnType<typeof buildGutterItems>>([]);
  const editorAreaRef = useRef<HTMLDivElement>(null);
  const activeDebounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const analysisMapRef = useRef(new Map<string, SegmentAnalysis>());
  const inflightRef = useRef(new Set<string>());
  const langRef = useRef(targetLanguage);

  const activeDocIdRef = useRef(activeDocId);
  activeDocIdRef.current = activeDocId;

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: "Start writing in any language…",
      }),
      DefinitionMark,
      GrammarMark,
    ],
    content: loadDocContent(activeDocId),
    editorProps: {
      attributes: {
        class: "editor-content",
      },
    },
    onUpdate: ({ editor: e }) => {
      saveDocContent(activeDocIdRef.current, e.getHTML());
    },
  });

  // Switch doc content when activeDocId changes
  useEffect(() => {
    if (!editor) return;
    const html = loadDocContent(activeDocId);
    editor.commands.setContent(html || "");
    analysisMapRef.current.clear();
    setGutterItems([]);
    // Trigger analysis on loaded content
    const text = editor.getText();
    if (text.trim()) {
      const segments = splitSegments(text);
      for (const seg of segments) {
        fireSegment(seg.text);
      }
    }
    // Update title
    const doc = getDocs().find((d) => d.id === activeDocId);
    setDocTitle(doc?.title ?? "");
  }, [activeDocId]); // eslint-disable-line react-hooks/exhaustive-deps

  const switchDoc = useCallback(
    (id: string) => {
      // Save current doc before switching
      if (editor) {
        saveDocContent(activeDocIdRef.current, editor.getHTML());
      }
      setActiveDocId(id);
      setActiveDoc(id);
    },
    [editor],
  );

  langRef.current = targetLanguage;

  /**
   * Apply marks using a single ProseMirror transaction, scoped per segment.
   * Only clears/reapplies marks within each segment's own PM range.
   * Segments without analysis are left untouched.
   */
  const applyMarks = useCallback(
    (segments: SegmentInfo[]) => {
      if (!editor) return;

      const { state } = editor;
      const { tr } = state;
      const defType = state.schema.marks.definition;
      const gramType = state.schema.marks.grammar;

      if (!defType || !gramType) return;

      const pmRanges = mapSegmentsToPM(editor, segments);

      let colorIdx = 0;
      for (const { segIdx, pmFrom, pmTo } of pmRanges) {
        const seg = segments[segIdx];
        const analysis = analysisMapRef.current.get(seg.text);
        if (!analysis) {
          // No analysis yet — don't touch this segment's marks
          // Still advance colorIdx for consistent coloring if we had previous data
          continue;
        }

        // Clamp range to doc size
        const clampedTo = Math.min(pmTo, state.doc.content.size);

        // Clear marks only within this segment's range
        tr.removeMark(pmFrom, clampedTo, defType);
        tr.removeMark(pmFrom, clampedTo, gramType);

        // Add definition marks scoped to this range
        for (const def of analysis.definitions) {
          const positions = findPhraseInRange(editor, def.phrase, pmFrom, clampedTo);
          for (const { from, to } of positions) {
            tr.addMark(
              from,
              to,
              defType.create({
                phrase: def.phrase,
                definition: def.definition,
                partOfSpeech: def.partOfSpeech,
                colorIndex: colorIdx % 6,
              }),
            );
          }
          colorIdx++;
        }

        // Add grammar marks scoped to this range
        for (const issue of analysis.grammarIssues) {
          const positions = findPhraseInRange(editor, issue.phrase, pmFrom, clampedTo);
          for (const { from, to } of positions) {
            tr.addMark(
              from,
              to,
              gramType.create({
                phrase: issue.phrase,
                correction: issue.correction,
                explanation: issue.explanation,
              }),
            );
          }
        }
      }

      tr.setMeta("addToHistory", false);
      editor.view.dispatch(tr);

      // Rebuild grades after marks are painted
      requestAnimationFrame(() => {
        setGutterItems(buildGutterItems(editorAreaRef.current, analysisMapRef.current));
      });
    },
    [editor],
  );

  const fireSegment = useCallback(
    (segmentText: string) => {
      const lang = langRef.current;
      if (isCached(lang, segmentText) && analysisMapRef.current.has(segmentText)) {
        return;
      }
      const flightKey = `${lang}\0${segmentText}`;
      if (inflightRef.current.has(flightKey)) return;
      inflightRef.current.add(flightKey);

      setPendingCount((c) => c + 1);

      analyzeOne(segmentText, lang, "English")
        .then((result) => {
          if (langRef.current !== lang) return;
          analysisMapRef.current.set(segmentText, result);
          setCachedCount(getCacheSize());
          if (editor) {
            const currentSegments = splitSegments(editor.getText());
            applyMarks(currentSegments);
          }
        })
        .catch(() => {
          setError("Could not connect to Ollama");
        })
        .finally(() => {
          inflightRef.current.delete(flightKey);
          setPendingCount((c) => Math.max(0, c - 1));
        });
    },
    [editor, applyMarks],
  );

  const triggerAnalysis = useCallback(() => {
    if (!editor) return;

    const text = editor.getText();
    if (!text.trim()) return;

    const segments = splitSegments(text);
    const cursorOffset = posToCharOffset(editor);
    const activeIdx = getActiveSegmentIndex(segments, cursorOffset);

    setError(null);

    for (let i = 0; i < segments.length; i++) {
      if (i === activeIdx) continue;
      fireSegment(segments[i].text);
    }

    applyMarks(segments);

    if (activeDebounceRef.current) clearTimeout(activeDebounceRef.current);
    if (activeIdx >= 0 && activeIdx < segments.length) {
      const activeText = segments[activeIdx].text;
      activeDebounceRef.current = setTimeout(() => {
        if (!editor) return;
        const currentSegments = splitSegments(editor.getText());
        const currentCursorOffset = posToCharOffset(editor);
        const currentActiveIdx = getActiveSegmentIndex(currentSegments, currentCursorOffset);
        const segToAnalyze = currentSegments[currentActiveIdx]?.text ?? activeText;
        fireSegment(segToAnalyze);
      }, DEBOUNCE_MS);
    }
  }, [editor, fireSegment, applyMarks]);

  // Persist language and re-analyze when it changes
  useEffect(() => {
    try {
      localStorage.setItem(LANG_KEY, targetLanguage);
    } catch {
      /* ignore */
    }
    if (!editor) return;
    analysisMapRef.current.clear();

    // Clear marks via transaction
    const { state } = editor;
    const { tr } = state;
    const defType = state.schema.marks.definition;
    const gramType = state.schema.marks.grammar;
    if (defType) tr.removeMark(0, state.doc.content.size, defType);
    if (gramType) tr.removeMark(0, state.doc.content.size, gramType);
    tr.setMeta("addToHistory", false);
    editor.view.dispatch(tr);

    const text = editor.getText();
    if (text.trim()) {
      const segments = splitSegments(text);
      for (const seg of segments) {
        fireSegment(seg.text);
      }
    }
    setCachedCount(getCacheSize());
  }, [targetLanguage]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!editor) return;

    editor.on("update", triggerAnalysis);
    return () => {
      editor.off("update", triggerAnalysis);
      if (activeDebounceRef.current) clearTimeout(activeDebounceRef.current);
    };
  }, [editor, triggerAnalysis]);

  useEffect(() => {
    if (!dropdownOpen) return;
    const close = () => setDropdownOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [dropdownOpen]);

  return (
    <div className="editor-layout">
      <div className="editor-main">
        <div className="editor-header">
          <div className="editor-title">
            <BookOpen size={18} />
            <input
              className="editor-title-input"
              value={docTitle}
              onChange={(e) => {
                setDocTitle(e.target.value);
                updateDocTitle(activeDocId, e.target.value);
              }}
              placeholder="Untitled"
            />
          </div>
          <div className="editor-header-right">
            {pendingCount > 0 && (
              <div className="analyzing-indicator">
                <Loader2 size={14} className="spinning" />
                <span>
                  {pendingCount} segment{pendingCount !== 1 ? "s" : ""}…
                </span>
              </div>
            )}
            {error && <div className="analyzing-error-inline">{error}</div>}
            <div className="language-dropdown-wrapper">
              <button
                className="language-selector"
                onClick={(e) => {
                  e.stopPropagation();
                  setDropdownOpen((o) => !o);
                }}
              >
                <Languages size={14} />
                <span>{targetLanguage}</span>
                <ChevronDown size={12} />
              </button>
              {dropdownOpen && (
                <div className="language-dropdown">
                  {LANGUAGES.map((lang) => (
                    <button
                      key={lang}
                      className={`language-option ${lang === targetLanguage ? "active" : ""}`}
                      onClick={() => {
                        setTargetLanguage(lang);
                        setDropdownOpen(false);
                      }}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="editor-area" ref={editorAreaRef}>
          <GradeGutter items={gutterItems} targetLanguage={targetLanguage} />
          <EditorContent editor={editor} />
        </div>

        <div className="editor-footer">
          <div className="word-count">
            <PenLine size={14} />
            <span>{editor?.getText().split(/\s+/).filter(Boolean).length ?? 0} words</span>
          </div>
          {cachedCount > 0 && (
            <div className="cache-indicator">
              {cachedCount} segment{cachedCount !== 1 ? "s" : ""} cached
            </div>
          )}
          <div className="footer-hint">Definitions &amp; grammar checks appear as you write</div>
        </div>
      </div>

      <div className="editor-sidebar">
        <GrainOverlay />
        <DocList activeId={activeDocId} onSelect={switchDoc} />
        <div className="sidebar-divider" />
        <SavedPhrases />
      </div>

      <TranslationTooltip
        language={targetLanguage}
        onSave={(phrase, definition, partOfSpeech) => {
          addSavedPhrase(phrase, definition, partOfSpeech, targetLanguage);
          // Kick off word breakdown in background
          const saved = getSavedPhrases().find(
            (p) => p.phrase === phrase && p.language === targetLanguage,
          );
          if (saved && !saved.wordBreakdown) {
            void getWordBreakdown(phrase, targetLanguage, "English").then((result) => {
              if (result.words.length > 0) {
                updateWordBreakdown(saved.id, result.words);
              }
            });
          }
        }}
      />
    </div>
  );
}
