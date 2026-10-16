import type { GitFile } from '../../shared/contracts';

export type GitTone = 'normal' | 'untracked' | 'staged' | 'modified' | 'conflict';
export const gitToneLabels: Record<GitTone, string> = {
  normal: '未修改', untracked: '未跟踪的新文件', staged: '已暂存，尚未提交', modified: '有未暂存的修改', conflict: '合并冲突',
};
const priority: Record<GitTone, number> = { normal: 0, staged: 1, modified: 2, untracked: 3, conflict: 4 };
export function gitFileTone(file: GitFile): GitTone {
  if (file.conflict) return 'conflict';
  if (file.index === '?' || file.working === '?') return 'untracked';
  if (file.unstaged) return 'modified';
  return file.staged ? 'staged' : 'normal';
}
export function gitDecorations(files: GitFile[]) {
  const result = new Map<string, GitTone>();
  for (const file of files) {
    const tone = gitFileTone(file);
    for (const filename of [file.path, file.originalPath].filter((value): value is string => Boolean(value))) {
      const parts = filename.split('/');
      while (true) {
        const path = parts.join('/');
        if (priority[tone] > priority[result.get(path) ?? 'normal']) result.set(path, tone);
        if (!parts.length) break;
        parts.pop();
      }
    }
  }
  return result;
}
