import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router';
import { initializeTheme } from '@/composables/useTheme';
import { initializeSidebar } from '@/composables/useSidebar';
import './styles/index.css';
async function start() {
  await Promise.all([initializeTheme(), initializeSidebar()]);
  createApp(App).use(router).mount('#app');
}
void start();
