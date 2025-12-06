<script setup lang="ts" generic="T extends string | number">
import { ref, computed, onMounted, onUnmounted, watch, nextTick, provide } from 'vue';
import { cn } from '@/lib/utils';

export interface WheelPickerOption<T = string | number> {
  value: T;
  label: string;
}

const props = withDefaults(defineProps<{
  modelValue?: T;
  defaultValue?: T;
  options?: WheelPickerOption<T>[];
  infinite?: boolean;
  visibleCount?: number;
  dragSensitivity?: number;
  scrollSensitivity?: number;
  itemHeight?: number;
  class?: string;
  overlayClass?: string;
}>(), {
  options: () => [],
  infinite: false,
  visibleCount: 20,
  dragSensitivity: 3,
  scrollSensitivity: 5,
  itemHeight: 30,
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: T): void;
}>();

// --- Data Preparation ---
const childOptions = ref<WheelPickerOption<T>[]>([]);
provide('wheel-picker-register', (option: WheelPickerOption<T>) => {
  childOptions.value.push(option);
});

const activeOptions = computed(() => (props.options && props.options.length > 0) ? props.options : childOptions.value);

const paddedOptions = computed(() => {
  if (!props.infinite) return activeOptions.value;
  const result = [...activeOptions.value];
  const halfCount = Math.ceil(props.visibleCount / 2);
  while (result.length < halfCount && result.length > 0) {
    result.push(...activeOptions.value);
  }
  return result;
});

// --- Measurements ---
const measurements = computed(() => {
  const count = props.visibleCount;
  const height = props.itemHeight;
  const itemAngle = 360 / count;
  const radius = height / Math.tan((itemAngle * Math.PI) / 180);
  return { 
    height, 
    halfHeight: height * 0.5, 
    itemAngle, 
    radius, 
    containerHeight: Math.round(radius * 2 + height * 0.25), 
    quarterCount: count >> 2 
  };
});

// --- Render Lists ---
// 1. The 3D Wheel List
const wheelItems = computed(() => {
  const { itemAngle, quarterCount } = measurements.value;
  const opts = paddedOptions.value;
  const items = opts.map((opt, i) => ({ ...opt, index: i, angle: -itemAngle * i }));
  
  if (props.infinite && opts.length > 0) {
    for (let i = 0; i < quarterCount; ++i) {
      items.unshift({ ...opts[opts.length - 1 - i], index: -i - 1, angle: itemAngle * (i + 1) });
      items.push({ ...opts[i], index: i + opts.length, angle: -itemAngle * (i + opts.length) });
    }
  }
  return items;
});

// 2. The Flat Highlight List
const highlightItems = computed(() => {
  const opts = paddedOptions.value;
  const items = opts.map((opt, i) => ({ ...opt, key: i }));
  if (props.infinite && opts.length > 0) {
    items.unshift({ ...opts[opts.length - 1], key: 'start-inf' as any });
    items.push({ ...opts[0], key: 'end-inf' as any });
  }
  return items;
});

const wheelSegmentPositions = computed(() => {
  const { quarterCount, itemAngle, height } = measurements.value;
  let pos = 0;
  const segments: [number, number][] = [];
  for (let i = quarterCount - 1; i >= -quarterCount + 1; --i) {
    const len = height * Math.cos(i * itemAngle * (Math.PI / 180));
    segments.push([pos, pos + len]);
    pos += len;
  }
  return segments;
});

// --- Animation State (Non-Reactive) ---
const containerRef = ref<HTMLElement | null>(null);
const wheelRef = ref<HTMLElement | null>(null);
const hlRef = ref<HTMLElement | null>(null);
const localValue = ref<T>(props.modelValue ?? props.defaultValue ?? (activeOptions.value[0]?.value as T));

let scrollRef = 0;
let moveId = 0;
let isDragging = false;
let lastWheelTime = 0;
let dragController: AbortController | null = null;
const touchData = { startY: 0, yList: [] as [number, number][], touchScroll: 0, isClick: true };

// --- Physics & Scroll ---
const RESISTANCE = 0.3;
const MAX_VELOCITY = 30;
const easeOutCubic = (p: number) => Math.pow(p - 1, 3) + 1;
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(v, max));

const normalize = (scroll: number) => {
  const len = paddedOptions.value.length;
  return len ? ((scroll % len) + len) % len : 0;
};

