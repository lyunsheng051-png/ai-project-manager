import { packager } from '@electron/packager';
import { build as buildRenderer } from 'vite';
import { build as bundleMain } from 'esbuild';
import { cp, mkdir, mkdtemp, readFile, writeFile, stat, readdir, unlink } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
process.chdir(root);
if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('此脚本需要在 Windows x64 主机上运行。');
const require = createRequire(import.meta.url);
const metadata = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const electronVersion = require('electron/package.json').version;
const ptyVersion = require('node-pty/package.json').version;
const output = path.join(root, 'release');
await mkdir(output, { recursive: true });
await mkdir(path.join(root, '.runtime'), { recursive: true });
const working = await mkdtemp(path.join(root, '.runtime', 'package-'));
const stage = path.join(working, 'app');
await mkdir(stage);

console.log('[1/4] 准备安装版界面资源…');
// 安装包必须包含编译后的界面；这是发行打包步骤，不是日常开发检查。
await buildRenderer({ base: './', build: { outDir: path.join(stage, 'renderer'), emptyOutDir: true, sourcemap: false } });
console.log('[2/4] 打包桌面主进程和 PTY 原生组件…');
await bundleMain({ entryPoints: ['electron/main.ts'], bundle: true, platform: 'node', format: 'cjs', target: 'node22',
  outfile: path.join(stage, 'main.cjs'), external: ['electron', 'node-pty'], minify: true, sourcemap: false, legalComments: 'eof' });
await cp('electron/preload.cjs', path.join(stage, 'preload.cjs'));
await mkdir(path.join(stage, 'resources'));
for (const name of ['icon.ico', 'icon.png']) await cp(path.join(root, 'resources', name), path.join(stage, 'resources', name));
for (const name of ['LICENSE', 'README.md', 'README.en.md']) await cp(path.join(root, name), path.join(stage, name));
// node-pty 的 DLL、控制台宿主与 Worker 脚本必须是实际文件，不能放入 ASAR。
const ptySource = path.join(root, 'node_modules', 'node-pty');
const ptyTarget = path.join(stage, 'node_modules', 'node-pty');
await mkdir(ptyTarget, { recursive: true });
await cp(path.join(ptySource, 'LICENSE'), path.join(ptyTarget, 'LICENSE'));
await cp(path.join(ptySource, 'lib'), path.join(ptyTarget, 'lib'), { recursive: true,
  filter: source => !source.endsWith('.map') && !source.endsWith('.test.js'),
});
// node-addon-api 只在编译原生扩展时使用，预编译的 node-pty 运行时不需要其头文件。
const ptyMetadata = JSON.parse(await readFile(path.join(ptySource, 'package.json'), 'utf8'));
await writeFile(path.join(ptyTarget, 'package.json'), JSON.stringify({ name: ptyMetadata.name, version: ptyMetadata.version,
  main: ptyMetadata.main, license: ptyMetadata.license }, null, 2));
await cp(path.join(ptySource, 'prebuilds', 'win32-x64'), path.join(ptyTarget, 'prebuilds', 'win32-x64'), {
  recursive: true, filter: source => !source.endsWith('.pdb'),
});
await writeFile(path.join(stage, 'package.json'), JSON.stringify({ name: metadata.name, productName: '项目工作台',
  version: metadata.version, description: metadata.description, author: 'liuyunsheng', license: metadata.license,
  main: 'main.cjs', dependencies: { 'node-pty': ptyVersion } }, null, 2));

