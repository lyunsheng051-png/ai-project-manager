import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function verifyFileEditor(page, root, call, projectId) {
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  const editor = page.getByRole('textbox', { name: '文件内容', exact: true });
  const saved = '# 桌面编辑验证\n\n通过 Ctrl+S 保存。\n';
  await editor.fill(saved); await editor.press('Control+s');
  await page.getByText('文件已保存', { exact: true }).last().waitFor();
  assert.equal(await readFile(path.join(root, 'README.md'), 'utf8'), saved);
  assert.equal((await call('git:status', { projectId })).files.some(file => file.path === 'README.md' && file.unstaged), true);

  await editor.fill('未保存的草稿');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Git 变更', exact: false }).click();
  assert.equal(await editor.inputValue(), '未保存的草稿');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Git 变更', exact: false }).click();
  await page.getByRole('region', { name: '变更文件列表' }).waitFor();
  await page.getByRole('button', { name: '文件浏览', exact: true }).click();
  await page.getByRole('button', { name: /README.md/ }).click();
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  assert.equal(await editor.inputValue(), saved);

  await editor.fill('必须保留的编辑内容');
  await writeFile(path.join(root, 'README.md'), '外部工具更新\n');
  await editor.press('Control+s');
  await page.locator('.toast.error').filter({ hasText: '文件已被其他程序修改' }).waitFor();
  assert.equal(await editor.inputValue(), '必须保留的编辑内容');
  assert.equal(await readFile(path.join(root, 'README.md'), 'utf8'), '外部工具更新\n');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '取消编辑', exact: true }).click();
  await page.getByRole('button', { name: '重新读取文件', exact: true }).click();
  await page.getByText('外部工具更新', { exact: false }).last().waitFor();
  console.log('PASS text editing, Ctrl+S, saved Git changes, unsaved navigation guard, external modification protection and reload');
}
