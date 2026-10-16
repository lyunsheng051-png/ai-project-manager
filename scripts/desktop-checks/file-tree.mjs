import assert from 'node:assert/strict';
import { mkdir, rmdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { captureDesktop } from './screenshots.mjs';

export async function verifyFileTree(page, root, application) {
  const nested = path.join(root, 'tree-example', '一级目录', '二级目录');
  await mkdir(nested, { recursive: true });
  await writeFile(path.join(nested, '说明.md'), 'TREE_CONTENT\n');
  await mkdir(path.join(root, 'empty-directory')); await mkdir(path.join(root, 'retry-directory'));
  const names = Array.from({ length: 20 }, (_, index) => `example-${String(index).padStart(2, '0')}.txt`);
  for (const name of names) await writeFile(path.join(root, name), 'text\n');
  await page.getByRole('button', { name: '刷新目录', exact: true }).click();
  const tree = page.getByRole('tree', { name: '项目文件目录', exact: true });
  const item = name => tree.getByRole('treeitem', { name, exact: true });
  await item(names.at(-1)).waitFor();
  assert.equal(await page.locator('.file-panel .pagination').count(), 0);
  for (const name of names) assert.equal(await item(name).count(), 1);
  assert.equal(await item('说明.md').count(), 0, 'collapsed descendants must not appear');
  assert.equal(await item('README.md').count(), 1, 'README remains available beyond the former page boundary');
  assert.equal(await tree.evaluate(element => element.scrollHeight > element.clientHeight), true);
  await tree.hover(); await page.mouse.wheel(0, 500);
  await page.waitForFunction(() => document.querySelector('.file-tree').scrollTop > 0);

  await item('tree-example').click(); await item('一级目录').click(); await item('二级目录').click();
  await item('说明.md').click(); await page.getByText('TREE_CONTENT', { exact: false }).waitFor();
  assert.equal(await item('说明.md').getAttribute('aria-level'), '5');
  await item('tree-example').press('ArrowLeft'); assert.equal(await item('说明.md').count(), 0);
  await page.getByRole('button', { name: '刷新目录', exact: true }).click();
  await item('tree-example').waitFor(); await item('tree-example').press('ArrowRight');
  await item('说明.md').waitFor();
  await item('tree-example').press('ArrowRight');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.path), 'tree-example/一级目录');
  await writeFile(path.join(nested, '新增.ts'), 'export const added = true;\n');
  await page.getByRole('button', { name: '刷新目录', exact: true }).click(); await item('新增.ts').waitFor();
  assert.equal(await item('二级目录').getAttribute('aria-expanded'), 'true');

  await item('empty-directory').click();
  await page.waitForFunction(() => document.querySelector('[data-path="empty-directory"]').textContent.includes('空'));
  await rmdir(path.join(root, 'retry-directory')); await item('retry-directory').click();
  await page.waitForFunction(() => document.querySelector('[data-path="retry-directory"]').textContent.includes('读取失败'));
  await mkdir(path.join(root, 'retry-directory')); await item('retry-directory').click();
  await page.waitForFunction(() => !document.querySelector('[data-path="retry-directory"]').classList.contains('has-error'));

  await page.getByRole('button', { name: '全部收起', exact: true }).click();
  assert.equal(await item('一级目录').count(), 0); assert.equal(await item('README.md').count(), 1);
  await item('README.md').click();
  await page.locator('.file-document:visible .cm-content').waitFor();
  await item('tree-example').click(); await item('一级目录').click(); await item('二级目录').click();
  await tree.evaluate(element => { element.scrollTop = 0; });
  await captureDesktop(application, '.runtime/screenshots/file-tree.png');
  console.log('PASS file tree without pagination, README and all root files, wheel scrolling, lazy nested expansion, keyboard navigation, refresh state, empty folders, failure retry and collapse all');
}