// 保留实际捆绑的开源依赖许可证，不把源码、开发工具或本机项目配置打进安装包。
const seen = new Set(); const notices = ['AI Project Manager — third-party license notices'];
async function collectLicenses(name, fromDirectory = root) {
  let directory = fromDirectory;
  let packageDirectory; let manifest;
  while (true) {
    const candidate = path.join(directory, 'node_modules', name);
    try { manifest = JSON.parse(await readFile(path.join(candidate, 'package.json'), 'utf8')); packageDirectory = candidate; break; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const parent = path.dirname(directory); if (parent === directory) throw new Error(`无法定位运行依赖 ${name}`);
    directory = parent;
  }
  const id = `${manifest.name}@${manifest.version}`;
  if (seen.has(id)) return; seen.add(id);
  let license = '';
  for (const filename of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENSE-MIT', 'license', 'license.md']) {
    try { license = await readFile(path.join(packageDirectory, filename), 'utf8'); break; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  notices.push(`\n${'='.repeat(72)}\n${id} (${manifest.license || 'see package metadata'})\n${license}`);
  for (const dependency of Object.keys(manifest.dependencies || {})) await collectLicenses(dependency, packageDirectory);
}
for (const dependency of Object.keys(metadata.dependencies)) await collectLicenses(dependency);
await writeFile(path.join(stage, 'THIRD_PARTY_LICENSES.txt'), notices.join('\n'), 'utf8');

console.log('[3/4] 生成 Windows x64 应用目录并嵌入图标…');
// 直接使用 npm ci 已安装的 Electron，避免再次下载同一运行时。
const electronDirectory = path.join(path.dirname(require.resolve('electron/package.json')), 'dist');
const installedVersion = (await readFile(path.join(electronDirectory, 'version'), 'utf8')).trim();
if (installedVersion !== electronVersion) throw new Error('Electron 运行时与依赖版本不一致，请重新安装该依赖后打包。');
const electronZip = path.join(working, `electron-v${electronVersion}-win32-x64.zip`);
await new Promise((resolve, reject) => {
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    'Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory($env:AIPM_PACKAGE_ELECTRON_DIST, $env:AIPM_PACKAGE_ELECTRON_ZIP, [System.IO.Compression.CompressionLevel]::Fastest, $false)'],
  { windowsHide: true, stdio: 'inherit', env: { ...process.env, AIPM_PACKAGE_ELECTRON_DIST: electronDirectory, AIPM_PACKAGE_ELECTRON_ZIP: electronZip } });
  child.once('error', reject);
  child.once('exit', code => code === 0 ? resolve() : reject(new Error(`准备 Electron 运行时失败，退出码 ${code}`)));
});
const expectedOutput = path.resolve(output, 'AIProjectManager-win32-x64');
if (path.dirname(expectedOutput) !== path.resolve(output)) throw new Error('发行目录边界无效');
const electronLocales = new Set(['en-US.pak', 'zh-CN.pak']);
async function trimLocales({ buildPath }) {
  const directory = path.join(path.resolve(buildPath), 'locales');
  let removedBytes = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.pak') || electronLocales.has(entry.name)) continue;
    const filename = path.join(directory, entry.name);
    removedBytes += (await stat(filename)).size;
    await unlink(filename);
  }
  for (const filename of electronLocales) await stat(path.join(directory, filename));
  console.log(`语言包仅保留中英文，移除 ${(removedBytes / 1024 / 1024).toFixed(2)} MiB`);
}
const [applicationDirectory] = await packager({ dir: stage, name: 'AIProjectManager', executableName: 'AIProjectManager',
  platform: 'win32', arch: 'x64', electronVersion, appVersion: metadata.version, buildVersion: metadata.version,
  out: output, overwrite: true, prune: false, asar: false, electronZipDir: working, icon: path.join(root, 'resources', 'icon.ico'),
  afterExtract: [trimLocales],
  appCopyright: 'Copyright (c) 2026 liuyunsheng', win32metadata: {
    CompanyName: 'liuyunsheng', FileDescription: '项目工作台 · AI Project Manager', ProductName: 'AI Project Manager',
  } });
if (path.resolve(applicationDirectory) !== expectedOutput) throw new Error('应用输出目录与预期不一致');

console.log('[4/4] 使用 Inno Setup 编译 EXE 安装包…');
const installerArguments = [`/DAppVersion=${metadata.version}`, `/DAppSource=${applicationDirectory}`, `/DOutputDirectory=${output}`,
  path.join(root, 'installer', 'windows.iss')];
function runCompiler(command) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, installerArguments, { cwd: root, stdio: 'inherit', windowsHide: true });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Inno Setup 编译失败，退出码 ${code}`)));
  });
}
try { await runCompiler(process.env.ISCC_PATH || 'iscc'); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  // 仅在实际调用失败时检查 Inno Setup 的标准安装路径。
  const candidates = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs')]
    .filter(Boolean).map(directory => path.join(directory, 'Inno Setup 6', 'ISCC.exe'));
  let compiler;
  for (const candidate of candidates) if (await stat(candidate).then(info => info.isFile(), () => false)) { compiler = candidate; break; }
  if (!compiler) throw new Error('无法调用 Inno Setup 6；可通过 ISCC_PATH 指定 ISCC.exe。');
  await runCompiler(compiler);
}
const installer = path.join(output, `AIProjectManager-${metadata.version}-Setup-x64.exe`);
const hash = createHash('sha256');
for await (const chunk of createReadStream(installer)) hash.update(chunk);
await writeFile(`${installer}.sha256`, `${hash.digest('hex')}  ${path.basename(installer)}\n`, 'utf8');
console.log(`\n安装包已生成：${installer}`);
const installerBytes = (await stat(installer)).size;
async function directoryBytes(directory) {
  let bytes = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) bytes += await directoryBytes(filename);
    else if (entry.isFile()) bytes += (await stat(filename)).size;
  }
  return bytes;
}
const sizeReport = { version: metadata.version, installerBytes, installedBytes: await directoryBytes(applicationDirectory),
  appBytes: await directoryBytes(path.join(applicationDirectory, 'resources', 'app')),
  localeBytes: await directoryBytes(path.join(applicationDirectory, 'locales')), locales: [...electronLocales] };
await writeFile(path.join(output, `AIProjectManager-${metadata.version}-sizes.json`), JSON.stringify(sizeReport, null, 2), 'utf8');
console.log(`安装包 ${(installerBytes / 1024 / 1024).toFixed(2)} MiB，安装目录 ${(sizeReport.installedBytes / 1024 / 1024).toFixed(2)} MiB`);
