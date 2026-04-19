import { useState } from "react";
import { Link } from "react-router-dom";

import { useWikiConfig } from "@/client/wiki-config";
import { type HomepageData, type PageSummary } from "@/lib/wiki-shared";

/* ── Category → design type mapping ── */
const CAT_TYPES = ["Project", "Knowledge", "Insights", "Tooling"] as const;
type CatType = (typeof CAT_TYPES)[number];

function getCatType(name: string): CatType {
  const n = name.toLowerCase();
  if (n.includes("karpster") || n.includes("project") || n.includes("ripster")) return "Project";
  if (n.includes("io fund") || n.includes("market") || n.includes("research") || n.includes("fund")) return "Knowledge";
  if (n.includes("insight") || n.includes("misc") || n.includes("up next") || n.includes("idea")) return "Insights";
  if (n.includes("tool") || n.includes("automation")) return "Tooling";
  // fallback: deterministic hash
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return CAT_TYPES[h % CAT_TYPES.length] as CatType;
}

// Derive category type from file path (e.g. "Karpster/foo.md" → "Project")
function getCatTypeFromFile(file: string): CatType {
  const folder = file.split("/")[0] ?? "";
  return getCatType(folder);
}

/* ── WikiCard ── */
function WikiCard({ page, catType }: { page: PageSummary; catType: CatType }) {
  return (
    <Link to={`/wiki/${page.slug}`} className="card" data-cat={catType}>
      <div className="card-bar" />
      <div className="card-title">{page.title}</div>
      {page.summary && <div className="card-summary">{page.summary}</div>}
      <div className="card-meta">
        <span className="cat-pill" data-cat={catType}>{catType}</span>
        {page.wordCount > 0 && <span>{page.wordCount.toLocaleString()} words</span>}
        {page.backlinkCount > 0 && <span>{page.backlinkCount} links</span>}
      </div>
    </Link>
  );
}

/* ── Main component ── */
export function HomepageContent({ homepage }: { homepage: HomepageData }) {
  const config = useWikiConfig();
  const [activeFilter, setActiveFilter] = useState<CatType | "All">("All");

  // Assign category types to pages for filtering (derived from file path)
  const featuredWithCat = homepage.featured.map((p) => ({
    page: p,
    catType: getCatTypeFromFile(p.file),
  }));
  const recentWithCat = homepage.recentPages.map((p) => ({
    page: p,
    catType: getCatTypeFromFile(p.file),
  }));

  // Build filter-chip list from the cat types actually present in displayed pages
  // (preserve CAT_TYPES canonical order so chips don't reorder as data shifts)
  const presentCatTypes = new Set<CatType>([
    ...featuredWithCat.map((p) => p.catType),
    ...recentWithCat.map((p) => p.catType),
  ]);
  const catTypes: CatType[] = CAT_TYPES.filter((t) => presentCatTypes.has(t));

  const filteredFeatured = activeFilter === "All"
    ? featuredWithCat
    : featuredWithCat.filter((p) => p.catType === activeFilter);
  const filteredRecent = activeFilter === "All"
    ? recentWithCat
    : recentWithCat.filter((p) => p.catType === activeFilter);

  const totalWords = homepage.totalWords ?? 0;
  const totalCategories = homepage.categories?.length ?? 0;

  return (
    <div className="shell">
      {/* Hero */}
      <section className="home-hero">
        <h1>
          {config.siteTitle.split(" ")[0]}
          {" "}
          <em>{config.siteTitle.split(" ").slice(1).join(" ")}</em>
        </h1>
        <p className="hero-tagline">{config.tagline}</p>
        <div className="hero-stats">
          <div className="hero-stat">
            <span className="hero-stat-val">{homepage.totalPages.toLocaleString()}</span>
            <span className="hero-stat-lbl">Pages</span>
          </div>
          {totalWords > 0 && (
            <div className="hero-stat">
              <span className="hero-stat-val">{Math.round(totalWords / 1000)}K</span>
              <span className="hero-stat-lbl">Words</span>
            </div>
          )}
          {totalCategories > 0 && (
            <div className="hero-stat">
              <span className="hero-stat-val">{totalCategories}</span>
              <span className="hero-stat-lbl">Sections</span>
            </div>
          )}
          {(config.homepage.customStats ?? []).map((stat) => (
            <div key={stat.label} className="hero-stat">
              <span className="hero-stat-val">{stat.value}</span>
              <span className="hero-stat-lbl">{stat.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Featured */}
      {filteredFeatured.length > 0 && (
        <section className="section">
          <div className="filter-row">
            <p className="section-title" style={{ marginBottom: 0 }}>
              {config.homepage.labels.featured ?? "Featured"}
            </p>
            <div style={{ flex: 1 }} />
            <button
              type="button"
              className={`chip ${activeFilter === "All" ? "active" : ""}`}
              onClick={() => setActiveFilter("All")}
            >
              All
            </button>
            {catTypes.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`chip ${activeFilter === cat ? "active" : ""}`}
                onClick={() => setActiveFilter(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
          <div className="grid-2">
            {filteredFeatured.map(({ page, catType }) => (
              <WikiCard key={page.file} page={page} catType={catType} />
            ))}
          </div>
        </section>
      )}

      {/* Recently Added */}
      {filteredRecent.length > 0 && (
        <section className="section">
          <p className="section-title">
            {config.homepage.labels.recentPages ?? "Recently Added"}
          </p>
          <div className="grid-3">
            {filteredRecent.slice(0, 9).map(({ page, catType }) => (
              <WikiCard key={page.file} page={page} catType={catType} />
            ))}
          </div>
        </section>
      )}

      {/* Top Connected — tag cloud */}
      {homepage.topConnected.length > 0 && (
        <section className="section">
          <p className="section-title">
            {config.homepage.labels.topConnected ?? "Most Connected"}
          </p>
          <div className="tag-cloud">
            {homepage.topConnected.map((page) => (
              <Link key={page.file} to={`/wiki/${page.slug}`} className="tag">
                {page.title}
                {page.backlinkCount > 0 && (
                  <span style={{ marginLeft: 5, opacity: 0.5, fontSize: "0.85em" }}>
                    {page.backlinkCount}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      <div style={{ height: 64 }} />
    </div>
  );
}
