import assert from 'node:assert/strict';

const separator = page => page.getByRole('separator', { name: '调整输出面板高度' });
const dockHeight = page => page.locator('.output-dock').evaluate(element => element.getBoundingClientRect().height);
async function drag(page, delta) {
  const bounds = await separator(page).boundingBox();
  assert.ok(bounds);
  const x = bounds.x + bounds.width / 2; const y = bounds.y + bounds.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x, y - delta, { steps: 12 }); await page.mouse.up();
}
function near(actual, expected) { assert.ok(Math.abs(actual - expected) <= 2, `expected ${expected}px, received ${actual}px`); }

export async function verifyDockResize(page, application) {
  const initial = await dockHeight(page);
  await drag(page, 96); near(await dockHeight(page), initial + 96);
  await drag(page, -48); const resized = await dockHeight(page); near(resized, initial + 48);
  assert.equal(await page.locator('html').evaluate(element => element.classList.contains('resizing-output-dock')), false);
  await page.getByRole('button', { name: '切换输出面板', exact: true }).click(); near(await dockHeight(page), 38);
  await page.getByRole('button', { name: '切换输出面板', exact: true }).click(); near(await dockHeight(page), resized);
  await page.reload(); await page.getByRole('heading', { name: 'example-project', exact: true }).waitFor();
  near(await dockHeight(page), resized);
  await separator(page).focus(); await page.keyboard.press('Home'); near(await dockHeight(page), 160);
  await page.keyboard.press('ArrowUp'); near(await dockHeight(page), 192);
  await page.keyboard.press('ArrowDown'); near(await dockHeight(page), 160);
  const bounds = await separator(page).boundingBox();
  await drag(page, bounds.y - 5);
  near(await dockHeight(page), Number(await separator(page).getAttribute('aria-valuemax')));
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1100, 700));
  await page.waitForFunction(() => {
    const dock = document.querySelector('.output-dock').getBoundingClientRect();
    const content = document.querySelector('.workspace-content').getBoundingClientRect();
    return innerHeight < 750 && dock.bottom <= innerHeight && content.height >= 99;
  });
  assert.ok((await dockHeight(page)) >= 160);
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 940));
  await page.waitForFunction(() => innerHeight > 800);
  await separator(page).dblclick(); near(await dockHeight(page), initial);
  await page.screenshot({ path: '.runtime/screenshots/dock-resize.png' });
  console.log('PASS output dock drag, bounds, collapse, reload persistence and keyboard resizing');
}

export async function verifyTerminalResize(page) {
  const initial = await dockHeight(page);
  const screen = page.locator('.terminal-canvas:visible .xterm-screen');
  await page.waitForFunction(() => {
    const canvas = document.querySelector('.terminal-canvas'); const grid = canvas?.querySelector('.xterm-screen');
    return grid && grid.getBoundingClientRect().height > 0 && grid.getBoundingClientRect().height <= canvas.getBoundingClientRect().height + 1;
  });
  const before = (await screen.boundingBox()).height;
  await drag(page, 100); near(await dockHeight(page), initial + 100);
  await page.waitForFunction(height => document.querySelector('.terminal-canvas .xterm-screen')?.getBoundingClientRect().height > height + 60, before);
  await drag(page, -100); near(await dockHeight(page), initial);
  console.log('PASS terminal grid adapts to dragged dock height');
}
