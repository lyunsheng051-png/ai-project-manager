<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import AppIcon from '@/components/common/AppIcon.vue';
import { fileSize } from '@/config/display';
import type { ImagePreviewData } from '@/types';

const props = defineProps<{ image: ImagePreviewData; name: string }>();
const fit = ref(true); const scale = ref(1); const width = ref(0); const height = ref(0); const failed = ref(false);
watch(() => props.image.dataUrl, () => { fit.value = true; scale.value = 1; width.value = 0; height.value = 0; failed.value = false; });
const canvas = computed(() => fit.value ? { width: '100%', height: '100%' } : { width: `max(100%, ${Math.round(width.value * scale.value) + 40}px)`, height: `max(100%, ${Math.round(height.value * scale.value) + 40}px)` });
const imageStyle = computed(() => fit.value ? { maxWidth: '100%', maxHeight: '100%' } : { width: `${Math.round(width.value * scale.value)}px`, maxWidth: 'none', maxHeight: 'none' });
function loaded(event: Event) { const image = event.target as HTMLImageElement; width.value = image.naturalWidth; height.value = image.naturalHeight; }
function zoom(delta: number) { fit.value = false; scale.value = Math.max(.25, Math.min(4, scale.value + delta)); }
</script>
<template>
  <div class="image-preview">
    <div class="image-preview-toolbar"><span class="image-readonly"><AppIcon name="Image" :size="14" />只读图片</span><div><button class="pane-action icon-only" aria-label="缩小图片" :disabled="!width || (!fit && scale <= .25)" @click="zoom(-.25)"><AppIcon name="ZoomOut" :size="14" /></button><span class="image-scale">{{ fit ? '适应' : `${Math.round(scale * 100)}%` }}</span><button class="pane-action icon-only" aria-label="放大图片" :disabled="!width || (!fit && scale >= 4)" @click="zoom(.25)"><AppIcon name="ZoomIn" :size="14" /></button><button class="pane-action" :class="{ emphasized: fit }" :disabled="!width" @click="fit = true"><AppIcon name="Maximize" :size="13" />适应窗口</button><button class="pane-action" :class="{ emphasized: !fit && scale === 1 }" :disabled="!width" @click="fit = false; scale = 1">原始尺寸</button></div></div>
    <div v-if="failed" class="file-read-error"><AppIcon name="CircleAlert" :size="24" /><p>图片无法解码，文件可能已损坏或格式不受支持。</p></div>
    <div v-else class="image-preview-viewport" role="region" aria-label="图片预览" tabindex="0"><div class="image-preview-canvas" :style="canvas"><img :src="image.dataUrl" :alt="name" :style="imageStyle" draggable="false" @load="loaded" @error="failed = true" /></div></div>
    <div class="image-preview-status"><span>{{ failed ? '无法解码图片' : width ? `${width} × ${height} px` : '正在读取图片…' }}<span>·</span>{{ image.mimeType.replace('image/', '').replace('svg+xml', 'SVG').toUpperCase() }}<span>·</span>{{ fileSize(image.size) }}</span><span>仅预览，不可编辑</span></div>
  </div>
</template>
