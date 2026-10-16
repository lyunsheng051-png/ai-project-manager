import { createRouter, createWebHashHistory } from 'vue-router';
import WorkspaceView from '@/views/WorkspaceView.vue';
import SettingsView from '@/views/SettingsView.vue';
import { confirmWorkspaceNavigation } from '@/composables/useUnsavedChanges';
export const router = createRouter({ history: createWebHashHistory(), routes: [
  { path: '/', component: WorkspaceView }, { path: '/settings', component: SettingsView },
] });
router.beforeEach(() => confirmWorkspaceNavigation());
