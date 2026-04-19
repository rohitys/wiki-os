import { describe, expect, it } from "vitest";

import { resolveWikiOsConfig } from "../src/lib/wiki-config";

describe("resolveWikiOsConfig — customStats", () => {
  it("keeps valid label/value pairs and trims whitespace", () => {
    const resolved = resolveWikiOsConfig({
      homepage: {
        customStats: [
          { label: "  Runs  ", value: " 97 " },
          { label: "Tickers", value: "15" },
        ],
      },
    });
    expect(resolved.homepage.customStats).toEqual([
      { label: "Runs", value: "97" },
      { label: "Tickers", value: "15" },
    ]);
  });

  it("drops entries where label or value is empty after trim", () => {
    const resolved = resolveWikiOsConfig({
      homepage: {
        customStats: [
          { label: "", value: "x" },
          { label: "ok", value: "   " },
          { label: "Phase", value: "13B" },
        ],
      },
    });
    expect(resolved.homepage.customStats).toEqual([{ label: "Phase", value: "13B" }]);
  });

  it("falls back to defaults when customStats is not an array", () => {
    const resolved = resolveWikiOsConfig({
      homepage: {
        customStats: "not-an-array" as unknown as { label: string; value: string }[],
      },
    });
    // Defaults contain no entries, so the resolved list is empty — importantly, no throw
    expect(resolved.homepage.customStats).toEqual([]);
  });

  it("survives malformed entries without throwing", () => {
    const resolved = resolveWikiOsConfig({
      homepage: {
        // Pretend runtime received garbage (e.g. stale resolver / user-edited JSON)
        customStats: [
          null,
          undefined,
          { label: 42, value: true },
          { label: "Runs", value: "97" },
          "not-an-object",
        ] as unknown as { label: string; value: string }[],
      },
    });
    expect(resolved.homepage.customStats).toEqual([{ label: "Runs", value: "97" }]);
  });
});
