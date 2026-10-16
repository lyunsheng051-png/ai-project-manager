import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { ServiceProfile } from '../../shared/contracts';

export const ignoredDirectories = new Set(['.git', 'node_modules', '.venv', 'venv', 'dist', 'target', '.next', '.nuxt', 'build', 'coverage', '__pycache__', '.runtime', '.idea']);
const read = async (file: string) => {
  try { if ((await stat(file)).size > 256_000) return ''; return await readFile(file, 'utf8'); } catch { return ''; }
};
function profile(directory: string, suffix: string, value: Partial<ServiceProfile>): ServiceProfile {
  return { id: createHash('sha256').update(`${directory}:${suffix}`).digest('hex').slice(0, 16),
    name: directory === '.' ? '主服务' : path.basename(directory), kind: 'task', directory,
    command: '', url: '', environment: {}, dependsOn: [], evidence: '', ...value };
}
export async function scanProject(root: string): Promise<ServiceProfile[]> {
  const found: ServiceProfile[] = [];
  const pending = [{ directory: root, depth: 0 }];
  let visited = 0;
  while (pending.length && visited++ < 500) {
    const current = pending.shift()!;
    const entries = await readdir(current.directory, { withFileTypes: true }).catch(() => []);
    const names = new Set(entries.map(e => e.name));
    const relative = path.relative(root, current.directory).replaceAll('\\', '/') || '.';
    if (names.has('package.json')) {
      try {
        const manifest = JSON.parse(await read(path.join(current.directory, 'package.json')));
        const scripts = manifest.scripts ?? {};
        const script = ['dev', 'start', 'serve'].find(name => typeof scripts[name] === 'string');
        if (script) {
          const dependencies = { ...manifest.dependencies, ...manifest.devDependencies };
          const frontend = Boolean(dependencies.vue || dependencies.react || dependencies.vite || dependencies.next || dependencies.nuxt);
          const declared = String(manifest.packageManager ?? '').split('@')[0];
          const manager = ['npm', 'pnpm', 'yarn', 'bun'].includes(declared) ? declared
            : names.has('pnpm-lock.yaml') ? 'pnpm' : names.has('yarn.lock') ? 'yarn' : names.has('bun.lock') || names.has('bun.lockb') ? 'bun' : 'npm';
          const command = manager === 'yarn' ? `yarn ${script}` : `${manager} run ${script}`;
          const label = relative === '.' ? (manifest.name || 'Node 服务') : path.basename(relative);
          found.push(profile(relative, 'node', { name: label, kind: frontend ? 'frontend' : 'backend', command,
            evidence: `package.json · scripts.${script} = ${String(scripts[script]).slice(0, 140)}` }));
        }
      } catch { /* 一个无效清单不影响其余服务的发现 */ }
    }
    if (names.has('pyproject.toml') || names.has('requirements.txt')) {
      const pyproject = await read(path.join(current.directory, 'pyproject.toml'));
      let entry = '';
      for (const candidate of ['app/main.py', 'main.py', 'src/main.py', 'api/main.py', 'app.py']) {
        const source = await read(path.join(current.directory, candidate));
        const match = source.match(/^([a-zA-Z_]\w*)\s*(?::[^=\n]+)?=\s*FastAPI\s*\(/m);
        if (match) { entry = `${candidate.slice(0, -3).replaceAll('/', '.')}:${match[1]}`; break; }
      }
      const isUv = names.has('uv.lock') || names.has('pyproject.toml');
      const command = entry ? `${isUv ? 'uv run ' : 'python -m '}uvicorn ${entry} --reload` : '';
      const pythonName = pyproject.match(/^name\s*=\s*["']([^"']+)/m)?.[1] || (relative === '.' ? 'Python 后端' : path.basename(relative));
      found.push(profile(relative, 'python', { name: pythonName, kind: 'backend', command,
        evidence: entry ? `检测到 FastAPI 实例：${entry}` : '已发现 Python 描述文件，请补充启动命令' }));
    }
    if (names.has('pom.xml') || names.has('build.gradle') || names.has('build.gradle.kts')) {
      const descriptor = names.has('pom.xml') ? 'pom.xml' : names.has('build.gradle.kts') ? 'build.gradle.kts' : 'build.gradle';
      const content = await read(path.join(current.directory, descriptor));
      const spring = /spring-boot|org.springframework.boot/.test(content);
      const aggregator = descriptor === 'pom.xml' && /<packaging>\s*pom\s*<\/packaging>/.test(content);
      let command = '';
      if (spring && !aggregator) {
        if (descriptor === 'pom.xml') command = names.has('mvnw.cmd') ? '.\\mvnw.cmd spring-boot:run' : 'mvn spring-boot:run';
        else command = names.has('gradlew.bat') ? '.\\gradlew.bat bootRun' : 'gradle bootRun';
      }
      found.push(profile(relative, 'java', { name: relative === '.' ? 'Java 服务' : path.basename(relative), kind: 'java', command,
        evidence: `${descriptor}${aggregator ? ' · 聚合模块，请选择可运行模块' : command ? ' · Spring Boot 候选命令，请核对' : ' · 请配置启动命令'}` }));
    }
    if (current.depth < 3) {
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.isSymbolicLink() && !ignoredDirectories.has(entry.name) && !entry.name.startsWith('.')) {
          pending.push({ directory: path.join(current.directory, entry.name), depth: current.depth + 1 });
        }
      }
    }
  }
  return found;
}

export function mergeScannedServices(existing: ServiceProfile[], scanned: ServiceProfile[]): ServiceProfile[] {
  const existingIds = new Set(existing.map(s => s.id));
  return [...existing, ...scanned.filter(s => !existingIds.has(s.id))];
}
