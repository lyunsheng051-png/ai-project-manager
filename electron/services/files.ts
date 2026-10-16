import { readdir, stat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { withinProject } from '../core/paths';
import { ignoredDirectories } from './scanner';
import type { FileEntry } from '../../shared/contracts';

export async function listFiles(root: string, relative: string): Promise<FileEntry[]> {
  const directory = await withinProject(root, relative, true);
  const entries = await readdir(directory, { withFileTypes: true });
  const result = await Promise.all(entries.filter(e => !e.isSymbolicLink() && e.name !== '.git' && !ignoredDirectories.has(e.name)).map(async e => ({
    name: e.name, path: path.relative(root, path.join(directory, e.name)).replaceAll('\\', '/'),
    directory: e.isDirectory(), size: e.isFile() ? (await stat(path.join(directory, e.name))).size : 0,
  })));
  return result.sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name));
}
export async function readTextFile(root: string, relative: string): Promise<string> {
  const file = await withinProject(root, relative);
  const info = await stat(file);
  if (!info.isFile()) throw new Error('请选择文件');
  if (info.size > 1_000_000) throw new Error('文件超过 1 MB，请使用外部编辑器打开');
  const buffer = await readFile(file);
  if (buffer.includes(0)) throw new Error('暂不支持预览二进制文件');
  return buffer.toString('utf8');
}
