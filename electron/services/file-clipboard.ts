import { clipboard } from 'electron';
import { execFile } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

async function windowsClipboard(script: string, input = ''): Promise<string> {
  const prefix = "$ErrorActionPreference = 'Stop'; [Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false); [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); Add-Type -AssemblyName System.Windows.Forms; ";
  return new Promise((resolve, reject) => {
    const child = execFile('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-STA', '-EncodedCommand', Buffer.from(prefix + script, 'utf16le').toString('base64')], {
      windowsHide: true, timeout: 15_000, maxBuffer: 2_000_000, encoding: 'utf8',
    }, (error, stdout) => {
      if (error) reject(new Error('无法访问系统文件剪贴板，请稍后重试，或直接将文件拖入目标目录'));
      else resolve(stdout.trim());
    });
    child.stdin?.on('error', () => { /* 子进程退出由回调处理 */ });
    child.stdin?.end(input, 'utf8');
  });
}

export async function readFileClipboard(): Promise<string[]> {
  if (process.platform === 'win32') {
    const output = await windowsClipboard("$paths = @([System.Windows.Forms.Clipboard]::GetFileDropList() | ForEach-Object { [string]$_ }); [Console]::Write((ConvertTo-Json -InputObject $paths -Compress))");
    const value: unknown = JSON.parse(output || '[]');
    if (!Array.isArray(value) || value.some(item => typeof item !== 'string') || value.length > 200) throw new Error('一次最多粘贴 200 个文件或目录');
    return value as string[];
  }
  const values = clipboard.readBuffer('text/uri-list').toString('utf8').split(/\r?\n/).filter(line => line && !line.startsWith('#'));
  return values.flatMap(value => { try { return [fileURLToPath(value)]; } catch { return []; } });
}

export async function writeFileClipboard(files: string[]): Promise<void> {
  if (process.platform === 'win32') {
    await windowsClipboard('$paths = ConvertFrom-Json ([Console]::In.ReadToEnd()); $files = [System.Collections.Specialized.StringCollection]::new(); foreach ($item in $paths) { [void]$files.Add([string]$item) }; [System.Windows.Forms.Clipboard]::SetFileDropList($files)', JSON.stringify(files));
  } else clipboard.writeBuffer('text/uri-list', Buffer.from(files.map(file => pathToFileURL(file).href).join('\r\n') + '\r\n'));
}
