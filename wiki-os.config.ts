import type { WikiOsConfigInput } from "./src/lib/wiki-config";

const config: WikiOsConfigInput = {
  siteTitle: "Ripster Brain",
  tagline: "Ripster EMA Cloud trading system — research, signals, and trade data.",
  searchPlaceholder: "Search insights, trades, and knowledge...",
  homepage: {
    labels: {
      featured: "Featured",
      topConnected: "Most Connected",
      people: "Key Voices",
      recentPages: "Recently Added",
    },
  },
  people: {
    mode: "disabled",
  },
};

export default config;
