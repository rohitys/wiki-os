import type { WikiOsConfigInput } from "./src/lib/wiki-config";

const config: WikiOsConfigInput = {
  siteTitle: "Ripster Wiki",
  tagline: "Ripster EMA Cloud trading system — research, signals, and trade data.",
  searchPlaceholder: "Search insights, trades, and knowledge...",
  includeFolders: ["IO Fund", "Karpster", "Misc", "Up next Ideas"],
  homepage: {
    labels: {
      featured: "Featured",
      topConnected: "Most Connected",
      people: "Key Voices",
      recentPages: "Recently Added",
    },
    customStats: [
      { label: "Runs", value: "97" },
      { label: "Tickers", value: "15" },
      { label: "Phase", value: "13B" },
    ],
  },
  people: {
    mode: "off",
  },
};

export default config;
