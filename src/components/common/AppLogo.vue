<script setup lang="ts">
import logo from '../../../resources/icon.png';

withDefaults(defineProps<{ size?: number }>(), { size: 40 });
</script>

<template>
  <img :src="logo" :width="size" :height="size" class="app-logo" alt="" aria-hidden="true" draggable="false" />
</template>

<style scoped>
.app-logo { display: block; flex-shrink: 0; object-fit: contain; }
</style>
