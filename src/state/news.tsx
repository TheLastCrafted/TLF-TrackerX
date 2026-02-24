import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

import type { NewsArticle } from "../data/news";

type NewsContextValue = {
  byId: Record<string, NewsArticle>;
  saveMany: (articles: NewsArticle[]) => void;
  getById: (id: string) => NewsArticle | undefined;
};

const NewsContext = createContext<NewsContextValue | null>(null);

export function NewsProvider(props: { children: ReactNode }) {
  const [byId, setById] = useState<Record<string, NewsArticle>>({});

  const value = useMemo<NewsContextValue>(() => {
    return {
      byId,
      saveMany: (articles) => {
        setById((prev) => {
          const next = { ...prev };
          for (const row of articles) next[row.id] = row;
          return next;
        });
      },
      getById: (id) => byId[id],
    };
  }, [byId]);

  return <NewsContext.Provider value={value}>{props.children}</NewsContext.Provider>;
}

export function useNewsStore() {
  const ctx = useContext(NewsContext);
  if (!ctx) throw new Error("useNewsStore must be used inside NewsProvider");
  return ctx;
}

