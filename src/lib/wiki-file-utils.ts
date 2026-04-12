import { promises as fs } from "node:fs";

export function normalizeRelativePath(value: string) {
  return value.replace(/\\/g, "/").replace(/^\.?\//, "").trim();
}

export function isIgnoredDirectoryName(name: string) {
  return name.startsWith("_") || name.startsWith(".");
}

export function shouldIndexRelativeFile(file: string, includeFolders?: string[]) {
  if (!file.endsWith(".md")) {
    return false;
  }

  const normalized = normalizeRelativePath(file);
  if (!normalized) {
    return false;
  }

  const parts = normalized.split("/").filter(Boolean);
  if (parts.length === 0) {
    return false;
  }

  const baseName = parts[parts.length - 1];
  if (baseName.startsWith("_") || baseName.startsWith(".")) {
    return false;
  }

  for (const directory of parts.slice(0, -1)) {
    if (isIgnoredDirectoryName(directory)) {
      return false;
    }
  }

  // When includeFolders is set, only allow root-level files or files inside listed folders
  if (includeFolders && includeFolders.length > 0) {
    const isRootFile = parts.length === 1;
    if (!isRootFile) {
      const topFolder = parts[0];
      if (!includeFolders.some((f) => topFolder === f)) {
        return false;
      }
    }
  }

  return true;
}

export async function quarantineCorruptIndexFiles(indexDbPath: string, timestampMs: number) {
  const paths = [indexDbPath, `${indexDbPath}-wal`, `${indexDbPath}-shm`];

  for (const filePath of paths) {
    try {
      await fs.rename(filePath, `${filePath}.corrupt-${timestampMs}`);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        continue;
      }

      throw error;
    }
  }
}
