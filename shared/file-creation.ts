export function fileEntryNameError(name: string): string {
  if (!name.trim()) return '请填写名称';
  if (name.length > 255) return '名称不能超过 255 个字符';
  if (name === '.' || name === '..' || /[<>:"/\\|?*\x00-\x1f\x7f]/.test(name)) {
    return '名称不能包含路径分隔符或 <>:"|?* 等字符';
  }
  if (/[. ]$/.test(name)) return '名称不能以空格或句点结尾';
  if (/^(CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])(?:\.|$)/i.test(name)) return '不能使用系统保留名称';
  if (name.toLowerCase() === '.git') return '不能创建 Git 内部文件或目录';
  return '';
}
