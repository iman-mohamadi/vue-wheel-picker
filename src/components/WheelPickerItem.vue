<script setup lang="ts" generic="T extends string | number">
import { inject, onMounted } from 'vue';
import type { WheelPickerOption } from './WheelPicker.vue';

const props = defineProps<{ value: T; label?: string; }>();
const register = inject<(option: WheelPickerOption<T>) => void>('wheel-picker-register');

onMounted(() => {
  if (register) register({ value: props.value, label: props.label ?? String(props.value) });
});
</script>
<template><span style="display: none;"></span></template>