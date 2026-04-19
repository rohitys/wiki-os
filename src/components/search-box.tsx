import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { RefreshCw } from "lucide-react";
import { Link, useRevalidator } from "react-router-dom";

import { useWikiConfig } from "@/client/wiki-config";
import { HighlightedText, buildHighlightQuery } from "@/components/highlighted-text";
import { slugFromFileName, titleFromFileName, type SearchResult, type PageSummary } from "@/lib/wiki-shared";
import { ThemeToggle } from "@/components/theme-toggle";

export interface TopicBrowseState {
  name: string;
  emoji: string;
  pages: PageSummary[];
}

export function SearchBox({
  totalPages,
  children,
}: {
  totalPages: number;
  children: ReactNode;
}) {
  const config = useWikiConfig();
  const { revalidate, state: revalidationState } = useRevalidator();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const deferredQuery = useDeferredValue(query);
  const highlight = useMemo(() => buildHighlightQuery(deferredQuery), [deferredQuery]);

  useEffect(() => {
    const trimmedQuery = deferredQuery.trim();
    if (!trimmedQuery) {
      abortRef.current?.abort();
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(trimmedQuery)}`, {
          signal: controller.signal,
        });
        const data = (await response.json()) as { error?: string; results?: SearchResult[] };
        if (!response.ok) throw new Error(data.error ?? "Search failed");
        if (!controller.signal.aborted) {
          startTransition(() => {
            setResults(data.results ?? []);
            setIsSearching(false);
            setSearchError(null);
          });
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!controller.signal.aborted) {
          setIsSearching(false);
          setSearchError(error instanceof Error ? error.message : "Search failed");
        }
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [deferredQuery]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
  };

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setIsSearching(value.trim().length > 0);
    setSearchError(null);
    if (!value.trim()) setResults(null);
  };

  const resetSearch = () => {
    setQuery("");
    setResults(null);
    setIsSearching(false);
    setSearchError(null);
    abortRef.current?.abort();
    inputRef.current?.focus();
  };

  const isRevalidating = revalidationState === "loading";
  const refreshBusy = isRefreshing || isRevalidating;
  const hasQuery = query.trim().length > 0;

  const handleRefresh = async () => {
    if (refreshBusy) return;
    setIsRefreshing(true);
    try {
      const response = await fetch("/api/admin/reindex", { method: "POST" });
      if (!response.ok) throw new Error("Manual reindex unavailable");
      revalidate();
    } catch {
      revalidate();
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      {/* Sticky topbar */}
      <div className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand" onClick={hasQuery ? (e) => { e.preventDefault(); resetSearch(); } : undefined}>
            <span className="brand-mark" />
            <div>
              <div className="brand-name">{config.siteTitle}</div>
              <div className="brand-sub">Wiki</div>
            </div>
          </Link>

          {/* Inline search */}
          <div className="top-search">
            <form onSubmit={handleSubmit}>
              <svg className="top-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                placeholder={config.searchPlaceholder}
                className="top-search-input"
              />
            </form>
          </div>

          {/* Right: page count + refresh + theme toggle */}
          <div className="top-meta">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshBusy}
              title="Refresh wiki index"
              className="top-meta-stat"
              style={{ background: "none", border: "none", padding: 0, cursor: refreshBusy ? "wait" : "pointer" }}
            >
              <RefreshCw
                style={{ width: 13, height: 13, marginRight: 5 }}
                className={refreshBusy ? "animate-spin" : ""}
              />
              <strong>{totalPages.toLocaleString()}</strong>
              <span>pages</span>
            </button>
            <ThemeToggle />
          </div>
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1">
        {hasQuery ? (
          <div className="shell">
            <div className="search-results">
              <p className="section-title" style={{ marginBottom: 0 }}>
                {isSearching ? "Searching…" : results ? `${results.length} result${results.length !== 1 ? "s" : ""}` : "Search"}
              </p>
              {isSearching ? (
                <div style={{ paddingTop: 24 }}>
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="search-result-item" style={{ opacity: 0.5 }}>
                      <div style={{ height: 18, width: "40%", background: "var(--paper-3)", borderRadius: 4, marginBottom: 8 }} />
                      <div style={{ height: 13, width: "80%", background: "var(--paper-3)", borderRadius: 4 }} />
                    </div>
                  ))}
                </div>
              ) : searchError ? (
                <p style={{ paddingTop: 24, fontSize: 14, color: "var(--ink-3)" }}>
                  Search unavailable. Please try again.
                </p>
              ) : results && results.length === 0 ? (
                <p style={{ paddingTop: 24, fontSize: 14, color: "var(--ink-3)" }}>
                  No results for <strong style={{ color: "var(--ink)" }}>{query}</strong>
                </p>
              ) : results ? (
                results.map((result) => {
                  const title = titleFromFileName(result.file);
                  const slug = slugFromFileName(result.file);
                  return (
                    <Link key={result.file} to={`/wiki/${slug}`} className="search-result-item">
                      <div className="search-result-title">{title}</div>
                      {result.matches.length > 0 && (
                        <div className="hit-context">
                          <HighlightedText highlight={highlight} text={result.matches[0].snippet} />
                        </div>
                      )}
                    </Link>
                  );
                })
              ) : null}
            </div>
          </div>
        ) : (
          children
        )}
      </main>

      <footer className="footer">
        {config.siteTitle} · {totalPages} pages
      </footer>
    </div>
  );
}
