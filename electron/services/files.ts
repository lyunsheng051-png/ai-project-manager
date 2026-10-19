import { readdir, stat, readFile, writeFile, rename, unlink, realpath, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { withinProject } from '../core/paths';
import { ignoredDirectories } from './scanner';
import type { FileEntry, ImagePreviewData, FileCreationKind } from '../../shared/contracts';
import { imageMimeType, isImageFile } from '../../shared/file-kinds';
import { fileEntryNameError } from '../../shared/file-creation';

export async function createFileEntry(root: string, relative: string, name: string, kind: FileCreationKind): Promise<FileEntry> {
  const invalid = fileEntryNameError(name);
  if (invalid) throw new Error(invalid);
  if (ignoredDirectories.has(name)) throw new Error('该名称属于文件树隐藏的依赖或生成目录，请使用其他名称');
  if (path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) throw new Error('创建位置必须在当前项目内');
  const canonicalRoot = await realpath(root);
  const directory = await withinProject(canonicalRoot, relative, true);
  if (path.relative(canonicalRoot, directory).split(path.sep).some(part => part.toLowerCase() === '.git')) {
    throw new Error('不能在 Git 内部目录中创建文件');
  }
  const target = path.join(directory, name);
  if (await withinProject(canonicalRoot, relative, true) !== directory) throw new Error('目录路径已发生变化，请刷新后重试');
  try {
    // 独占创建，不覆盖已有文件、目录或符号链接。
    if (kind === 'directory') await mkdir(target, { recursive: false });
    else await writeFile(target, '', { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EEXIST' || code === 'EISDIR') throw new Error('同名文件或目录已经存在，请换一个名称');
    if (code === 'ENOENT' || code === 'ENOTDIR') throw new Error('创建位置已不存在，请刷新目录后重试');
    if (code === 'EACCES' || code === 'EPERM') throw new Error('没有权限在该目录中创建文件或目录');
    if (code === 'ENAMETOOLONG') throw new Error('文件名称或路径过长，请缩短后重试');
    throw error;
  }
  return { name, path: path.relative(canonicalRoot, target).replaceAll('\\', '/'), directory: kind === 'directory', size: 0 };
}

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

export async function readImageFile(root: string, relative: string): Promise<ImagePreviewData> {
  const file = await withinProject(root, relative); const mimeType = imageMimeType(file);
  if (!mimeType) throw new Error('暂不支持此图片格式');
  const info = await stat(file);
  if (!info.isFile()) throw new Error('请选择图片文件');
  const limit = 20_000_000;
  if (info.size > limit) throw new Error('图片超过 20 MB，请使用外部工具查看');
  const buffer = await readFile(file);
  if (buffer.length > limit) throw new Error('图片超过 20 MB，请使用外部工具查看');
  const head = buffer.subarray(0, 16);
  const valid = mimeType === 'image/png' ? head.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : mimeType === 'image/jpeg' ? head[0] === 255 && head[1] === 216 && head[2] === 255
    : mimeType === 'image/gif' ? /^GIF8[79]a$/.test(head.subarray(0, 6).toString('ascii'))
    : mimeType === 'image/webp' ? head.subarray(0, 4).toString('ascii') === 'RIFF' && head.subarray(8, 12).toString('ascii') === 'WEBP'
    : mimeType === 'image/bmp' ? head.subarray(0, 2).toString('ascii') === 'BM'
    : mimeType === 'image/x-icon' ? head.subarray(0, 4).equals(Buffer.from([0, 0, 1, 0]))
    : mimeType === 'image/avif' ? head.subarray(4, 8).toString('ascii') === 'ftyp' && /avi[fs]/.test(buffer.subarray(8, 64).toString('ascii'))
    : /<svg(?:\s|>)/i.test(buffer.toString('utf8'));
  if (!valid) throw new Error('图片内容与格式不符，或文件已损坏');
  return { dataUrl: `data:${mimeType};base64,${buffer.toString('base64')}`, mimeType, size: buffer.length };
}

const pendingWrites = new Map<string, Promise<string>>();
export async function saveTextFile(root: string, relative: string, content: string, original: string): Promise<string> {
  const file = await withinProject(root, relative);
  if (isImageFile(file) || isImageFile(relative)) throw new Error('图片仅支持预览，不能编辑或保存');
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
