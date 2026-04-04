import { useState, useRef, useEffect } from "react";
import { MoreHorizontal, ExternalLink } from "lucide-react";
import type { SegmentAnalysis } from "../lib/segment-cache";

const LANG_CODES: Record<string, string> = {
  German: "de", Spanish: "es", French: "fr", Italian: "it",
  Portuguese: "pt", Dutch: "nl", Russian: "ru", Japanese: "ja",
  Korean: "ko", "Mandarin Chinese": "zh-CN", Arabic: "ar",
  Hindi: "hi", Turkish: "tr", Polish: "pl", Swedish: "sv",
  Greek: "el", Hebrew: "iw", Vietnamese: "vi", Thai: "th",
  Indonesian: "id", English: "en",
};

function langCode(lang: string): string {
  return LANG_CODES[lang] ?? "auto";
}

export interface GutterItem {
  grade: string | null;
  feedback: string | null;
  paragraphText: string;
  detectedLanguage: string;
  top: number;
}

function gradeColor(grade: string): string {
  const letter = grade.charAt(0);
  switch (letter) {
    case "A": return "#34d399";
    case "B": return "#a78bfa";
    case "C": return "#fbbf24";
    case "D": return "#fb923c";
    case "F": return "#f87171";
    default: return "#71717a";
  }
}

interface GradeGutterProps {
  items: GutterItem[];
  targetLanguage: string;
}

export function GradeGutter({ items, targetLanguage }: GradeGutterProps) {
  const [hover, setHover] = useState<GutterItem | null>(null);
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (menuFor === null) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && e.target instanceof Node && !menuRef.current.contains(e.target)) {
        setMenuFor(null);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuFor]);

  if (items.length === 0) return null;

  return (
    <div className="grade-gutter">
      {items.map((g, i) => (
        <div
          key={i}
          className="grade-row"
          style={{ top: g.top }}
        >
          <button
            className="grade-action-btn"
            onClick={(e) => {
              e.stopPropagation();
              setMenuFor(menuFor === i ? null : i);
            }}
          >
            <MoreHorizontal size={12} />
          </button>

          {menuFor === i && (
            <div className="grade-action-menu" ref={menuRef}>
              <button
                className="grade-action-menu-item"
                onClick={() => {
                  const sl = langCode(g.detectedLanguage);
                  const tl = langCode(targetLanguage);
                  const text = encodeURIComponent(g.paragraphText);
                  window.open(
                    `https://translate.google.com/?sl=${sl}&tl=${tl}&text=${text}&op=translate`,
                    "_blank",
                  );
                  setMenuFor(null);
                }}
              >
                <ExternalLink size={12} />
                <span>Open in Google Translate</span>
              </button>
            </div>
          )}

          {g.grade && (
            <div
              className="grade-indicator"
              style={{ color: gradeColor(g.grade) }}
              onMouseEnter={() => setHover(g)}
              onMouseLeave={() => setHover(null)}
            >
              {g.grade}
            </div>
          )}
        </div>
      ))}

      {hover && hover.grade && hover.feedback && (
        <div
          className="grade-tooltip"
          style={{ top: hover.top }}
        >
          <div className="grade-tooltip-grade" style={{ color: gradeColor(hover.grade) }}>
            {hover.grade}
          </div>
          <div className="grade-tooltip-feedback">{hover.feedback}</div>
        </div>
      )}
    </div>
  );
}

/** Build gutter items for every paragraph that has any analysis. */
export function buildGutterItems(
  editorEl: HTMLElement | null,
  analysisMap: Map<string, SegmentAnalysis>,
): GutterItem[] {
  if (!editorEl) return [];

  const items: GutterItem[] = [];
  const editorRect = editorEl.getBoundingClientRect();

  const paragraphs = editorEl.querySelectorAll<HTMLElement>(".editor-content p");
  for (const p of paragraphs) {
    const text = p.textContent?.trim();
    if (!text) continue;

    // Find any analysis that matches this paragraph
    let matched = false;
    for (const [segText, analysis] of analysisMap) {
      if (text.includes(segText)) {
        const pRect = p.getBoundingClientRect();
        items.push({
          grade: analysis.isTargetLanguage ? (analysis.grade ?? null) : null,
          feedback: analysis.isTargetLanguage ? (analysis.gradeFeedback ?? null) : null,
          paragraphText: text,
          detectedLanguage: analysis.detectedLanguage ?? "auto",
          top: pRect.top - editorRect.top,
        });
        matched = true;
        break;
      }
    }

    // Paragraph with no analysis yet — still show the action button
    if (!matched) {
      const pRect = p.getBoundingClientRect();
      items.push({
        grade: null,
        feedback: null,
        paragraphText: text,
        detectedLanguage: "auto",
        top: pRect.top - editorRect.top,
      });
    }
  }

  return items;
}
