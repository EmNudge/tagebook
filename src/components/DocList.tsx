import { useEffect, useState } from "react";
import { getDocs, createDoc, deleteDoc, subscribe, type DocMeta } from "../lib/documents";
import { Plus, Trash2, FileText } from "lucide-react";

interface DocListProps {
  activeId: string | null;
  onSelect: (id: string) => void;
}

export function DocList({ activeId, onSelect }: DocListProps) {
  const [docs, setDocs] = useState<DocMeta[]>(getDocs);

  useEffect(() => {
    return subscribe(() => setDocs([...getDocs()]));
  }, []);

  return (
    <div className="doc-list">
      <button
        className="doc-list-new"
        onClick={() => {
          const doc = createDoc();
          onSelect(doc.id);
        }}
      >
        <Plus size={14} />
        <span>New Document</span>
      </button>
      <div className="doc-list-items">
        {docs.map((d) => (
          <div
            key={d.id}
            className={`doc-list-item ${d.id === activeId ? "active" : ""}`}
            onClick={() => onSelect(d.id)}
          >
            <FileText size={13} />
            <span className="doc-list-title">{d.title || "Untitled"}</span>
            <button
              className="doc-list-delete"
              onClick={(e) => {
                e.stopPropagation();
                deleteDoc(d.id);
              }}
              title="Delete"
            >
              <Trash2 size={11} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
