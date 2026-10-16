import { mkdir, readFile, rename, writeFile, realpath, stat, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Project, ServiceProfile } from '../../shared/contracts';
import { ProjectQueue } from '../core/queue';

export class ProjectStore {
  private projects: Project[] = [];
  private queue = new ProjectQueue();
  constructor(private directory: string) {}
  async load(): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    try {
      const data: unknown = JSON.parse(await readFile(path.join(this.directory, 'projects.json'), 'utf8'));
      if (!Array.isArray(data) || data.some(p => !p || typeof p.id !== 'string' || typeof p.path !== 'string' || !Array.isArray(p.services))) {
        throw new Error('项目配置格式无效');
      }
      this.projects = data;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        // 保留原文件，避免损坏的配置被静默覆盖。
        await copyFile(path.join(this.directory, 'projects.json'), path.join(this.directory, `projects.corrupt-${Date.now()}.json`)).catch(() => undefined);
        throw new Error('项目配置无法读取，原文件已保留。请检查应用数据目录中的 projects.json。');
      }
    }
  }
  list(): Project[] { return structuredClone(this.projects); }
  get(id: string): Project {
    const project = this.projects.find(p => p.id === id);
    if (!project) throw new Error('项目不存在，请重新选择');
    return structuredClone(project);
  }
  private async persist(): Promise<void> {
    const snapshot = JSON.stringify(this.projects, null, 2);
    await this.queue.run('store', async () => {
      const file = path.join(this.directory, 'projects.json');
      const temp = `${file}.tmp`;
      await writeFile(temp, snapshot, 'utf8');
      await rename(temp, file);
    });
  }
  async add(directory: string, services: ServiceProfile[] = []): Promise<Project> {
    const canonical = await realpath(directory);
    if (!(await stat(canonical)).isDirectory()) throw new Error('请选择项目文件夹');
    const existing = this.projects.find(p => process.platform === 'win32' ? p.path.toLowerCase() === canonical.toLowerCase() : p.path === canonical);
    if (existing) return this.activate(existing.id);
    const project: Project = { id: randomUUID(), name: path.basename(canonical), path: canonical,
      favorite: false, lastOpened: new Date().toISOString(), services };
    this.projects.push(project);
    await this.persist();
    return structuredClone(project);
  }
  async activate(id: string): Promise<Project> {
    const project = this.projects.find(p => p.id === id);
    if (!project) throw new Error('项目不存在');
    project.lastOpened = new Date().toISOString();
    await this.persist(); return structuredClone(project);
  }
  async favorite(id: string): Promise<Project> {
    const project = this.projects.find(p => p.id === id);
    if (!project) throw new Error('项目不存在');
    project.favorite = !project.favorite; await this.persist(); return structuredClone(project);
  }
  async services(id: string, services: ServiceProfile[]): Promise<Project> {
    const project = this.projects.find(p => p.id === id);
    if (!project) throw new Error('项目不存在');
    project.services = structuredClone(services); await this.persist(); return structuredClone(project);
  }
  async remove(id: string): Promise<void> {
    this.projects = this.projects.filter(p => p.id !== id); await this.persist();
  }
}
