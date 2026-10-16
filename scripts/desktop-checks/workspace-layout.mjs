import assert from 'node:assert/strict';

async function geometry(page) {
  return page.evaluate(() => {
    const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height }; };
    const content = document.querySelector('.workspace-content');
    return { header: rect('.workspace-topbar'), tabs: rect('.project-tabs'), toolbar: rect('.git-toolbar'),
      files: rect('.change-list'), composer: rect('.commit-form'), commit: rect('.commit-compose .button'), dock: rect('.output-dock'),
      columns: rect('.git-columns'), content: rect('.workspace-content'), viewport: innerHeight,
      pageScroll: content.scrollHeight - content.clientHeight };
  });
}

export async function verifyWorkspaceLayout(page, application) {
  const normal = await geometry(page);
  assert.ok(normal.header.height <= 46 && normal.tabs.height <= 36, 'project context and navigation must be compact');
  assert.ok(normal.toolbar.height <= 34 && normal.columns.top <= 140, 'Git actions must use one toolbar row');
  assert.ok(normal.files.height >= 300, `normal window should prioritize the file list: ${normal.files.height}px`);
  assert.ok(normal.composer.height <= 100, 'commit input must remain compact');
  assert.ok(normal.commit.bottom < normal.dock.top && normal.pageScroll <= 1, 'commit action must be fully visible without outer scrolling');
  assert.equal(await page.locator('.workspace-topbar h1').count(), 1);

  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1000, 680));
  await page.waitForFunction(() => innerHeight < 700);
  const small = await geometry(page);
  assert.ok(small.files.height >= 90, `small window file list too small: ${small.files.height}px`);
  assert.ok(small.commit.bottom < small.dock.top && small.dock.bottom <= small.viewport && small.pageScroll <= 1, 'small window must not clip controls');
  await page.screenshot({ path: '.runtime/screenshots/compact-workspace-small.png' });

  await page.getByRole('button', { name: '运行服务', exact: true }).click();
  await page.getByRole('separator', { name: '调整输出面板高度' }).focus(); await page.keyboard.press('End');
  await page.getByRole('button', { name: 'Git 变更' }).click();
  await page.waitForFunction(() => document.querySelector('.workspace-content').getBoundingClientRect().height >= 260
    && document.querySelector('.output-dock').getBoundingClientRect().bottom <= innerHeight);
  const constrained = await geometry(page);
  assert.ok(constrained.files.height >= 60 && constrained.commit.bottom < constrained.dock.top, 'large terminal must preserve a usable Git area');
  await page.getByRole('separator', { name: '调整输出面板高度' }).dblclick();
  await page.getByRole('button', { name: '切换输出面板' }).click();
  const collapsed = await geometry(page); assert.ok(collapsed.files.height > small.files.height + 100);
  await page.getByRole('button', { name: '切换输出面板' }).click();

  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 940));
  await page.waitForFunction(() => innerHeight > 800);
  await page.getByRole('separator', { name: '调整输出面板高度' }).dblclick();
  await page.getByRole('button', { name: '服务日志', exact: true }).click();
  await page.getByRole('region', { name: '变更文件列表' }).getByRole('button', { name: /README.md/ }).click();
  await page.waitForFunction(() => document.querySelector('.diff-content')?.textContent.includes('@@'));
  await page.getByLabel('提交说明', { exact: false }).fill('feat: 改进项目工作台布局');
  await page.screenshot({ path: '.runtime/screenshots/compact-workspace.png' });
  console.log(`PASS compact workspace at 1440x940 and 1000x680, file list ${Math.round(normal.files.height)}px, project header ${normal.header.height}px, commit visible, dock bounds and collapse`);
}
