import { useEffect, useRef, useState, useLayoutEffect, useCallback } from "react";
import {
  getSavedPhrases,
  removeSavedPhrase,
  subscribe,
  type SavedPhrase,
  type WordBreakdown,
} from "../lib/saved-phrases";
import { X, BookmarkCheck, MoreHorizontal, ExternalLink } from "lucide-react";

const LANG_CODES: Record<string, string> = {
  German: "de", Spanish: "es", French: "fr", Italian: "it",
  Portuguese: "pt", Dutch: "nl", Russian: "ru", Japanese: "ja",
  Korean: "ko", "Mandarin Chinese": "zh-CN", Arabic: "ar",
  Hindi: "hi", Turkish: "tr", Polish: "pl", Swedish: "sv",
  Greek: "el", Hebrew: "iw", Vietnamese: "vi", Thai: "th",
  Indonesian: "id", English: "en",
};

interface HoverTip {
  phrase: string;
  definition: string;
  partOfSpeech: string;
  wordBreakdown?: WordBreakdown[];
  x: number;
  y: number;
}

export function SavedPhrases() {
  const [phrases, setPhrases] = useState<SavedPhrase[]>(getSavedPhrases);
  const [newestId, setNewestId] = useState<string | null>(null);
  const [hoverTip, setHoverTip] = useState<HoverTip | null>(null);
  const prevLengthRef = useRef(phrases.length);
  const prevLatestIdRef = useRef<string | null>(phrases[0]?.id ?? null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rectsRef = useRef(new Map<string, DOMRect>());

  const captureRects = useCallback(() => {
    const map = new Map<string, DOMRect>();
    if (!containerRef.current) return map;
    const items = containerRef.current.querySelectorAll<HTMLElement>("[data-phrase-id]");
    for (const el of items) {
      map.set(el.dataset.phraseId!, el.getBoundingClientRect());
    }
    return map;
  }, []);

  useEffect(() => {
    return subscribe(() => {
      rectsRef.current = captureRects();
      setPhrases([...getSavedPhrases()]);
    });
  }, [captureRects]);

  useEffect(() => {
    if (phrases.length > prevLengthRef.current && phrases.length > 0) {
      setNewestId(phrases[0].id);
      const timer = setTimeout(() => setNewestId(null), 1200);
      prevLengthRef.current = phrases.length;
      return () => clearTimeout(timer);
    }
    prevLengthRef.current = phrases.length;
  }, [phrases]);

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const oldRects = rectsRef.current;
    if (oldRects.size === 0) {
      prevLatestIdRef.current = phrases[0]?.id ?? null;
      return;
    }

    const demotedId = prevLatestIdRef.current;
    prevLatestIdRef.current = phrases[0]?.id ?? null;

    const items = containerRef.current.querySelectorAll<HTMLElement>("[data-phrase-id]");
    for (const el of items) {
      const id = el.dataset.phraseId!;
      const oldRect = oldRects.get(id);
      const newRect = el.getBoundingClientRect();

      if (!oldRect) {
        // New item — slide in from above
        el.animate(
          [
            { opacity: 0, transform: "translateY(-20px) scale(0.97)" },
            { opacity: 1, transform: "translateY(0) scale(1)" },
          ],
          { duration: 350, easing: "cubic-bezier(0.2, 0, 0, 1)", fill: "backwards" },
        );
        continue;
      }

      // Item demoted from latest card → collapsed row: slide down + collapse height
      if (id === demotedId && id !== phrases[0]?.id) {
        const dy = oldRect.top - newRect.top;
        const oldH = oldRect.height;
        const newH = newRect.height;

        // Temporarily unclip the stack so the taller starting height is visible
        const stack = el.closest<HTMLElement>(".saved-phrases-stack");
        if (stack) {
          stack.style.overflow = "visible";
          const anim = el.animate(
            [
              {
                transform: `translateY(${dy}px)`,
                height: `${oldH}px`,
                overflow: "hidden",
              },
              {
                transform: "translateY(0)",
                height: `${newH}px`,
                overflow: "hidden",
              },
            ],
            { duration: 300, easing: "cubic-bezier(0.2, 0, 0, 1)" },
          );
          anim.onfinish = () => {
            stack.style.overflow = "";
          };
        }
        continue;
      }

      // Existing stack items — FLIP slide
      const dy = oldRect.top - newRect.top;
      if (Math.abs(dy) < 1) continue;

      el.animate(
        [
          { transform: `translateY(${dy}px)` },
          { transform: "translateY(0)" },
        ],
        { duration: 300, easing: "cubic-bezier(0.2, 0, 0, 1)" },
      );
    }

    rectsRef.current = new Map();
  }, [phrases]);

  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [tipVisible, setTipVisible] = useState(false);
  const [menuForId, setMenuForId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (menuForId === null) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && e.target instanceof Node && !menuRef.current.contains(e.target)) {
        setMenuForId(null);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuForId]);

  if (phrases.length === 0) {
    return (
      <div className="saved-phrases-empty">
        <BookmarkCheck size={20} />
        <p>Click a definition and tap the bookmark to save phrases here</p>
      </div>
    );
  }

  const showTip = (p: SavedPhrase, el: HTMLElement) => {
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    const rect = el.getBoundingClientRect();
    const newY = rect.top + rect.height / 2;

    // FLIP: capture old position before update
    const tipEl = tipRef.current;
    const oldY = tipEl ? tipEl.getBoundingClientRect().top + tipEl.getBoundingClientRect().height / 2 : null;

    setHoverTip({
      phrase: p.phrase,
      definition: p.definition,
      partOfSpeech: p.partOfSpeech,
      wordBreakdown: p.wordBreakdown,
      x: rect.left,
      y: newY,
    });
    setTipVisible(true);

    // FLIP: animate from old Y to new Y
    if (oldY !== null && tipEl && tipVisible) {
      const dy = oldY - newY;
      if (Math.abs(dy) > 1) {
        tipEl.animate(
          [
            { transform: `translate(-100%, -50%) translateY(${dy}px)` },
            { transform: "translate(-100%, -50%) translateY(0)" },
          ],
          { duration: 200, easing: "cubic-bezier(0.2, 0, 0, 1)" },
        );
      }
    }
  };

  const scheduleHideTip = () => {
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    hideTimeoutRef.current = setTimeout(() => {
      setTipVisible(false);
      setHoverTip(null);
    }, 150);
  };

  const cancelHideTip = () => {
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
  };

  const openInTranslate = (p: SavedPhrase) => {
    const sl = LANG_CODES[p.language] ?? "auto";
    const text = encodeURIComponent(p.phrase);
    window.open(
      `https://translate.google.com/?sl=${sl}&tl=en&text=${text}&op=translate`,
      "_blank",
    );
    setMenuForId(null);
  };

  const renderMenu = (p: SavedPhrase) => (
    <div className="saved-phrase-actions">
      <button
        className="saved-phrase-menu-btn"
        onClick={(e) => {
          e.stopPropagation();
          setMenuForId(menuForId === p.id ? null : p.id);
        }}
      >
        <MoreHorizontal size={12} />
      </button>
      {menuForId === p.id && (
        <div className="saved-phrase-menu" ref={menuRef}>
          <button
            className="saved-phrase-menu-item"
            onClick={() => openInTranslate(p)}
          >
            <ExternalLink size={12} />
            <span>Open in Google Translate</span>
          </button>
        </div>
      )}
    </div>
  );

  const [latest, ...rest] = phrases;

  return (
    <div className="saved-phrases" ref={containerRef}>
      <div className="saved-phrases-header">
        <BookmarkCheck size={14} />
        <span>Saved Phrases</span>
        <span className="saved-phrases-count">{phrases.length}</span>
      </div>

      <div
        data-phrase-id={latest.id}
        className={`saved-phrase-item saved-phrase-latest ${newestId === latest.id ? "saved-phrase-glow" : ""}`}
        onMouseEnter={(e) => showTip(latest, e.currentTarget)}
        onMouseLeave={scheduleHideTip}
      >
        <div className="saved-phrase-top">
          <span className="saved-phrase-text">{latest.phrase}</span>
          {latest.partOfSpeech && (
            <span className="saved-phrase-pos">{latest.partOfSpeech}</span>
          )}
          {renderMenu(latest)}
          <button
            className="saved-phrase-remove"
            onClick={() => removeSavedPhrase(latest.id)}
            title="Remove"
          >
            <X size={12} />
          </button>
        </div>
        <div className="saved-phrase-def">{latest.definition}</div>
      </div>

      {rest.length > 0 && (
        <div className="saved-phrases-stack">
          {rest.map((p) => (
            <div
              key={p.id}
              data-phrase-id={p.id}
              className="saved-phrase-collapsed"
              onMouseEnter={(e) => showTip(p, e.currentTarget)}
              onMouseLeave={scheduleHideTip}
            >
              <span className="saved-phrase-text">{p.phrase}</span>
              {p.partOfSpeech && (
                <span className="saved-phrase-pos">{p.partOfSpeech}</span>
              )}
              {renderMenu(p)}
              <button
                className="saved-phrase-remove"
                onClick={() => removeSavedPhrase(p.id)}
                title="Remove"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {hoverTip && (
        <div
          ref={tipRef}
          className="saved-phrase-tooltip"
          style={{ top: hoverTip.y, left: hoverTip.x }}
          onMouseEnter={cancelHideTip}
          onMouseLeave={scheduleHideTip}
        >
          {hoverTip.wordBreakdown && hoverTip.wordBreakdown.length > 0 ? (
            <div className="saved-phrase-tooltip-words">
              {hoverTip.wordBreakdown.map((w, i) => (
                <span key={i} className="saved-phrase-tooltip-word-hover" data-meaning={w.meaning}>
                  {w.word}
                </span>
              ))}
            </div>
          ) : (
            <div className="saved-phrase-tooltip-phrase">{hoverTip.phrase}</div>
          )}
          {hoverTip.partOfSpeech && (
            <div className="saved-phrase-tooltip-pos">{hoverTip.partOfSpeech}</div>
          )}
          <div className="saved-phrase-tooltip-def">{hoverTip.definition}</div>
        </div>
      )}
    </div>
  );
}
