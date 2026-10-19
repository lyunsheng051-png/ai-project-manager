import { clipboard } from 'electron';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

const run = promisify(execFile);
async function windowsClipboard(script: string): Promise<string> {
  const prefix = "$ErrorActionPreference = 'Stop'; [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); Add-Type -AssemblyName System.Windows.Forms; ";
  try {
    const { stdout } = await run('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-STA', '-EncodedCommand', Buffer.from(prefix + script, 'utf16le').toString('base64')], {
      windowsHide: true, timeout: 15_000, maxBuffer: 2_000_000, encoding: 'utf8',
    });
    return stdout.trim();
  } catch { throw new Error('无法访问系统文件剪贴板，请稍后重试，或直接将文件拖入目标目录'); }
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

export async function writeFileClipboard(file: string): Promise<void> {
  if (process.platform === 'win32') {
    const data = Buffer.from(file, 'utf8').toString('base64');
    await windowsClipboard(`$files = [System.Collections.Specialized.StringCollection]::new(); [void]$files.Add([System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${data}'))); [System.Windows.Forms.Clipboard]::SetFileDropList($files)`);
  } else clipboard.writeBuffer('text/uri-list', Buffer.from(pathToFileURL(file).href + '\r\n'));
}
