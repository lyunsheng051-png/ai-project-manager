import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

export async function verifyGitFiles(page, root, call, projectId) {
  const names = [...Array.from({ length: 12 }, (_, i) => `src/components/component-${String(i).padStart(2, '0')}.vue`),
    ...Array.from({ length: 12 }, (_, i) => `src/views/page-${String(i).padStart(2, '0')}.ts`), 'src/views/深层目录/中文 文件.ts'];
  for (const name of names) {
    await mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await writeFile(path.join(root, name), 'export const gitFilePreview = "nested-file-content";\n');
  }
  await mkdir(path.join(root, 'src/generated'), { recursive: true });
  await writeFile(path.join(root, 'src/generated/ignored.ts'), 'ignored\n');
  await writeFile(path.join(root, '.git/info/exclude'), 'src/generated/\n');
  await page.getByRole('button', { name: 'Git 变更' }).click();
  await page.waitForFunction(count => document.querySelectorAll('.change-row').length === count, names.length + 1);
  const list = page.getByRole('region', { name: '变更文件列表' });
  assert.equal(await page.locator('.changes-column .pagination').count(), 0);
  assert.equal(await list.getByRole('checkbox').count(), names.length + 1);
  assert.equal(await list.evaluate(element => element.scrollHeight > element.clientHeight), true);
  await list.hover(); await page.mouse.wheel(0, 600);
  await page.waitForFunction(() => document.querySelector('.change-list').scrollTop > 0);
  const target = names.at(-1);
  await list.getByRole('button', { name: target, exact: false }).click();
  await page.waitForFunction(() => document.querySelector('.diff-content')?.textContent.includes('nested-file-content'));
  await page.screenshot({ path: '.runtime/screenshots/git-nested-files.png' });
  const checkbox = page.getByRole('checkbox', { name: `选择 ${target}`, exact: true });
  await checkbox.check();
  assert.equal(await page.getByRole('checkbox', { name: '选择全部变更文件' }).evaluate(element => element.indeterminate), true);
  await page.getByRole('button', { name: '暂存', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.staged-indicator').length === 1);
  assert.deepEqual((await call('git:status', { projectId })).files.filter(f => f.staged).map(f => f.path), [target]);
  await checkbox.check(); await page.getByRole('button', { name: '取消暂存', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.staged-indicator').length === 0);
  await page.getByRole('checkbox', { name: '选择全部变更文件' }).check();
  assert.equal(await list.getByRole('checkbox', { checked: true }).count(), names.length + 1);
  await page.getByRole('button', { name: '暂存', exact: true }).click();
  await page.waitForFunction(count => document.querySelectorAll('.staged-indicator').length === count, names.length + 1);
  const status = await call('git:status', { projectId });
  assert.equal(status.files.length, names.length + 1); assert.equal(status.files.every(f => f.staged), true);
  assert.ok((await page.getByText('已暂存所选文件', { exact: true }).last().boundingBox()).height < 70, 'successful bulk operation must not cover the workspace with raw Git output');
  console.log('PASS nested Git files, ignore rules, mouse wheel scrolling, preview, selective staging, unstage and select all without pagination');
}
