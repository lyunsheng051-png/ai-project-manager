import assert from 'node:assert/strict';
import { writeFile, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { captureDesktop } from './screenshots.mjs';
import { editorText } from './file-editor.mjs';

export async function verifyFilePreviews(page, root, call, projectId, application) {
  const git = args => execFileSync('git', ['-C', root, ...args], { windowsHide: true });
  const original = 'export const version = 1;\n';
  const tracked = ['preview-clean.ts', 'preview-modified.java', 'preview-partial.ts'];
  for (const name of tracked) await writeFile(path.join(root, name), original);
  git(['add', '--', ...tracked]); git(['commit', '--only', '-m', 'test: preview baseline', '--', ...tracked]);
  const code = '// 中文注释\nexport const message: string = "hello";\nexport function greet(name: string) {\n  return `${message}, ${name}`;\n}\n';
  await writeFile(path.join(root, 'preview-new.ts'), code);
  await writeFile(path.join(root, 'preview-staged.ts'), 'export const staged = true;\n');
  await writeFile(path.join(root, 'preview-modified.java'), 'public class Example {\n  String name = "hello";\n}\n');
  await writeFile(path.join(root, 'preview-partial.ts'), 'export const version = 2;\n');
  await call('git:stage', { projectId, paths: ['preview-staged.ts', 'preview-partial.ts'] });
  await writeFile(path.join(root, 'preview-partial.ts'), 'export const version = 3;\n');
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" rx="24" fill="#233c59"/><circle cx="320" cy="148" r="64" fill="#74a7df"/><path d="M200 280 L320 200 L440 280 Z" fill="#b0d1f4"/></svg>';
  await writeFile(path.join(root, 'preview-image.svg'), svg);
  await writeFile(path.join(root, 'preview-pixel.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=', 'base64'));
  await writeFile(path.join(root, 'preview.html'), '<script>window.__fileInjected = true;</script>\n<img src=x onerror="window.__fileInjected = true">\n');
  await writeFile(path.join(root, 'preview-corrupt.png'), 'not an image');
  await page.getByRole('button', { name: '刷新目录', exact: true }).click();
  const item = name => page.getByRole('treeitem', { name, exact: true });
  const tone = name => item(name).locator('.tree-entry-name');
  const waitTone = (name, state) => page.waitForFunction(({ name, state }) => [...document.querySelectorAll('[role="treeitem"]')].find(e => e.getAttribute('aria-label') === name)?.querySelector('.tree-entry-name').classList.contains(`git-${state}`), { name, state });
  for (const [name, state] of [['preview-new.ts', 'untracked'], ['preview-staged.ts', 'staged'], ['preview-modified.java', 'modified'], ['preview-partial.ts', 'modified'], ['preview-clean.ts', 'normal']]) await waitTone(name, state);
  const colors = await Promise.all(['preview-new.ts', 'preview-staged.ts', 'preview-modified.java', 'preview-clean.ts'].map(name => tone(name).evaluate(element => getComputedStyle(element).color)));
  assert.equal(new Set(colors).size, 4);

  await item('preview-new.ts').click();
  await page.locator('.file-document:visible .code-editor[data-language="typescript"] .cm-content').waitFor();
  assert.equal(await editorText(page), code);
  assert.equal(await page.locator('.file-document:visible .cm-lineNumbers .cm-gutterElement').count() >= 6, true);
  assert.equal(await tone('preview-new.ts').evaluate(element => getComputedStyle(element).color), colors[0], 'selection must preserve Git color');
  assert.equal(await page.locator('.file-document:visible .code-editor').evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(30, 31, 34)');
  await captureDesktop(application, '.runtime/screenshots/code-preview.png');
  await item('preview.html').click();
  await page.locator('.file-document:visible .code-editor[data-language="xml"] .cm-content').waitFor();
  assert.equal(await page.locator('.file-document:visible .cm-content script, .file-document:visible .cm-content img').count(), 0);
  assert.equal(await page.evaluate(() => window.__fileInjected), undefined);

  await page.getByRole('button', { name: 'Git 变更', exact: false }).click();
  await page.getByRole('checkbox', { name: '选择 preview-new.ts', exact: true }).check();
  await page.getByRole('button', { name: '暂存', exact: true }).click();
  await page.getByText('已暂存所选文件', { exact: true }).last().waitFor();
  await page.getByRole('button', { name: '文件浏览', exact: true }).click(); await waitTone('preview-new.ts', 'staged');
  await call('git:commit', { projectId, message: 'test: preview stage colors' });
  await page.getByRole('button', { name: '刷新目录', exact: true }).click(); await waitTone('preview-new.ts', 'normal');

  await item('preview-pixel.png').click();
  await page.waitForFunction(() => [...document.querySelectorAll('.file-document')].find(element => getComputedStyle(element).display !== 'none')?.querySelector('.image-preview img')?.naturalWidth > 0);
  assert.equal(await page.getByRole('button', { name: '编辑', exact: true }).count(), 0);
  await item('preview-image.svg').click();
  await page.getByText('640 × 360 px', { exact: false }).waitFor();
  assert.equal(await page.getByRole('textbox', { name: '文件内容', exact: true }).count(), 0);
  await page.getByRole('button', { name: '放大图片', exact: true }).click(); assert.equal(await page.locator('.file-document:visible .image-scale').textContent(), '125%');
  await page.getByRole('button', { name: '原始尺寸', exact: true }).click(); assert.equal(await page.locator('.file-document:visible .image-scale').textContent(), '100%');
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1000, 680));
  await page.waitForFunction(() => innerWidth < 1050);
  await page.getByRole('button', { name: '适应窗口', exact: true }).click();
  assert.equal(await page.locator('.file-document:visible .image-preview-viewport').evaluate(element => { const image = element.querySelector('img').getBoundingClientRect(); const box = element.getBoundingClientRect(); return image.width <= box.width && image.height <= box.height; }), true);
  await captureDesktop(application, '.runtime/screenshots/image-preview.png');
  await assert.rejects(call('files:save', { projectId, path: 'preview-image.svg', original: svg, content: '<svg/>' }), /图片仅支持预览/);
  assert.equal(await readFile(path.join(root, 'preview-image.svg'), 'utf8'), svg);
  await item('preview-corrupt.png').click(); await page.getByText('图片内容与格式不符', { exact: false }).last().waitFor();
  assert.equal(await page.getByRole('button', { name: '编辑', exact: true }).count(), 0);
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 940));
  await item('README.md').click(); await page.locator('.file-document:visible .cm-content').waitFor();
  console.log('PASS Git tree colors including partial stage and UI stage/commit transitions, dark syntax preview and line numbers, escaped source HTML, PNG/SVG preview, image zoom/fit, image write rejection and corrupt image feedback');
}

