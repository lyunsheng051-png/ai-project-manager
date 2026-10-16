import { writeFile } from 'node:fs/promises';

export async function captureDesktop(application, filename) {
  const page = application.windows()[0]; const viewport = await page.evaluate(() => innerWidth);
  // 隐藏窗口可能复用旧合成帧，通过一次轻微尺寸变化获取当前界面。
  const bounds = await application.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]; const bounds = window.getBounds();
    window.setSize(bounds.width + 1, bounds.height); return bounds;
  });
  try {
    await page.waitForFunction(width => innerWidth !== width, viewport);
    const png = await application.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage(undefined, { stayAwake: true })).toPNG().toString('base64'));
    await writeFile(filename, Buffer.from(png, 'base64'));
  } finally {
    await application.evaluate(({ BrowserWindow }, bounds) => BrowserWindow.getAllWindows()[0].setSize(bounds.width, bounds.height), bounds);
    await page.waitForFunction(width => innerWidth === width, viewport);
  }
}