const updateStyles = (scroll: number) => {
  const { radius, itemAngle, quarterCount, height } = measurements.value;
  const norm = props.infinite ? normalize(scroll) : scroll;

  // Move 3D Container
  if (wheelRef.value) {
    wheelRef.value.style.transform = `translateZ(${-radius}px) rotateX(${itemAngle * norm}deg)`;
    for (const child of wheelRef.value.children as any) {
      const idx = Number(child.dataset.index);
      const dist = Math.abs(idx - norm);
      child.style.visibility = dist > quarterCount ? "hidden" : "visible";
    }
  }
  // Move Highlight Container
  if (hlRef.value) {
    hlRef.value.style.transform = `translateY(${-norm * height}px)`;
  }
  return norm;
};

const animate = (start: number, end: number, duration: number, done?: () => void) => {
  if (start === end || duration === 0) {
    updateStyles(start);
    return;
  }
  const startTime = performance.now();
  const dist = end - start;
  const tick = (now: number) => {
    const elapsed = (now - startTime) / 1000;
    if (elapsed < duration) {
      scrollRef = updateStyles(start + easeOutCubic(elapsed / duration) * dist);
      moveId = requestAnimationFrame(tick);
    } else {
      scrollRef = updateStyles(end);
      done?.();
    }
  };
  requestAnimationFrame(tick);
};

const selectByScroll = (scroll: number) => {
  const opts = paddedOptions.value;
  const norm = normalize(scroll) | 0;
  const bounded = props.infinite ? norm : clamp(norm, 0, opts.length - 1);
  
  if (!props.infinite && bounded !== scroll) return;
  
  scrollRef = updateStyles(bounded);
  const selected = opts[scrollRef];
  if (selected && selected.value !== localValue.value) {
    localValue.value = selected.value;
    emit('update:modelValue', selected.value);
  }
};

const selectByValue = (val: T) => {
  const idx = paddedOptions.value.findIndex(o => o.value === val);
  if (idx !== -1) {
    cancelAnimationFrame(moveId);
    selectByScroll(idx);
  }
};

// --- Interactions ---
const momentumScroll = (velocity: number) => {
  const current = scrollRef;
  const len = paddedOptions.value.length;
  const decel = props.dragSensitivity * 10;
  let target = current, duration = 0;

  if (props.infinite) {
    duration = Math.abs(velocity / decel);
    target = Math.round(current + velocity * duration + 0.5 * (velocity > 0 ? -decel : decel) * duration ** 2);
  } else {
    // Bounds logic
    if (current < 0 || current > len - 1) {
      target = clamp(current, 0, len - 1);
      duration = Math.sqrt(Math.abs((current - target) / 10)); // Snap back
    } else {
      duration = Math.abs(velocity / decel);
      target = clamp(Math.round(current + velocity * duration + 0.5 * (velocity > 0 ? -decel : decel) * duration ** 2), 0, len - 1);
      duration = Math.sqrt(Math.abs((target - current) / decel));
    }
  }
  animate(current, target, duration, () => selectByScroll(scrollRef));
};

const handleDrag = (e: MouseEvent | TouchEvent) => {
  if (!containerRef.value?.contains(e.target as Node)) return;
  e.preventDefault();
  isDragging = true;
  touchData.startY = (e instanceof MouseEvent ? e.clientY : e.touches[0].clientY);
  touchData.yList = [[touchData.startY, Date.now()]];
  touchData.touchScroll = scrollRef;
  touchData.isClick = true;
  cancelAnimationFrame(moveId);

  const move = (ev: MouseEvent | TouchEvent) => {
    ev.preventDefault();
    const y = (ev instanceof MouseEvent ? ev.clientY : ev.touches[0].clientY);
    if (Math.abs(y - touchData.startY) > 5) touchData.isClick = false;
    touchData.yList.push([y, Date.now()]);
    
    const delta = (touchData.startY - y) / props.itemHeight;
    let next = scrollRef + delta;
    if (props.infinite) next = normalize(next);
    else if (next < 0 || next > paddedOptions.value.length) next -= (next - (next < 0 ? 0 : paddedOptions.value.length)) * (1 - RESISTANCE);
    
    touchData.touchScroll = updateStyles(next);
  };

  const end = () => {
    isDragging = false;
    document.removeEventListener('mousemove', move);
    document.removeEventListener('mouseup', end);
    document.removeEventListener('touchmove', move);
    document.removeEventListener('touchend', end);

    if (touchData.isClick) {
      const { top } = containerRef.value!.getBoundingClientRect();
      const idx = wheelSegmentPositions.value.findIndex(([s, e]) => touchData.startY - top >= s && touchData.startY - top <= e);
      if (idx !== -1) {
        const step = (measurements.value.quarterCount - idx - 1) * -1;
        const target = scrollRef + step;
        animate(scrollRef, props.infinite ? Math.round(target) : clamp(Math.round(target), 0, paddedOptions.value.length - 1), Math.sqrt(Math.abs(step) / props.scrollSensitivity), () => selectByScroll(scrollRef));
      }
      return;
    }

    const last = touchData.yList[touchData.yList.length - 1];
    const prev = touchData.yList[touchData.yList.length - 2];
    let vel = 0;
    if (last && prev && (last[1] - prev[1]) > 0) {
      vel = ((prev[0] - last[0]) / props.itemHeight * 1000) / (last[1] - prev[1]);
      vel = Math.sign(vel) * Math.min(Math.abs(vel), MAX_VELOCITY);
    }
    scrollRef = touchData.touchScroll;
    momentumScroll(vel);
  };

  document.addEventListener('mousemove', move, { passive: false });
  document.addEventListener('mouseup', end);
  document.addEventListener('touchmove', move, { passive: false });
  document.addEventListener('touchend', end);
};

