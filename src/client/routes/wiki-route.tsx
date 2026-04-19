import { useCallback, useEffect, useRef, useState } from "react";
import {
  Link,
  redirect,
  useLoaderData,
  useNavigate,
  useRevalidator,
  type LoaderFunctionArgs,
} from "react-router-dom";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";

import { useWikiConfig } from "@/client/wiki-config";
import { getTopicColor, type TopicAliasConfig } from "@/lib/wiki-config";
import type { WikiHeading, WikiNeighbor, WikiPageData } from "@/lib/wiki-shared";
import { ThemeToggle } from "@/components/theme-toggle";

import { fetchJson, isSetupRequiredResponse } from "../api";
import { RouteErrorBoundary } from "../route-error-boundary";

const remarkPlugins = [remarkGfm];
const rehypePlugins = [rehypeHighlight];

// Minimal markdown component overrides — article-body CSS handles typography
const markdownComponents = {
  h1: ({ ...props }) => <h1 className="scroll-mt-20" {...props} />,
  h2: ({ ...props }) => <h2 className="scroll-mt-20" {...props} />,
  h3: ({ ...props }) => <h3 className="scroll-mt-20" {...props} />,
  h4: ({ ...props }) => <h4 className="scroll-mt-20" {...props} />,
};

function normalizeSplatParam(rawSplat: string | undefined) {
  const trimmed = rawSplat?.trim();
  if (!trimmed) throw new Response("Wiki page not found", { status: 404 });
  return trimmed
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function estimateReadingTime(markdown: string) {
  return Math.max(1, Math.round(markdown.trim().split(/\s+/).length / 200));
}

function wordCount(markdown: string) {
  return markdown.trim().split(/\s+/).length;
}

/* ── Category type helper (mirrors homepage-content) ── */
const CAT_TYPES = ["Project", "Knowledge", "Insights", "Tooling"] as const;
type CatType = (typeof CAT_TYPES)[number];

function getCatType(name: string): CatType {
  const n = name.toLowerCase();
  if (n.includes("karpster") || n.includes("project") || n.includes("ripster")) return "Project";
  if (n.includes("io fund") || n.includes("market") || n.includes("research") || n.includes("fund")) return "Knowledge";
  if (n.includes("insight") || n.includes("misc") || n.includes("up next") || n.includes("idea")) return "Insights";
  if (n.includes("tool") || n.includes("automation")) return "Tooling";
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return CAT_TYPES[h % CAT_TYPES.length] as CatType;
}

/* ── Section splitting ── */
interface ParsedLink { label: string; href: string; }

function parseMarkdownLinks(section: string): ParsedLink[] {
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const links: ParsedLink[] = [];
  let match;
  while ((match = linkRegex.exec(section)) !== null) {
    links.push({ label: match[1], href: match[2] });
  }
  return links;
}

function splitContentSections(markdown: string) {
  const relatedMatch = markdown.match(/\n## Related Concepts\n([\s\S]*?)(?=\n## |\s*$)/);
  let mainContent = markdown;
  if (relatedMatch) {
    mainContent = mainContent.replace(`\n## Related Concepts\n${relatedMatch[1]}`, "");
  }
  const sourceMatch = markdown.match(/\n## Source Notes\n([\s\S]*?)(?=\n## |\s*$)/);
  if (sourceMatch) {
    mainContent = mainContent.replace(`\n## Source Notes\n${sourceMatch[1]}`, "");
  }
  return {
    mainContent: mainContent.trimEnd(),
    relatedLinks: relatedMatch ? parseMarkdownLinks(relatedMatch[1]) : [],
  };
}

/* ── Active heading tracker ── */
function useActiveHeading(headings: WikiHeading[]) {
  const [activeId, setActiveId] = useState<string | null>(headings[0]?.id ?? null);

  useEffect(() => {
    if (headings.length === 0) return;

    const handleScroll = () => {
      let current = headings[0]?.id ?? null;
      for (const h of headings) {
        const el = document.getElementById(h.id);
        if (el && el.getBoundingClientRect().top <= 90) current = h.id;
      }
      setActiveId(current);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [headings]);

  return activeId;
}

/* ── Mini Neighborhood Graph (kept from original) ── */
function miniColor(cats: string[], aliases: Record<string, TopicAliasConfig>): string {
  for (const category of cats) return getTopicColor(category, aliases);
  return "#666";
}

interface MiniNode {
  x: number; y: number; slug: string; title: string;
  color: string; size: number; isCenter: boolean;
}

function computeScatteredLayout(
  currentTitle: string,
  currentCategories: string[],
  neighbors: WikiNeighbor[],
  w: number, h: number,
  aliases: Record<string, TopicAliasConfig>,
): MiniNode[] {
  const displayed = neighbors.slice(0, 14);
  const cx = w / 2, cy = h / 2;
  const nodes: MiniNode[] = [];
  nodes.push({ x: cx, y: cy, slug: "", title: currentTitle, color: miniColor(currentCategories, aliases), size: 7, isCenter: true });
  const spread = Math.min(w, h) * 0.38;
  for (let i = 0; i < displayed.length; i++) {
    const n = displayed[i];
    const angle = i * 2.399963 + 0.5;
    const r = spread * (0.4 + 0.6 * Math.sqrt((i + 1) / (displayed.length + 1)));
    const jitter = ((n.title.length * 7 + i * 13) % 20 - 10) * 0.02;
    nodes.push({
      x: cx + Math.cos(angle + jitter) * r,
      y: cy + Math.sin(angle + jitter) * r,
      slug: n.slug, title: n.title,
      color: miniColor(n.categories, aliases),
      size: Math.max(2.5, Math.min(5.5, 2.5 + Math.sqrt(n.backlinkCount) * 0.6)),
      isCenter: false,
    });
  }
  return nodes;
}

function NeighborhoodGraph({
  currentTitle, currentCategories, neighbors, onClickNode, aliases,
}: {
  currentTitle: string; currentCategories: string[];
  neighbors: WikiNeighbor[]; onClickNode: (slug: string) => void;
  aliases: Record<string, TopicAliasConfig>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const layoutRef = useRef<MiniNode[]>([]);
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (w === 0 || h === 0) return;
      canvas.width = w * dpr; canvas.height = h * dpr;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      const nodes = computeScatteredLayout(currentTitle, currentCategories, neighbors, w, h, aliases);
      layoutRef.current = nodes;
      // Use CSS var for background — parse from computed style
      const bg = getComputedStyle(document.documentElement).getPropertyValue("--paper-2").trim() || "#f0f0f0";
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      const center = nodes[0];
      for (let i = 1; i < nodes.length; i++) {
        const n = nodes[i];
        ctx.beginPath();
        ctx.moveTo(center.x, center.y);
        ctx.lineTo(n.x, n.y);
        ctx.strokeStyle = hoveredIdx === i ? "rgba(128,128,128,0.3)" : "rgba(128,128,128,0.12)";
        ctx.lineWidth = hoveredIdx === i ? 1 : 0.5;
        ctx.stroke();
      }
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        const isHovered = hoveredIdx === i;
        const drawSize = isHovered ? n.size * 1.5 : n.size;
        if (isHovered) {
          ctx.beginPath(); ctx.arc(n.x, n.y, drawSize + 4, 0, Math.PI * 2);
          ctx.fillStyle = `${n.color}30`; ctx.fill();
        }
        ctx.beginPath(); ctx.arc(n.x, n.y, drawSize, 0, Math.PI * 2);
        ctx.fillStyle = n.color; ctx.fill();
        if (n.isCenter || isHovered) {
          ctx.font = `${n.isCenter ? "500" : "400"} ${n.isCenter ? 9 : 8}px "Inter", sans-serif`;
          ctx.fillStyle = n.isCenter ? "rgba(128,128,128,0.8)" : "rgba(128,128,128,0.6)";
          ctx.textAlign = "center";
          ctx.fillText(n.title.length > 20 ? n.title.slice(0, 18) + "…" : n.title, n.x, n.y + drawSize + 11);
        }
      }
    };
    draw();
    const observer = new ResizeObserver(() => draw());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [aliases, neighbors, currentCategories, hoveredIdx, dpr, currentTitle]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    let found = -1;
    for (let i = 1; i < layoutRef.current.length; i++) {
      const n = layoutRef.current[i];
      if (Math.sqrt((x - n.x) ** 2 + (y - n.y) ** 2) < 16) { found = i; break; }
    }
    setHoveredIdx(found >= 0 ? found : null);
    canvas.style.cursor = found >= 0 ? "pointer" : "default";
  }, []);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    for (let i = 1; i < layoutRef.current.length; i++) {
      const n = layoutRef.current[i];
      if (Math.sqrt((x - n.x) ** 2 + (y - n.y) ** 2) < 16) { onClickNode(n.slug); return; }
    }
  }, [onClickNode]);

  if (neighbors.length === 0) return null;

  return (
    <div style={{ marginTop: 24 }}>
      <div className="side-head">Connections</div>
      <div style={{ borderRadius: 8, overflow: "hidden", border: "1px solid var(--rule)" }}>
        <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: 180 }}
          onMouseMove={handleMouseMove} onClick={handleClick}
          onMouseLeave={() => setHoveredIdx(null)} />
      </div>
      {neighbors.length > 14 && (
        <p style={{ marginTop: 6, textAlign: "center", fontSize: 10, color: "var(--ink-3)", fontFamily: "var(--mono)" }}>
          +{neighbors.length - 14} more
        </p>
      )}
    </div>
  );
}

