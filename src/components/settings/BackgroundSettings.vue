<script setup lang="ts">
import AppIcon from '@/components/common/AppIcon.vue';
import { request } from '@/api/desktop';
import { useWorkspace } from '@/composables/useWorkspace';

const ws = useWorkspace();
const desktopAvailable = !!window.desktop;
</script>

<template>
  <section class="settings-card">
    <h2>后台运行</h2>
    <p class="form-note">点击窗口关闭按钮或按 Alt+F4，会隐藏到系统托盘。已启动的服务、终端和未保存的编辑内容会保留。</p>
    <p class="form-note">点击任务栏通知区域的工作台图标可恢复窗口；也可以重新打开工作台快捷方式。要完全关闭，请使用托盘右键菜单或下面的退出按钮。</p>
    <button type="button" class="button stop-button" :disabled="!desktopAvailable" @click="ws.task('退出工作台', () => request('app:quit', undefined))">
      <AppIcon name="Square" :size="14" />退出工作台
    </button>
  </section>
</template>