const handleWheel = (e: WheelEvent) => {
  if (!containerRef.value?.contains(e.target as Node)) return;
  e.preventDefault();
  if (Date.now() - lastWheelTime < 100) return;
  lastWheelTime = Date.now();
  const step = Math.sign(e.deltaY);
  const target = scrollRef + step;
  animate(scrollRef, props.infinite ? Math.round(target) : clamp(Math.round(target), 0, paddedOptions.value.length - 1), Math.sqrt(1 / props.scrollSensitivity), () => selectByScroll(scrollRef));
};

watch(() => props.modelValue, (v) => v !== undefined && v !== localValue.value && (localValue.value = v, selectByValue(v)));
onMounted(() => {
  nextTick(() => selectByValue(localValue.value));
  containerRef.value?.addEventListener('mousedown', handleDrag);
  containerRef.value?.addEventListener('touchstart', handleDrag, { passive: false });
  containerRef.value?.addEventListener('wheel', handleWheel, { passive: false });
});
onUnmounted(() => {
  containerRef.value?.removeEventListener('mousedown', handleDrag);
  containerRef.value?.removeEventListener('touchstart', handleDrag);
  containerRef.value?.removeEventListener('wheel', handleWheel);
});
</script>

<template>
  <div ref="containerRef" :class="cn('wheel-picker', $props.class)" :style="{ height: `${measurements.containerHeight}px` }">
    <slot />
    
    <div class="wheel-scroller">
      <ul ref="wheelRef" class="wheel-list">
        <li v-for="item in wheelItems" :key="`${item.index}`" :data-index="item.index" class="wheel-item"
          :style="{ top: `${-measurements.halfHeight}px`, height: `${measurements.height}px`, transform: `rotateX(${item.angle}deg) translateZ(${measurements.radius}px)` }">
          {{ item.label }}
        </li>
      </ul>
    </div>

    <div :class="cn('wheel-overlay', props.overlayClass)" :style="{ height: `${measurements.height}px` }">
      <ul ref="hlRef" class="wheel-list highlight-list" :style="{ top: props.infinite ? `-${measurements.height}px` : undefined }">
        <li v-for="item in highlightItems" :key="`${item.key}`" class="wheel-item" :style="{ height: `${measurements.height}px` }">
          {{ item.label }}
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.wheel-picker {
  position: relative;
  overflow: hidden;
  flex: 1;
  cursor: default;
  mask-image: linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%);
  -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%);
}

.wheel-scroller {
  position: relative;
  height: 100%;
  overflow: hidden;
}

.wheel-list {
  position: absolute;
  top: 50%;
  left: 0;
  width: 100%;
  margin: 0;
  padding: 0;
  list-style: none;
  transform-style: preserve-3d;
  will-change: transform;
}

.wheel-item {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  backface-visibility: hidden;
  font-size: 0.875rem;
}

.wheel-overlay {
  position: absolute;
  top: 50%;
  width: 100%;
  transform: translateY(-50%);
  pointer-events: none;
  border-top: 1px solid hsl(var(--border));
  border-bottom: 1px solid hsl(var(--border));
  background: hsl(var(--background) / 0.1);
}

.highlight-list .wheel-item {
  position: relative;
  font-weight: 500;
  color: hsl(var(--foreground));
}
</style>