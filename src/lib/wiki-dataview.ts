import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

import { parseWikiFrontmatter } from "./markdown";

const DATAVIEWJS_BLOCK_RE = /```dataviewjs\n([\s\S]*?)```/g;

export function hasDataviewBlocks(markdown: string): boolean {
  return markdown.includes("```dataviewjs");
}

type DvPageRecord = Record<string, unknown>;

class DvArray {
  private readonly _items: DvPageRecord[];

  constructor(items: DvPageRecord[]) {
    this._items = items;
  }

  get length(): number {
    return this._items.length;
  }

  where(fn: (item: DvPageRecord) => boolean): DvArray {
    return new DvArray(this._items.filter(fn));
  }

  sort(fn: (item: DvPageRecord) => unknown, order?: string): DvArray {
    const sorted = [...this._items].sort((a, b) => {
      const va = fn(a);
      const vb = fn(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const cmp =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va).localeCompare(String(vb));
      return order === "desc" ? -cmp : cmp;
    });
    return new DvArray(sorted);
  }

  filter(fn: (item: DvPageRecord) => boolean): DvArray {
    return this.where(fn);
  }

  map<T>(fn: (item: DvPageRecord) => T): T[] {
    return this._items.map(fn);
  }

  forEach(fn: (item: DvPageRecord) => void): void {
    this._items.forEach(fn);
  }

  array(): DvPageRecord[] {
    return [...this._items];
  }
}

function loadFolderPages(wikiRoot: string, folderPath: string): DvPageRecord[] {
  const fullDir = path.join(wikiRoot, folderPath);
  let entries: string[];
  try {
    entries = readdirSync(fullDir);
  } catch {
    return [];
  }

  const pages: DvPageRecord[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".md")) continue;
    try {
      const fullPath = path.join(fullDir, entry);
      const stat = statSync(fullPath);
      if (!stat.isFile()) continue;
      const content = readFileSync(fullPath, "utf8");
      const { data } = parseWikiFrontmatter(content);
      pages.push({ ...data });
    } catch {
      continue;
    }
  }
  return pages;
}

function formatMdTable(headers: string[], rows: unknown[][]): string {
  const escape = (v: unknown) => String(v ?? "—").replace(/\|/g, "\\|");
  const headerRow = `| ${headers.map(escape).join(" | ")} |`;
  const separator = `| ${headers.map(() => "---").join(" | ")} |`;
  const dataRows = rows.map((row) => `| ${row.map(escape).join(" | ")} |`);
  return [headerRow, separator, ...dataRows].join("\n");
}

export function processDataviewBlocks(
  contentMarkdown: string,
  wikiRoot: string,
  currentFile: string,
): string {
  if (!hasDataviewBlocks(contentMarkdown)) {
    return contentMarkdown;
  }

  let currentPageData: DvPageRecord = {};
  try {
    const raw = readFileSync(path.join(wikiRoot, currentFile), "utf8");
    const { data } = parseWikiFrontmatter(raw);
    currentPageData = data;
  } catch {
    // current page frontmatter unavailable
  }

  return contentMarkdown.replace(DATAVIEWJS_BLOCK_RE, (_, code: string) => {
    try {
      const output: string[] = [];

      const dv = {
        pages(source: string): DvArray {
          const folderPath = source.replace(/^["']|["']$/g, "");
          return new DvArray(loadFolderPages(wikiRoot, folderPath));
        },
        current(): DvPageRecord {
          return currentPageData;
        },
        table(headers: string[], rows: unknown[][]): void {
          output.push(formatMdTable(headers, rows));
        },
        paragraph(text: string): void {
          output.push(String(text));
        },
      };

      const context = vm.createContext({
        dv,
        console: { log() {}, warn() {}, error() {} },
        Math,
        Object,
        Array,
        JSON,
        String,
        Number,
        Boolean,
        isNaN,
        parseInt,
        parseFloat,
        NaN,
        undefined,
      });

      vm.runInNewContext(code, context, { timeout: 5000 });

      return output.length > 0 ? output.join("\n\n") : "";
    } catch (error) {
      const message = error instanceof Error ? error.message : "Dataview execution error";
      return `> **Dataview error:** ${message}`;
    }
  });
}
