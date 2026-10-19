import { constants } from 'node:fs';
import { copyFile, lstat, mkdir, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { isInside, withinProject } from '../core/paths';
import { ProjectQueue } from '../core/queue';
import { ignoredDirectories } from './scanner';
import { fileEntryNameError } from '../../shared/file-creation';
import type { FileCopyCheck, FileCopyConflict, FileCopyResult, FileEntry } from '../../shared/contracts';

const queue = new ProjectQueue();
const key = (value: string) => process.platform === 'win32' ? value.toLowerCase() : value;
function forbidGit(file: string) {
  if (file.split(path.sep).some(part => part.toLowerCase() === '.git')) throw new Error('不能复制到或复制自 Git 内部目录');
}
async function exists(file: string) {
  try { await lstat(file); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}
function friendly(error: unknown) {
  const code = (error as NodeJS.ErrnoException).code;
  if (code === 'EEXIST') return '目标已出现同名项，已有内容未覆盖；请重试';
  if (code === 'ENOSPC') return '磁盘空间不足';
  if (code === 'ENOENT') return '源文件或目标目录已不存在';
  if (code === 'EACCES' || code === 'EPERM' || code === 'EBUSY') return '无法访问文件，请检查权限或文件占用';
  if (code === 'ENAMETOOLONG') return '路径过长，请缩短名称或选择更浅的目标目录';
  return error instanceof Error ? error.message : String(error);
}
async function destination(root: string, relative: string) {
  if (path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) throw new Error('目标目录必须在当前项目内');
  const canonicalRoot = await realpath(root);
  const directory = await withinProject(canonicalRoot, relative, true); forbidGit(directory);
  return { root: canonicalRoot, directory };
}
async function sourceInfo(source: string, directory: string) {
  if (!path.isAbsolute(source)) throw new Error('源路径无效');
  const info = await lstat(source);
  if (info.isSymbolicLink()) throw new Error('暂不支持复制符号链接或联接目录');
  if (!info.isFile() && !info.isDirectory()) throw new Error('只能复制普通文件或目录');
  const canonical = await realpath(source); forbidGit(canonical);
  const name = path.basename(canonical); const invalid = fileEntryNameError(name);
  if (invalid) throw new Error(invalid);
  if (ignoredDirectories.has(name)) throw new Error('该名称属于文件树隐藏目录，请选择其父目录或其他文件');
  if (info.isDirectory() && isInside(canonical, directory)) throw new Error('不能把目录复制到自身或其子目录中');
  return { file: canonical, name, directory: info.isDirectory(), size: info.isFile() ? info.size : 0 };
}

export async function checkFileCopy(root: string, relative: string, sources: string[]): Promise<FileCopyCheck> {
  const target = await destination(root, relative); const names: string[] = []; const conflicts: string[] = []; const seen = new Set<string>();
  for (const source of sources) {
    const entry = await sourceInfo(source, target.directory); names.push(entry.name);
    if (seen.has(key(entry.name)) || await exists(path.join(target.directory, entry.name))) conflicts.push(entry.name);
    seen.add(key(entry.name));
  }
  return { names, conflicts };
}

function duplicateName(name: string, directory: boolean, index: number) {
  const extension = directory ? '' : path.extname(name);
  const suffix = ` - 副本${index > 1 ? ` (${index})` : ''}${extension}`;
  const stem = Array.from(extension ? name.slice(0, -extension.length) : name);
  while (stem.length && stem.join('').length + suffix.length > 255) stem.pop();
  return stem.join('') + suffix;
}

export async function copyFileEntries(root: string, relative: string, sources: string[], conflict: FileCopyConflict): Promise<FileCopyResult> {
  const target = await destination(root, relative);
  return queue.run(key(target.root), async () => {
    const result: FileCopyResult = { copied: [], skipped: [], failed: [], skippedLinks: 0, skippedGit: 0 };
    async function checkParent(parent: string) {
      const resolved = await withinProject(target.root, path.relative(target.root, parent), true);
      if (key(resolved) !== key(parent)) throw new Error('目标目录路径发生变化，请刷新后重试');
      forbidGit(resolved);
    }
    async function fillDirectory(source: string, output: string, depth = 0) {
      if (depth > 128) throw new Error('目录层级过深，已停止复制');
      const current = await lstat(source);
      if (current.isSymbolicLink() || !current.isDirectory() || key(await realpath(source)) !== key(source)) throw new Error('源目录路径发生变化，请重试');
      const entries = await readdir(source, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.toLowerCase() === '.git') { result.skippedGit++; continue; }
        const input = path.join(source, entry.name); const info = await lstat(input);
        if (info.isSymbolicLink()) { result.skippedLinks++; continue; }
        if (key(await realpath(input)) !== key(input)) throw new Error(`源文件路径发生变化：${entry.name}`);
        if (!info.isFile() && !info.isDirectory()) throw new Error(`不支持复制特殊文件：${entry.name}`);
        const invalid = fileEntryNameError(entry.name); if (invalid) throw new Error(`${entry.name}：${invalid}`);
        await checkParent(output);
        const outputPath = path.join(output, entry.name);
        if (info.isDirectory()) { await mkdir(outputPath, { recursive: false }); await fillDirectory(input, outputPath, depth + 1); }
        else await copyFile(input, outputPath, constants.COPYFILE_EXCL);
      }
    }
    for (const source of sources) {
      let reserved = false; let output = ''; let item: FileEntry | undefined;
      try {
        const entry = await sourceInfo(source, target.directory);
        let name = entry.name;
        for (let index = 0; index < 10_000; index++) {
          name = index ? duplicateName(entry.name, entry.directory, index) : entry.name;
          output = path.join(target.directory, name); await checkParent(target.directory);
          if (await exists(output)) { if (conflict === 'skip') break; else continue; }
          try {
            if (entry.directory) await mkdir(output, { recursive: false });
            else await copyFile(entry.file, output, constants.COPYFILE_EXCL);
            reserved = true; break;
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
            if (conflict === 'skip') break;
          }
        }
        if (!reserved) { result.skipped.push(entry.name); continue; }
        item = { name, path: path.relative(target.root, output).replaceAll('\\', '/'), directory: entry.directory, size: entry.size };
        if (entry.directory) await fillDirectory(entry.file, output);
        result.copied.push(item);
      } catch (error) {
        result.failed.push({ name: item?.name ?? path.basename(source), message: friendly(error) + (reserved && item?.directory ? '；已复制的部分内容保留在目标目录中' : '') });
      }
    }
    return result;
  });
}
