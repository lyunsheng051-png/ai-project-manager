import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ProjectQueue } from '../core/queue';
import type { ThemeMode } from '../../shared/contracts';

export class ThemeStore {
  private theme: ThemeMode = 'dark';
  private sidebarCollapsed = false;
  private queue = new ProjectQueue();
  constructor(private directory: string) {}

  async load(): Promise<void> {
    try {
      const value: unknown = JSON.parse(await readFile(path.join(this.directory, 'appearance.json'), 'utf8'));
      if (value && typeof value === 'object' && 'theme' in value && (value.theme === 'dark' || value.theme === 'light')) {
        this.theme = value.theme;
      }
      if (value && typeof value === 'object' && 'sidebarCollapsed' in value && typeof value.sidebarCollapsed === 'boolean') {
        this.sidebarCollapsed = value.sidebarCollapsed;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('外观设置无法读取，使用默认深色主题。');
    }
  }

  get(): ThemeMode { return this.theme; }
  getSidebarCollapsed(): boolean { return this.sidebarCollapsed; }

  private async persist(theme: ThemeMode, sidebarCollapsed: boolean) {
    await mkdir(this.directory, { recursive: true });
    const file = path.join(this.directory, 'appearance.json');
    await writeFile(`${file}.tmp`, JSON.stringify({ theme, sidebarCollapsed }, null, 2), 'utf8');
    await rename(`${file}.tmp`, file);
    this.theme = theme; this.sidebarCollapsed = sidebarCollapsed;
  }

  save(theme: ThemeMode): Promise<ThemeMode> {
    return this.queue.run('appearance', async () => {
      await this.persist(theme, this.sidebarCollapsed);
      return theme;
    });
  }

  saveSidebarCollapsed(collapsed: boolean): Promise<boolean> {
    return this.queue.run('appearance', async () => {
      await this.persist(this.theme, collapsed);
      return collapsed;
    });
  }
}
