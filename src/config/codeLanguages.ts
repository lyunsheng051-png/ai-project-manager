export interface CodeLanguage { id: string; label: string }
const extensions: Record<string, CodeLanguage> = {
  java: { id: 'java', label: 'Java' }, py: { id: 'python', label: 'Python' },
  js: { id: 'javascript', label: 'JavaScript' }, jsx: { id: 'javascript', label: 'JSX' }, mjs: { id: 'javascript', label: 'JavaScript' }, cjs: { id: 'javascript', label: 'JavaScript' },
  ts: { id: 'typescript', label: 'TypeScript' }, tsx: { id: 'typescript', label: 'TSX' }, mts: { id: 'typescript', label: 'TypeScript' }, cts: { id: 'typescript', label: 'TypeScript' },
  vue: { id: 'xml', label: 'Vue' }, html: { id: 'xml', label: 'HTML' }, htm: { id: 'xml', label: 'HTML' }, xml: { id: 'xml', label: 'XML' },
  css: { id: 'css', label: 'CSS' }, scss: { id: 'scss', label: 'SCSS' },
  json: { id: 'json', label: 'JSON' }, jsonc: { id: 'json', label: 'JSONC' },
  yml: { id: 'yaml', label: 'YAML' }, yaml: { id: 'yaml', label: 'YAML' }, sql: { id: 'sql', label: 'SQL' },
  md: { id: 'markdown', label: 'Markdown' }, markdown: { id: 'markdown', label: 'Markdown' },
  sh: { id: 'bash', label: 'Shell' }, bash: { id: 'bash', label: 'Shell' },
  ini: { id: 'ini', label: 'INI' }, toml: { id: 'ini', label: 'TOML' }, properties: { id: 'properties', label: 'Properties' },
  diff: { id: 'diff', label: 'Diff' }, patch: { id: 'diff', label: 'Patch' },
};
export function codeLanguage(filename: string): CodeLanguage {
  const name = filename.split(/[\\/]/).at(-1)?.toLowerCase() ?? '';
  if (name.startsWith('dockerfile')) return { id: 'dockerfile', label: 'Dockerfile' };
  if (name === '.env' || name.startsWith('.env.')) return { id: 'ini', label: 'Environment' };
  const extension = name.split('.').at(-1) ?? '';
  return Object.hasOwn(extensions, extension) ? extensions[extension]! : { id: 'plaintext', label: '纯文本' };
}
