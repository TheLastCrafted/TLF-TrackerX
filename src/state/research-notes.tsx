import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type ResearchNote = {
  id: string;
  symbol: string;
  title: string;
  body: string;
  createdAt: number;
};

type ResearchNotesContextValue = {
  notes: ResearchNote[];
  addNote: (input: { symbol: string; title: string; body: string }) => void;
  removeNote: (id: string) => void;
};

const ResearchNotesContext = createContext<ResearchNotesContextValue | null>(null);

let noteSeq = 1;
function nextNoteId() {
  noteSeq += 1;
  return `note_${noteSeq}`;
}

export function ResearchNotesProvider(props: { children: ReactNode }) {
  const [notes, setNotes] = useState<ResearchNote[]>([]);

  const value = useMemo<ResearchNotesContextValue>(() => {
    return {
      notes,
      addNote: (input) => {
        if (!input.symbol.trim() || !input.title.trim() || !input.body.trim()) return;
        setNotes((prev) => [
          {
            id: nextNoteId(),
            symbol: input.symbol.trim().toUpperCase(),
            title: input.title.trim(),
            body: input.body.trim(),
            createdAt: Date.now(),
          },
          ...prev,
        ]);
      },
      removeNote: (id) => {
        setNotes((prev) => prev.filter((row) => row.id !== id));
      },
    };
  }, [notes]);

  return <ResearchNotesContext.Provider value={value}>{props.children}</ResearchNotesContext.Provider>;
}

export function useResearchNotes() {
  const ctx = useContext(ResearchNotesContext);
  if (!ctx) throw new Error("useResearchNotes must be used inside ResearchNotesProvider");
  return ctx;
}

