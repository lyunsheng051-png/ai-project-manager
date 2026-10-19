<script setup lang="ts">
import { computed } from 'vue';
import { projectIdentity } from '@/config/projectIdentity';
const props = defineProps<{ name: string; path: string }>();
const identity = computed(() => projectIdentity(props.name, props.path));
</script>
<template><span class="project-identity" :data-tone="identity.tone" aria-hidden="true">{{ identity.letters }}</span></template>
