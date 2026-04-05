import { useEffect, useRef, useState } from "react";
import { Bookmark } from "lucide-react";
import { isSaved, removeSavedPhraseByContent } from "../lib/saved-phrases";

interface TooltipData {
  type: "definition" | "grammar";
  phrase?: string;
  definition?: string;
  partOfSpeech?: string;
  correction?: string;
  explanation?: string;
  x: number;
  y: number;
}

interface TranslationTooltipProps {
  language: string;
  onSave?: (phrase: string, definition: string, partOfSpeech: string) => void;
}

export function TranslationTooltip({ language, onSave }: TranslationTooltipProps) {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [saved, setSaved] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null);
  const hideLockRef = useRef(false);

  // Sync local saved state whenever tooltip changes (new phrase hovered)
  useEffect(() => {
    if (tooltip?.type === "definition" && tooltip.definition) {
      setSaved(isSaved(tooltip.definition, language));
    }
  }, [tooltip, language]);

  useEffect(() => {
    function show(data: TooltipData) {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
      setTooltip(data);
    }

    function scheduleHide() {
      if (hideLockRef.current) return;
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = setTimeout(() => setTooltip(null), 150);
    }

    /** Pick tooltip X near the mouse, using client rects for wrapped elements. */
    function tooltipX(el: HTMLElement, mouseX: number): number {
      const rects = el.getClientRects();
      if (rects.length <= 1) {
        const r = el.getBoundingClientRect();
        return r.left + r.width / 2;
      }
      // Find the rect closest to the mouse
      let best = rects[0];
      let bestDist = Infinity;
      for (const r of rects) {
        const cx = r.left + r.width / 2;
        const d = Math.abs(mouseX - cx);
        if (d < bestDist) {
          bestDist = d;
          best = r;
        }
      }
      return best.left + best.width / 2;
    }

    function tooltipY(el: HTMLElement, mouseX: number): number {
      const rects = el.getClientRects();
      if (rects.length <= 1) {
        return el.getBoundingClientRect().top;
      }
      let best = rects[0];
      let bestDist = Infinity;
      for (const r of rects) {
        const cx = r.left + r.width / 2;
        const d = Math.abs(mouseX - cx);
        if (d < bestDist) {
          bestDist = d;
          best = r;
        }
      }
      return best.top;
    }

    function onMouseOver(e: MouseEvent) {
      if (!(e.target instanceof HTMLElement)) return;
      const target = e.target;

      if (tooltipRef.current?.contains(target)) {
        if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
        return;
      }

      const defEl = target.closest?.(".definition-mark");
      if (defEl instanceof HTMLElement) {
        show({
          type: "definition",
          phrase: defEl.textContent ?? "",
          definition: defEl.dataset.definition ?? "",
          partOfSpeech: defEl.dataset.pos ?? "",
          x: tooltipX(defEl, e.clientX),
          y: tooltipY(defEl, e.clientX),
        });
        return;
      }

      const gramEl = target.closest?.(".grammar-mark");
      if (gramEl instanceof HTMLElement) {
        show({
          type: "grammar",
          phrase: gramEl.textContent ?? "",
          correction: gramEl.dataset.correction ?? "",
          explanation: gramEl.dataset.explanation ?? "",
          x: tooltipX(gramEl, e.clientX),
          y: tooltipY(gramEl, e.clientX),
        });
        return;
      }
    }

    function onMouseOut(e: MouseEvent) {
      if (!(e.target instanceof HTMLElement)) return;
      const target = e.target;
      const related = e.relatedTarget instanceof HTMLElement ? e.relatedTarget : null;

      if (related && tooltipRef.current?.contains(related)) return;

      if (
        tooltipRef.current?.contains(target) &&
        related?.closest?.(".definition-mark,.grammar-mark")
      ) {
        return;
      }

      if (
        target.closest?.(".definition-mark") ||
        target.closest?.(".grammar-mark") ||
        tooltipRef.current?.contains(target)
      ) {
        scheduleHide();
      }
    }

    document.addEventListener("mouseover", onMouseOver);
    document.addEventListener("mouseout", onMouseOut);
    return () => {
      document.removeEventListener("mouseover", onMouseOver);
      document.removeEventListener("mouseout", onMouseOut);
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, []);

  if (!tooltip) return null;

  const isDefinition = tooltip.type === "definition";

  return (
    <div
      ref={tooltipRef}
      className={`annotation-tooltip ${tooltip.type === "grammar" ? "annotation-tooltip--grammar" : ""}`}
      style={{ left: tooltip.x, top: tooltip.y }}
    >
      {isDefinition && onSave && (
        <button
          className={`annotation-tooltip-save ${saved ? "saved" : ""}`}
          onMouseDown={() => {
            hideLockRef.current = true;
            if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
          }}
          onClick={() => {
            const next = !saved;
            if (next) {
              onSave(tooltip.definition ?? "", tooltip.phrase ?? "", tooltip.partOfSpeech ?? "");
            } else {
              removeSavedPhraseByContent(tooltip.definition ?? "", language);
            }
            setSaved(next);
            requestAnimationFrame(() => {
              hideLockRef.current = false;
            });
          }}
          title={saved ? "Remove from saved" : "Save phrase"}
        >
          <Bookmark size={12} />
        </button>
      )}

      {isDefinition && (
        <>
          {tooltip.partOfSpeech && (
            <div className="annotation-tooltip-pos">{tooltip.partOfSpeech}</div>
          )}
          <div className="annotation-tooltip-text">{tooltip.definition}</div>
        </>
      )}
      {tooltip.type === "grammar" && (
        <>
          <div className="annotation-tooltip-correction">{tooltip.correction}</div>
          <div className="annotation-tooltip-explanation">{tooltip.explanation}</div>
        </>
      )}
    </div>
  );
}
