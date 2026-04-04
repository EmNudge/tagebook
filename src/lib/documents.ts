import { z } from "zod";

const INDEX_KEY = "tagebook:doc-index";
const DOC_PREFIX = "tagebook:doc:";
const ACTIVE_KEY = "tagebook:active-doc";

const DocMetaSchema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type DocMeta = z.infer<typeof DocMetaSchema>;

function loadIndex(): DocMeta[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    return z.array(DocMetaSchema).parse(JSON.parse(raw));
  } catch {
    return [];
  }
}

function saveIndex(docs: DocMeta[]) {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(docs));
  } catch { /* ignore */ }
}

let docs = loadIndex();
let listeners: Array<() => void> = [];

function notify() {
  for (const l of listeners) l();
}

export function subscribe(listener: () => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

export function getDocs(): DocMeta[] {
  return docs;
}

export function getActiveDocId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function setActiveDocId(id: string) {
  try {
    localStorage.setItem(ACTIVE_KEY, id);
  } catch { /* ignore */ }
}

function todayTitle(): string {
  const d = new Date();
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function createDoc(): DocMeta {
  const now = Date.now();
  const meta: DocMeta = {
    id: `doc-${now}-${Math.random().toString(36).slice(2, 7)}`,
    title: todayTitle(),
    createdAt: now,
    updatedAt: now,
  };
  docs = [meta, ...docs];
  saveIndex(docs);
  saveDocContent(meta.id, "");
  setActiveDocId(meta.id);
  notify();
  return meta;
}

export function updateDocTitle(id: string, title: string) {
  docs = docs.map((d) => (d.id === id ? { ...d, title, updatedAt: Date.now() } : d));
  saveIndex(docs);
  notify();
}

export function deleteDoc(id: string) {
  docs = docs.filter((d) => d.id !== id);
  saveIndex(docs);
  try {
    localStorage.removeItem(DOC_PREFIX + id);
  } catch { /* ignore */ }
  notify();
}

export function loadDocContent(id: string): string {
  try {
    return localStorage.getItem(DOC_PREFIX + id) ?? "";
  } catch {
    return "";
  }
}

export function saveDocContent(id: string, html: string) {
  try {
    localStorage.setItem(DOC_PREFIX + id, html);
  } catch { /* ignore */ }
  // Update timestamp in index
  docs = docs.map((d) => (d.id === id ? { ...d, updatedAt: Date.now() } : d));
  saveIndex(docs);
}

// Migrate old single-doc format if present
export function migrateOldContent(): string | null {
  try {
    const old = localStorage.getItem("tagebook:editor-content");
    if (old) {
      localStorage.removeItem("tagebook:editor-content");
      return old;
    }
  } catch { /* ignore */ }
  return null;
}