/* ── Loader ── */
export async function loader({ params }: LoaderFunctionArgs) {
  const slug = normalizeSplatParam(params["*"]);
  try {
    return await fetchJson<WikiPageData>(`/api/wiki/${slug}`);
  } catch (error) {
    if (isSetupRequiredResponse(error)) throw redirect("/setup");
    throw error;
  }
}

/* ── Main Component ── */
export function Component() {
  const page = useLoaderData() as WikiPageData;
  const config = useWikiConfig();
  const navigate = useNavigate();
  const { revalidate, state: revalidationState } = useRevalidator();
  const pageRehypePlugins = page.hasCodeBlocks ? rehypePlugins : [];
  const filteredHeadings = page.headings.filter((h) => h.text !== "Source Notes");
  const activeId = useActiveHeading(filteredHeadings);
  const [personOverrideError, setPersonOverrideError] = useState<string | null>(null);
  const [isUpdatingPerson, setIsUpdatingPerson] = useState(false);

  useEffect(() => { window.scrollTo(0, 0); }, [page.slug]);

  const readTime = estimateReadingTime(page.contentMarkdown);
  const words = wordCount(page.contentMarkdown);
  const { mainContent, relatedLinks } = splitContentSections(page.contentMarkdown);
  const peopleControlsEnabled = config.people.mode !== "off";
  const personActionBusy = isUpdatingPerson || revalidationState === "loading";
  const catType = getCatType(page.categories?.[0] ?? "");

  const personPrimaryLabel =
    page.personOverride === "not-person" || (!page.isPerson && page.personOverride === null)
      ? "Mark as person" : "Mark as not person";
  const personPrimaryTarget = personPrimaryLabel === "Mark as person" ? "person" : "not-person";

  async function updatePersonOverride(nextOverride: "person" | "not-person" | null) {
    setIsUpdatingPerson(true);
    setPersonOverrideError(null);
    try {
      const response = await fetch("/api/setup/person-override", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ file: page.fileName, override: nextOverride }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Could not update person override");
      revalidate();
    } catch (error) {
      setPersonOverrideError(error instanceof Error ? error.message : "Could not update person override");
    } finally {
      setIsUpdatingPerson(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Topbar — simple version for article page */}
      <div className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand">
            <span className="brand-mark" />
            <div>
              <div className="brand-name">{config.siteTitle}</div>
              <div className="brand-sub">Wiki</div>
            </div>
          </Link>
          <div style={{ flex: 1 }} />
          <div className="top-meta">
            <Link to="/" style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-3)", textDecoration: "none", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              ← Home
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </div>

      {/* Article shell */}
      <main className="article-shell flex-1">
        {/* Main column */}
        <div>
          {/* Breadcrumb */}
          <nav className="breadcrumb">
            <Link to="/">Home</Link>
            <span style={{ color: "var(--rule)" }}>/</span>
            <span style={{ color: "var(--ink)" }}>{page.title}</span>
          </nav>

          {/* Title */}
          <h1 style={{ fontFamily: "var(--serif)", fontSize: "clamp(28px,5vw,48px)", fontWeight: 500, letterSpacing: "-0.025em", lineHeight: 1.05, color: "var(--ink)", margin: "0 0 16px" }}>
            {page.title}
          </h1>

          {/* Meta bar */}
          <div className="article-meta">
            <span className="cat-pill" data-cat={catType}>{catType}</span>
            <span className="article-meta-sep">·</span>
            <span>{readTime} min read</span>
            <span className="article-meta-sep">·</span>
            <span>{words.toLocaleString()} words</span>
            {page.modifiedAt > 0 && (
              <>
                <span className="article-meta-sep">·</span>
                <span>{formatDate(page.modifiedAt)}</span>
              </>
            )}
            {peopleControlsEnabled && (
              <>
                <span className="article-meta-sep">·</span>
                <button
                  type="button"
                  onClick={() => void updatePersonOverride(personPrimaryTarget)}
                  disabled={personActionBusy}
                  style={{ fontFamily: "var(--mono)", fontSize: 11, background: "none", border: "none", padding: 0, color: "var(--ink-3)", cursor: personActionBusy ? "wait" : "pointer", textDecoration: "underline" }}
                >
                  {personActionBusy ? "Saving…" : personPrimaryLabel}
                </button>
                {page.personOverride !== null && (
                  <>
                    <span className="article-meta-sep">·</span>
                    <button
                      type="button"
                      onClick={() => void updatePersonOverride(null)}
                      disabled={personActionBusy}
                      style={{ fontFamily: "var(--mono)", fontSize: 11, background: "none", border: "none", padding: 0, color: "var(--ink-3)", cursor: personActionBusy ? "wait" : "pointer", textDecoration: "underline" }}
                    >
                      Clear override
                    </button>
                  </>
                )}
                {personOverrideError && (
                  <span style={{ color: "oklch(0.55 0.2 25)" }}>{personOverrideError}</span>
                )}
              </>
            )}
          </div>

          {/* Article body */}
          <article className="article-body">
            <ReactMarkdown
              rehypePlugins={pageRehypePlugins}
              remarkPlugins={remarkPlugins}
              components={markdownComponents}
            >
              {mainContent}
            </ReactMarkdown>
          </article>

          {/* Related Concepts */}
          {relatedLinks.length > 0 && (
            <section style={{ marginTop: 40, paddingTop: 24, borderTop: "1px solid var(--rule)" }}>
              <p className="side-head">Related Concepts</p>
              <div className="tag-cloud" style={{ marginTop: 12 }}>
                {relatedLinks.map((link) => (
                  <Link key={link.href} to={link.href} className="tag">
                    {link.label}
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Sidebar */}
        <aside className="article-side">
          {filteredHeadings.length > 0 && (
            <div style={{ position: "sticky", top: 80 }}>
              <div className="side-head">On this page</div>
              {filteredHeadings.map((h) => (
                <a
                  key={h.id}
                  href={`#${h.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    document.getElementById(h.id)?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className={`side-link ${h.level >= 3 ? "indent" : ""} ${activeId === h.id ? "active" : ""}`}
                >
                  {h.text}
                </a>
              ))}

              {page.neighbors.length > 0 && (
                <NeighborhoodGraph
                  currentTitle={page.title}
                  currentCategories={page.categories}
                  neighbors={page.neighbors}
                  onClickNode={(slug) => navigate(`/wiki/${slug}`)}
                  aliases={config.categories.aliases}
                />
              )}
            </div>
          )}
        </aside>
      </main>

      <footer className="footer">
        {config.siteTitle}
      </footer>
    </div>
  );
}

export const ErrorBoundary = RouteErrorBoundary;
