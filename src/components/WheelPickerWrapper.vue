<script setup lang="ts">
import { cn } from '@/lib/utils'

defineProps<{
  class?: string
}>()
</script>

<template>
  <div :class="cn('wheel-picker-wrapper', $props.class)">
    <slot />
  </div>
</template>

<style scoped>
.wheel-picker-wrapper {
  position: relative;
  overflow: hidden;
  display: flex;
  width: 100%;
  align-items: stretch;
  justify-content: space-between;
  perspective: 2000px;
  user-select: none;
}
</style>