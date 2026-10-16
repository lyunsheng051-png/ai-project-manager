import type { Request } from '@/types';

export const request: Request = (action, payload) => {
  if (!window.desktop) return Promise.reject(new Error('当前为浏览器预览，请使用 npm run dev 启动桌面工作台'));
  // IPC 契约只有 JSON 数据；移除 Vue 的深层响应式代理后再交给结构化克隆。
  const plain = payload === undefined ? undefined : JSON.parse(JSON.stringify(payload));
  return window.desktop.request(action, plain);
};
