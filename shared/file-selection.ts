import type { FileEntry } from './contracts';

export function topLevelFileEntries(entries: FileEntry[]): FileEntry[] {
  const unique = [...new Map(entries.filter(entry => entry.path).map(entry => [entry.path, entry])).values()];
  const directories = new Set(unique.filter(entry => entry.directory).map(entry => entry.path));
  return unique.filter(entry => {
    const parts = entry.path.split('/'); parts.pop();
    while (parts.length) { if (directories.has(parts.join('/'))) return false; parts.pop(); }
    return true;
  });
}
