import { isImageFile } from '../../shared/file-kinds';

const fileTypes = {
  code: { name: 'FileCode', tone: 'code' },
  json: { name: 'FileJson', tone: 'config' },
  config: { name: 'FileCog', tone: 'config' },
  document: { name: 'BookOpen', tone: 'document' },
  data: { name: 'Database', tone: 'data' },
  image: { name: 'Image', tone: 'image' },
  text: { name: 'FileText', tone: 'text' },
} as const;

export function fileIcon(filename: string) {
  const name = filename.toLowerCase();
  if (isImageFile(name)) return fileTypes.image;
  if (/\.(json|jsonc|json5)$/.test(name)) return fileTypes.json;
  if (/\.(vue|js|jsx|mjs|cjs|ts|tsx|java|py|go|rs|c|cpp|h|cs|php|rb|kt|swift|html|css|scss|less|sh|ps1|bat|cmd)$/.test(name)) return fileTypes.code;
  if (/\.(md|mdx|rst|adoc)$/.test(name) || /^(readme|license|licence|changelog)(\.|$)/.test(name)) return fileTypes.document;
  if (/\.(sql|csv|tsv|db|sqlite|sqlite3)$/.test(name)) return fileTypes.data;
  if (/\.(ya?ml|toml|ini|conf|config|properties|xml)$/.test(name) || /^(\.env|\.git|\.npm|\.nvm|\.editorconfig|dockerfile|makefile)/.test(name)) return fileTypes.config;
  return fileTypes.text;
}
