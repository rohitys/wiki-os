import type { WikiOsConfigInput } from "./src/lib/wiki-config";

const config: WikiOsConfigInput = {
  siteTitle: "Ripster Brain",
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
  },
  people: {
    mode: "off",
  },
};

export default config;
