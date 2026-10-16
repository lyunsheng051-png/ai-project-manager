import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, symlink, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readTextFile, saveTextFile } from '../electron/services/files';

const fixture = () => mkdtemp(path.join(tmpdir(), 'aipm-editor-'));

test('编辑 UTF-8 文件，保留 BOM、中文和 CRLF 换行，保存后无临时文件', async () => {
  const root = await fixture(); const original = '\uFEFF第一行\r\n第二行\r\n';
  await writeFile(path.join(root, '说明.md'), original);
  assert.equal(await readTextFile(root, '说明.md'), original);
  const saved = await saveTextFile(root, '说明.md', '新内容\n下一行\n', original);
  assert.equal(saved, '\uFEFF新内容\r\n下一行\r\n');
  assert.equal(await readFile(path.join(root, '说明.md'), 'utf8'), saved);
  assert.deepEqual(await readdir(root), ['说明.md']);
  assert.equal(await saveTextFile(root, '说明.md', '', saved), '\uFEFF');
});

test('拒绝覆盖外部修改或用过期内容保存，并保留磁盘文件', async () => {
  const root = await fixture(); const target = path.join(root, 'example.txt');
  await writeFile(target, 'original'); await writeFile(target, 'external');
  await assert.rejects(saveTextFile(root, 'example.txt', 'draft', 'original'), /其他程序修改/);
  assert.equal(await readFile(target, 'utf8'), 'external');
  await assert.rejects(saveTextFile(root, 'missing.txt', 'new', ''), /ENOENT/);
  await assert.rejects(access(path.join(root, 'missing.txt')));
  assert.deepEqual(await readdir(root), ['example.txt']);
});

test('并发保存同一文件时仅一个版本成功，过期版本不能覆盖', async () => {
  const root = await fixture(); await writeFile(path.join(root, 'file.txt'), 'original');
  const results = await Promise.allSettled([
    saveTextFile(root, 'file.txt', 'first', 'original'), saveTextFile(root, 'file.txt', 'second', 'original'),
  ]);
  const succeeded = results.filter(result => result.status === 'fulfilled');
  assert.equal(succeeded.length, 1); assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  assert.equal(await readFile(path.join(root, 'file.txt'), 'utf8'), succeeded[0]!.value);
});

test('编辑限制拒绝二进制、非 UTF-8、超大内容和 Git 内部文件', async () => {
  const root = await fixture();
  await writeFile(path.join(root, 'binary.bin'), Buffer.from([65, 0, 66]));
  await writeFile(path.join(root, 'gbk.txt'), Buffer.from([0xc4, 0xe3, 0xba, 0xc3]));
  await writeFile(path.join(root, 'text.txt'), 'keep');
  await mkdir(path.join(root, '.git')); await writeFile(path.join(root, '.git', 'config'), 'keep');
  await assert.rejects(readTextFile(root, 'gbk.txt'), /UTF-8/);
  await assert.rejects(saveTextFile(root, 'gbk.txt', 'draft', ''), /UTF-8/);
  await assert.rejects(saveTextFile(root, 'binary.bin', 'draft', 'A\0B'), /二进制/);
  await assert.rejects(saveTextFile(root, 'text.txt', 'A\0B', 'keep'), /二进制/);
  await assert.rejects(saveTextFile(root, 'text.txt', '中'.repeat(400_000), 'keep'), /1 MB/);
  await assert.rejects(saveTextFile(root, '.git/config', 'draft', 'keep'), /Git 内部/);
  assert.equal(await readFile(path.join(root, 'text.txt'), 'utf8'), 'keep');
});

test('保存拒绝越过项目边界的路径和 junction', async () => {
  const root = await fixture(); const outside = await fixture(); await writeFile(path.join(outside, 'file.txt'), 'outside');
  await symlink(outside, path.join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(saveTextFile(root, 'linked/file.txt', 'draft', 'outside'), /只能访问/);
  await assert.rejects(saveTextFile(root, path.join(outside, 'file.txt'), 'draft', 'outside'), /只能访问/);
  assert.equal(await readFile(path.join(outside, 'file.txt'), 'utf8'), 'outside');
});
