<script setup lang="ts">
import { computed } from 'vue';
import { Folder, FolderOpen, FolderPlus, GitBranch, GitCommitHorizontal, GitMerge, GitPullRequest,
  Terminal, Play, Square, RotateCw, RefreshCw, Plus, X, Search, Settings, ChevronRight, ChevronLeft,
  ChevronDown, ExternalLink, FileText, Star, Ellipsis, ArrowDown, ArrowUp, Download, Upload, Check,
  Layers, Cpu, Circle, Code, Trash2, Copy, PanelBottom, ArrowLeft, Loader, Files, CircleAlert, Command, Activity, Save, Pencil, Minus } from '@lucide/vue';
const icons = { Folder, FolderOpen, FolderPlus, GitBranch, GitCommitHorizontal, GitMerge, GitPullRequest, Terminal,
  Play, Square, RotateCw, RefreshCw, Plus, X, Search, Settings, ChevronRight, ChevronLeft, ChevronDown, ExternalLink,
  FileText, Star, Ellipsis, ArrowDown, ArrowUp, Download, Upload, Check, Layers, Cpu, Circle, Code, Trash2, Copy,
  PanelBottom, ArrowLeft, Loader, Files, CircleAlert, Command, Activity, Save, Pencil, Minus };
const props = withDefaults(defineProps<{ name: keyof typeof icons; size?: number }>(), { size: 16 });
const icon = computed(() => icons[props.name]);
</script>
<template><component :is="icon" :size="size" :stroke-width="1.7" aria-hidden="true" /></template>
