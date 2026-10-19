import { app, dialog, Menu, Tray, type BrowserWindow, type Event } from 'electron';

interface LifecycleOptions {
  getWindow: () => BrowserWindow | null;
  revealWindow: () => void;
  hasActive: () => boolean;
  shutdown: () => Promise<void>;
  icon: string;
}

/** 隐藏窗口不卸载页面；只有窗口确认关闭后才清理服务与终端。 */
export class DesktopLifecycle {
  private tray: Tray | null = null;
  private exitRequested = false;
  private shuttingDown = false;
  private announced = false;

  constructor(private readonly options: LifecycleOptions) {}

  attach(window: BrowserWindow) {
    window.on('close', event => {
      if (this.exitRequested || this.shuttingDown) return;
      if (this.tray && !this.tray.isDestroyed()) {
        event.preventDefault();
        window.hide();
        this.announceBackground();
      } else if (!this.prepareQuit()) {
        event.preventDefault();
      }
    });
    window.webContents.on('will-prevent-unload', event => {
      if (this.shuttingDown) { event.preventDefault(); return; }
      this.options.revealWindow();
      const choice = dialog.showMessageBoxSync(window, {
        type: 'question', title: '未保存的文件', message: '有尚未保存的文件修改',
        detail: '离开后这些修改将丢失。', buttons: ['继续编辑', '放弃修改并离开'], defaultId: 0, cancelId: 0,
      });
      if (choice === 1) event.preventDefault();
      else this.exitRequested = false;
    });
    window.once('closed', () => this.finishQuit());
    // Windows 注销、关机或安装程序结束会话时，不将系统退出转成隐藏窗口。
    window.on('session-end', () => {
      this.shuttingDown = true;
      this.dispose();
      void this.options.shutdown().catch(error => console.error('退出时清理进程失败', error));
    });
  }

  createTray() {
    // 自动化的隐藏实例不向用户的通知区域添加图标。
    if (process.env.AIPM_QA === '1') return;
    try {
      this.tray = new Tray(this.options.icon);
      this.tray.setToolTip('项目工作台 · 关闭窗口后继续在后台运行');
      this.tray.setContextMenu(Menu.buildFromTemplate([
        { label: '打开项目工作台', click: () => this.options.revealWindow() },
        { type: 'separator' },
        { label: '退出工作台', click: () => this.requestQuit() },
      ]));
      this.tray.on('click', () => this.options.revealWindow());
      this.tray.on('double-click', () => this.options.revealWindow());
      this.tray.on('balloon-click', () => this.options.revealWindow());
    } catch (error) {
      // 没有可用托盘时仍允许正常退出，避免隐藏后无法恢复窗口。
      this.dispose();
      console.error('创建系统托盘失败', error);
    }
  }

  requestQuit() {
    if (this.exitRequested || this.shuttingDown) return;
    if (!this.prepareQuit()) return;
    const window = this.options.getWindow();
    if (window && !window.isDestroyed()) window.close();
    else this.finishQuit();
  }

  beforeQuit(event: Event) {
    if (this.shuttingDown) return;
    const window = this.options.getWindow();
    if (!window && !this.options.hasActive()) return;
    // app.quit() 也必须先经过窗口的未保存检查，再停止进程。
    event.preventDefault();
    this.requestQuit();
  }

  finishQuit() {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    this.dispose();
    void this.options.shutdown().catch(error => console.error('退出时清理进程失败', error)).finally(() => app.quit());
  }

  dispose() {
    if (this.tray && !this.tray.isDestroyed()) this.tray.destroy();
    this.tray = null;
  }

  private prepareQuit() {
    this.exitRequested = true;
    const window = this.options.getWindow();
    if (!window || window.isDestroyed() || process.env.AIPM_QA === '1') return true;
    this.options.revealWindow();
    if (this.options.hasActive()) {
      const choice = dialog.showMessageBoxSync(window, {
        type: 'question', title: '退出项目工作台', message: '仍有服务或终端在运行',
        detail: '退出将停止工作台启动的服务和终端。取消后可继续使用，关闭窗口仍会在后台运行。',
        buttons: ['停止并退出', '取消'], defaultId: 1, cancelId: 1,
      });
      if (choice !== 0) { this.exitRequested = false; return false; }
    }
    return true;
  }

  private announceBackground() {
    if (this.announced || process.platform !== 'win32') return;
    this.announced = true;
    try {
      this.tray?.displayBalloon({
        title: '项目工作台已在后台运行',
        content: '服务、终端和未保存的编辑内容会保留。点击托盘图标恢复窗口，右键菜单可退出。',
        iconType: 'info', respectQuietTime: true,
      });
    } catch (error) { console.error('显示后台运行提示失败', error); }
  }
}
