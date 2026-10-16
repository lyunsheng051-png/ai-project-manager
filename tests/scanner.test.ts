import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { scanProject, mergeScannedServices } from '../electron/services/scanner';
import { withinProject, validateCloneName, validateRemote } from '../electron/core/paths';
import { listFiles, readTextFile } from '../electron/services/files';
import { ProjectStore } from '../electron/repositories/project-store';

async function fixture() { return mkdtemp(path.join(tmpdir(), 'aipm-unit-')); }
async function file(root: string, name: string, content: string) { await mkdir(path.dirname(path.join(root, name)), { recursive: true }); await writeFile(path.join(root, name), content); }

test('扫描多服务项目：Vue、FastAPI、Java与无关依赖目录', async () => {
  const root = await fixture();
  await file(root, 'web/package.json', JSON.stringify({ name: 'frontend', scripts: { dev: 'vite' }, dependencies: { vue: '*' } }));
  await file(root, 'api/pyproject.toml', '[project]\nname="example-api"\ndependencies=["fastapi"]');
  await file(root, 'api/app/main.py', 'from fastapi import FastAPI\napp = FastAPI()');
  await file(root, 'java/pom.xml', '<project><dependency>spring-boot</dependency></project>');
  await file(root, 'web/node_modules/ignored/package.json', '{"scripts":{"start":"node app.js"}}');
  const profiles = await scanProject(root);
  assert.equal(profiles.length, 3);
  assert.equal(profiles.find(s => s.kind === 'frontend')?.command, 'npm run dev');
  assert.equal(profiles.find(s => s.name === 'example-api')?.command, 'uv run uvicorn app.main:app --reload');
  assert.equal(profiles.find(s => s.kind === 'java')?.command, 'mvn spring-boot:run');
  assert.equal(new Set(profiles.map(s => s.id)).size, 3);
});
test('不会为未确认的 Python 入口伪造启动命令', async () => {
  const root = await fixture(); await file(root, 'pyproject.toml', '[project]\nname="worker"');
  const profiles = await scanProject(root); assert.equal(profiles[0].command, '');
});
test('重复扫描保留用户修改的命令并添加新服务', async () => {
  const root = await fixture(); await file(root, 'package.json', '{"scripts":{"dev":"vite"}}');
  const profiles = await scanProject(root); profiles[0].command = 'npm run dev -- --port 3333';
  await file(root, 'new/package.json', '{"scripts":{"start":"node index.js"}}');
  const merged = mergeScannedServices(profiles, await scanProject(root));
  assert.equal(merged.length, 2); assert.equal(merged[0].command, 'npm run dev -- --port 3333');
});
test('清单损坏不影响其他目录扫描', async () => {
  const root = await fixture(); await file(root, 'package.json', '{invalid'); await file(root, 'ok/package.json', '{"scripts":{"dev":"vite"}}');
  assert.equal((await scanProject(root)).length, 1);
});
test('按清单使用原仓库包管理器', async () => {
  const root = await fixture(); await file(root, 'package.json', '{"packageManager":"pnpm@10","scripts":{"dev":"vite"}}');
  assert.equal((await scanProject(root))[0].command, 'pnpm run dev');
});
test('路径限制拒绝父目录和前缀相似目录', async () => {
  const root = await fixture(); const sibling = `${root}-other`; await mkdir(sibling); await file(sibling, 'secret.txt', 'private');
  await assert.rejects(withinProject(root, `../${path.basename(sibling)}/secret.txt`), /只能访问/);
  await assert.rejects(withinProject(root, sibling), /只能访问/);
});
test('文件访问拒绝指向项目外的符号链接或junction', async () => {
  const root = await fixture(); const outside = await fixture(); await file(outside, 'secret.txt', 'private');
  await symlink(outside, path.join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(readTextFile(root, 'linked/secret.txt'), /只能访问/);
  assert.equal((await listFiles(root, '')).length, 0);
});
test('文本预览拒绝二进制和超大文件', async () => {
  const root = await fixture(); await file(root, 'binary.bin', 'a\0b'); await file(root, 'large.txt', 'x'.repeat(1_000_001));
  await assert.rejects(readTextFile(root, 'binary.bin'), /二进制/); await assert.rejects(readTextFile(root, 'large.txt'), /1 MB/);
});
test('克隆目录拒绝路径穿越、Windows保留名和远端可执行协议', () => {
  for (const name of ['..', '../repo', 'CON', 'NUL.txt', 'repo.']) assert.throws(() => validateCloneName(name));
  assert.equal(validateCloneName('我的项目'), '我的项目');
  for (const remote of ['ext::evil', 'file:///C:/repo', '--upload-pack=bad', 'https://name:token@github.com/repo']) assert.throws(() => validateRemote(remote));
  assert.equal(validateRemote('git@github.com:user/repo.git'), 'git@github.com:user/repo.git');
});
test('项目元数据持久化、去重，移除记录不删除项目', async () => {
  const root = await fixture(); const data = await fixture(); await file(root, 'keep.txt', 'keep');
  const store = new ProjectStore(data); await store.load(); const project = await store.add(root); await store.add(root);
  assert.equal(store.list().length, 1); await store.favorite(project.id);
  const reloaded = new ProjectStore(data); await reloaded.load(); assert.equal(reloaded.get(project.id).favorite, true);
  await reloaded.remove(project.id); assert.equal(await readTextFile(root, 'keep.txt'), 'keep');
});
test('配置损坏时保留原文件并报告错误', async () => {
  const data = await fixture(); await file(data, 'projects.json', '{broken');
  await assert.rejects(new ProjectStore(data).load(), /原文件已保留/);
});
