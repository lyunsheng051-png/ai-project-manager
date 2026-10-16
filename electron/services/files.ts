import { readdir, stat, readFile, writeFile, rename, unlink, realpath } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
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
async function readText(file: string): Promise<string> {
  const info = await stat(file);
  if (!info.isFile()) throw new Error('请选择文件');
  if (info.size > 1_000_000) throw new Error('文件超过 1 MB，请使用外部编辑器打开');
  const buffer = await readFile(file);
  if (buffer.length > 1_000_000) throw new Error('文件超过 1 MB，请使用外部编辑器打开');
  if (buffer.includes(0)) throw new Error('暂不支持预览二进制文件');
  try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer); }
  catch { throw new Error('仅支持 UTF-8 文本文件，请使用外部编辑器打开其他编码的文件'); }
}
export async function readTextFile(root: string, relative: string): Promise<string> {
  return readText(await withinProject(root, relative));
}

const pendingWrites = new Map<string, Promise<string>>();
export async function saveTextFile(root: string, relative: string, content: string, original: string): Promise<string> {
  const file = await withinProject(root, relative);
  if (path.relative(await realpath(root), file).split(path.sep).some(part => part.toLowerCase() === '.git')) {
    throw new Error('不能编辑 Git 内部文件');
  }
  if (content.includes('\0')) throw new Error('不能保存二进制内容');
  const write = (pendingWrites.get(file) ?? Promise.resolve()).catch(() => undefined).then(async () => {
    if (await readText(file) !== original) throw new Error('文件已被其他程序修改，请先重新读取；当前编辑内容已保留');
    const newline = original.match(/\r\n|\r|\n/)?.[0] ?? '\n';
    const bom = original.startsWith('\uFEFF') ? '\uFEFF' : '';
    const next = bom + content.replace(/^\uFEFF/, '').replace(/\r\n|\r/g, '\n').replace(/\n/g, newline);
    if (Buffer.byteLength(next, 'utf8') > 1_000_000) throw new Error('文件超过 1 MB，请使用外部编辑器保存');
    const temporary = path.join(path.dirname(file), `.aipm-save-${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, next, { encoding: 'utf8', flag: 'wx', mode: (await stat(file)).mode });
      if (await readText(file) !== original) throw new Error('文件已被其他程序修改，请先重新读取；当前编辑内容已保留');
      if (await withinProject(root, relative) !== file) throw new Error('文件路径已发生变化，请重新打开文件');
      await rename(temporary, file);
      return next;
    } finally { await unlink(temporary).catch(() => undefined); }
  });
  pendingWrites.set(file, write);
  try { return await write; } finally { if (pendingWrites.get(file) === write) pendingWrites.delete(file); }
}
