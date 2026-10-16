import path from 'node:path';
import { realpath, stat } from 'node:fs/promises';

export function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

export async function withinProject(root: string, relative: string, directory = false): Promise<string> {
  if (relative.includes('\0')) throw new Error('文件路径无效');
  const canonicalRoot = await realpath(root);
  const candidate = await realpath(path.resolve(canonicalRoot, relative || '.'));
  if (!isInside(canonicalRoot, candidate)) throw new Error('只能访问当前项目内的文件');
  if (directory && !(await stat(candidate)).isDirectory()) throw new Error('工作目录不存在');
  return candidate;
}

export function validateCloneName(name: string): string {
  const value = name.trim();
  if (!value || value === '.' || value === '..' || /[<>:"/\\|?*\x00-\x1f]/.test(value)
      || /[. ]$/.test(value) || /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(value)) {
    throw new Error('请填写有效的本地文件夹名称');
  }
  return value;
}

export function validateRemote(value: string): string {
  const remote = value.trim();
  if (/^[\w.-]+@[\w.-]+:[\w./~%-]+$/.test(remote)) return remote;
  try {
    const url = new URL(remote);
    if (['https:', 'ssh:'].includes(url.protocol) && url.hostname && !url.password && !url.search && !url.hash) return remote;
  } catch { /* 返回统一错误 */ }
  throw new Error('请使用 HTTPS 或 SSH Git 仓库地址');
}
