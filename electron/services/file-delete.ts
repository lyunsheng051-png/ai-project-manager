import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { isInside, withinProject } from '../core/paths';

export async function trashProjectEntry(root: string, relative: string, directory: boolean, projectRoots: string[], trash: (file: string) => Promise<void>): Promise<void> {
  if (!relative || relative.includes('\0') || path.isAbsolute(relative) || relative.split(/[\\/]/).some(part => part === '.' || part === '..')) throw new Error('请选择项目内的具体文件或目录');
  const canonicalRoot = await realpath(root);
  const candidate = path.resolve(canonicalRoot, relative);
  if (candidate === canonicalRoot || !isInside(canonicalRoot, candidate)) throw new Error('不能删除项目根目录');
  const info = await lstat(candidate);
  if (info.isDirectory() !== directory) throw new Error('文件或目录类型已发生变化，请刷新后重新选择删除项');
  if (info.isSymbolicLink()) throw new Error('暂不支持删除符号链接或联接目录');
  const target = await withinProject(canonicalRoot, relative);
  if (target === canonicalRoot) throw new Error('不能删除项目根目录');
  if (path.relative(canonicalRoot, target).split(path.sep).some(part => part.toLowerCase() === '.git')) throw new Error('不能删除 Git 内部文件或目录');
  if (!info.isFile() && !info.isDirectory()) throw new Error('只能删除普通文件或目录');
  if (info.isDirectory()) {
    const registered = await Promise.all(projectRoots.map(directory => realpath(directory).catch(() => path.resolve(directory))));
    if (registered.some(directory => isInside(target, directory))) throw new Error('此目录本身是已导入项目或包含已导入项目，不能在文件树中删除');
  }
  const latest = await lstat(candidate);
  if (latest.isSymbolicLink() || latest.ino !== info.ino || latest.dev !== info.dev || await withinProject(canonicalRoot, relative) !== target) throw new Error('文件路径已发生变化，请刷新后重试');
  try { await trash(target); }
  catch { throw new Error('移入回收站失败，请检查文件占用、权限及回收站是否可用；不会改为永久删除'); }
}
