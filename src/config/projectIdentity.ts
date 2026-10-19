const tones = ['blue', 'teal', 'violet', 'slate'] as const;

export function projectIdentity(name: string, path: string) {
  const parts = name.trim().split(/[\s._-]+/u).filter(Boolean);
  const letters = parts.length > 1
    ? parts.slice(0, 2).map(part => Array.from(part)[0]).join('')
    : Array.from(parts[0] || '项目').slice(0, 2).join('');
  // Keep the same identity across selection, sorting and application restarts.
  let hash = 0;
  for (const character of path.replace(/\\/g, '/').toLowerCase()) hash = (Math.imul(hash, 31) + character.codePointAt(0)!) | 0;
  return { letters: letters.toUpperCase(), tone: tones[(hash >>> 0) % tones.length] };
}
