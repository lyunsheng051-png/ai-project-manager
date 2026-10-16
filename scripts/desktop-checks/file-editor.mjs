import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const activeEditor = page => page.locator('.file-document:visible .cm-content');
export async function replaceEditorText(page, text) {
  const editor = activeEditor(page); await editor.click(); await editor.press('Control+a');
  await page.keyboard.insertText(text);
}
export async function editorText(page) {
  return page.locator('.file-document:visible .cm-line').allTextContents().then(lines => lines.join('\n'));
}
export async function verifyFileEditor(page, root, call, projectId) {
  const editor = activeEditor(page); await editor.waitFor();
  const saved = '# 桌面编辑验证\n\n通过 Ctrl+S 保存。\n';
  await replaceEditorText(page, saved); await editor.press('Control+s');
  await page.getByText('已保存 README.md', { exact: true }).last().waitFor();
  assert.equal(await readFile(path.join(root, 'README.md'), 'utf8'), saved);
  assert.equal((await call('git:status', { projectId })).files.some(file => file.path === 'README.md' && file.unstaged), true);

  await replaceEditorText(page, '未保存的草稿');
  await page.getByRole('button', { name: 'Git 变更', exact: false }).click();
  await page.getByRole('button', { name: '文件浏览', exact: true }).click();
  assert.equal(await editorText(page), '未保存的草稿');
  assert.equal(await readFile(path.join(root, 'README.md'), 'utf8'), saved, 'switching panels must not save');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: '关闭文件 README.md', exact: true }).click();
  assert.equal(await editorText(page), '未保存的草稿');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '关闭文件 README.md', exact: true }).click();
  await page.getByRole('treeitem', { name: 'README.md', exact: true }).click(); await editor.waitFor();
  assert.equal(await editorText(page), saved);

  await replaceEditorText(page, '必须保留的编辑内容');
  await writeFile(path.join(root, 'README.md'), '外部工具更新\n');
  await editor.press('Control+s');
  await page.locator('.toast.error').filter({ hasText: '文件已被其他程序修改' }).waitFor();
  assert.equal(await editorText(page), '必须保留的编辑内容');
  assert.equal(await readFile(path.join(root, 'README.md'), 'utf8'), '外部工具更新\n');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '重新读取文件', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.file-document:not([style*="display: none"]) .cm-content')?.textContent.includes('外部工具更新'));
  console.log('PASS default editing, Ctrl+S, saved Git changes, retained drafts across panels, dirty tab close guard, external modification protection and reload');
}
