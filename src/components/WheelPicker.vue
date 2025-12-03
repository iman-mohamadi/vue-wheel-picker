<script setup lang="ts" generic="T extends string | number">
import { ref, computed, onMounted, onUnmounted, watch, nextTick, type CSSProperties } from 'vue';
import { cn } from '@/lib/utils';
import type { WheelPickerOption } from './types';

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

// --- Constants & Utils ---
const RESISTANCE = 0.3;
const MAX_VELOCITY = 30;
const easeOutCubic = (p: number) => Math.pow(p - 1, 3) + 1;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

// --- State ---
const containerRef = ref<HTMLElement | null>(null);
const wheelItemsRef = ref<HTMLElement | null>(null);
const highlightListRef = ref<HTMLElement | null>(null);

// Internal state for v-model handling
const localValue = ref<T>(props.modelValue ?? props.defaultValue ?? props.options[0]?.value);

// Physics state (non-reactive for performance loop)
let scrollPos = 0;
let isDragging = false;
let moveId = 0;
let lastWheelTime = 0;
let dragController: AbortController | null = null;

const touchData = {
  startY: 0,
  yList: [] as [number, number][],
  touchScroll: 0,
  isClick: true,
};

// --- Computed Props ---
const processedOptions = computed(() => {
  if (!props.infinite || props.options.length === 0) return props.options;
  
  const result: WheelPickerOption<T>[] = [];
  const halfCount = Math.ceil(props.visibleCount / 2);
  while (result.length < halfCount) {
    result.push(...props.options);
  }
  return result;
});

const measurements = computed(() => {
  const count = props.visibleCount;
  const height = props.itemHeight;
  const halfItemHeight = height * 0.5;
  const itemAngle = 360 / count;
  const radius = height / Math.tan((itemAngle * Math.PI) / 180);
  const containerHeight = Math.round(radius * 2 + height * 0.25);
  const quarterCount = count >> 2;

  return { height, halfItemHeight, itemAngle, radius, containerHeight, quarterCount };
});

const displayItems = computed(() => {
  const { itemAngle, quarterCount } = measurements.value;
  const opts = processedOptions.value;
  
  const items = opts.map((option, index) => ({
    ...option,
    index,
    angle: -itemAngle * index
  }));

  if (props.infinite && props.options.length > 0) {
    for (let i = 0; i < quarterCount; ++i) {
      // Prepend
      items.unshift({
        ...opts[opts.length - 1 - i],
        index: -i - 1,
        angle: itemAngle * (i + 1)
      });
      // Append
      items.push({
        ...opts[i],
        index: i + opts.length,
        angle: -itemAngle * (i + opts.length)
      });
    }
  }
  return items;
});

const highlightItems = computed(() => {
  const opts = processedOptions.value;
  const items = opts.map((opt, i) => ({ ...opt, key: i }));
  
  if (props.infinite && opts.length > 0) {
    items.unshift({ ...opts[opts.length - 1], key: 'start-inf' as any });
    items.push({ ...opts[0], key: 'end-inf' as any });
  }
  return items;
});

const wheelSegmentPositions = computed(() => {
  const { quarterCount, itemAngle, height } = measurements.value;
  let positionAlongWheel = 0;
  const degToRad = Math.PI / 180;
  const segments: [number, number][] = [];

  for (let i = quarterCount - 1; i >= -quarterCount + 1; --i) {
    const angle = i * itemAngle;
    const segmentLength = height * Math.cos(angle * degToRad);
    const start = positionAlongWheel;
    positionAlongWheel += segmentLength;
    segments.push([start, positionAlongWheel]);
  }
  return segments;
});

// --- Core Logic ---

const normalizeScroll = (scroll: number) => {
  const len = processedOptions.value.length;
  if(len === 0) return 0;
  return ((scroll % len) + len) % len;
};

const updateStyles = (scroll: number) => {
  const { radius, itemAngle, quarterCount, height } = measurements.value;
  const normalizedScroll = props.infinite ? normalizeScroll(scroll) : scroll;

  // 1. Rotate the 3D Wheel
  if (wheelItemsRef.value) {
    const transform = `translateZ(${-radius}px) rotateX(${itemAngle * normalizedScroll}deg)`;
    wheelItemsRef.value.style.transform = transform;

    // Visibility culling for performance
    const childNodes = wheelItemsRef.value.children;
    for (let i = 0; i < childNodes.length; i++) {
      const li = childNodes[i] as HTMLElement;
      const idx = Number(li.dataset.index);
      const distance = Math.abs(idx - normalizedScroll);
      li.style.visibility = distance > quarterCount ? "hidden" : "visible";
    }
  }

  // 2. Move the Flat Highlight List
  if (highlightListRef.value) {
    highlightListRef.value.style.transform = `translateY(${-normalizedScroll * height}px)`;
  }

  return normalizedScroll;
};

const cancelAnimation = () => cancelAnimationFrame(moveId);

const selectByScroll = (scroll: number) => {
  const opts = processedOptions.value;
  if(!opts.length) return;

  const normalized = normalizeScroll(scroll) | 0;
  const boundedScroll = props.infinite 
    ? normalized 
    : Math.min(Math.max(normalized, 0), opts.length - 1);

  if (!props.infinite && boundedScroll !== scroll) return;
  
  scrollPos = updateStyles(boundedScroll);
  
  // Update Value
  const selected = opts[scrollPos];
  if(selected && selected.value !== localValue.value) {
    localValue.value = selected.value;
    emit('update:modelValue', selected.value);
  }
};

const animateScroll = (startScroll: number, endScroll: number, duration: number, onComplete?: () => void) => {
  if (startScroll === endScroll || duration === 0) {
    updateStyles(startScroll);
    return;
  }

  const startTime = performance.now();
  const totalDistance = endScroll - startScroll;

  const tick = (currentTime: number) => {
    const elapsed = (currentTime - startTime) / 1000;
    if (elapsed < duration) {
      const progress = easeOutCubic(elapsed / duration);
      scrollPos = updateStyles(startScroll + progress * totalDistance);
      moveId = requestAnimationFrame(tick);
    } else {
      cancelAnimation();
      scrollPos = updateStyles(endScroll);
      onComplete?.();
    }
  };
  requestAnimationFrame(tick);
};

const selectByValue = (val: T) => {
  const index = processedOptions.value.findIndex(o => o.value === val);
  if (index === -1) return;
  cancelAnimation();
  selectByScroll(index);
};

// --- Interactions ---

const scrollByStep = (step: number) => {
  const startScroll = scrollPos;
  let endScroll = startScroll + step;
  const len = processedOptions.value.length;

  if (props.infinite) {
    endScroll = Math.round(endScroll);
  } else {
    endScroll = clamp(Math.round(endScroll), 0, len - 1);
  }

  const distance = Math.abs(endScroll - startScroll);
  if (distance === 0) return;

  const duration = Math.sqrt(distance / props.scrollSensitivity);
  cancelAnimation();
  animateScroll(startScroll, endScroll, duration, () => {
    selectByScroll(scrollPos);
  });
};

const handleWheel = (e: WheelEvent) => {
  if (isDragging || !processedOptions.value.length) return;
  
  // Check if target is inside container
  if(!containerRef.value?.contains(e.target as Node)) return;

  e.preventDefault();
  const now = Date.now();
  if (now - lastWheelTime < 100) return;
  
  const direction = Math.sign(e.deltaY);
  if (!direction) return;
  
  lastWheelTime = now;
  scrollByStep(direction);
};

// --- Drag / Touch Logic ---

const decelerateAndAnimateScroll = (initialVelocity: number) => {
  const currentScroll = scrollPos;
  const len = processedOptions.value.length;
  const baseDeceleration = props.dragSensitivity * 10;
  
  let targetScroll = currentScroll;
  let deceleration = initialVelocity > 0 ? -baseDeceleration : baseDeceleration;
  let duration = 0;

  if (props.infinite) {
    duration = Math.abs(initialVelocity / deceleration);
    const dist = initialVelocity * duration + 0.5 * deceleration * duration * duration;
    targetScroll = Math.round(currentScroll + dist);
  } else if (currentScroll < 0 || currentScroll > len - 1) {
    const target = clamp(currentScroll, 0, len - 1);
    const dist = currentScroll - target;
    const snapDecel = 10; // Snap back deceleration
    duration = Math.sqrt(Math.abs(dist / snapDecel));
    // Provide a small push to animate back
    initialVelocity = snapDecel * duration;
    initialVelocity = currentScroll > 0 ? -initialVelocity : initialVelocity;
    targetScroll = target;
  } else {
    duration = Math.abs(initialVelocity / deceleration);
    const dist = initialVelocity * duration + 0.5 * deceleration * duration * duration;
    targetScroll = Math.round(currentScroll + dist);
    targetScroll = clamp(targetScroll, 0, len - 1);
    
    // Recalculate duration for clamped target
    const adjDist = targetScroll - currentScroll;
    duration = Math.sqrt(Math.abs(adjDist / deceleration));
  }

  animateScroll(currentScroll, targetScroll, duration, () => selectByScroll(scrollPos));
  // Fallback
  selectByScroll(scrollPos); 
};

const updateScrollDuringDrag = (e: MouseEvent | TouchEvent) => {
  const currentY = (e instanceof MouseEvent ? e.clientY : e.touches?.[0]?.clientY) || 0;
  const { startY, yList } = touchData;

  if (touchData.isClick && Math.abs(currentY - startY) > 5) {
    touchData.isClick = false;
  }

  touchData.yList.push([currentY, Date.now()]);
  if (touchData.yList.length > 5) touchData.yList.shift();

  const dragDelta = (startY - currentY) / props.itemHeight;
  let nextScroll = scrollPos + dragDelta;
  const len = processedOptions.value.length;

  if (props.infinite) {
    nextScroll = normalizeScroll(nextScroll);
  } else {
    if (nextScroll < 0) nextScroll *= RESISTANCE;
    else if (nextScroll > len) nextScroll = len + (nextScroll - len) * RESISTANCE;
  }
  
  touchData.touchScroll = updateStyles(nextScroll);
};

const handleDragStart = (e: MouseEvent | TouchEvent) => {
  if(!containerRef.value?.contains(e.target as Node)) return;
  e.preventDefault();

  isDragging = true;
  dragController = new AbortController();
  const { signal } = dragController;
  
  const startY = (e instanceof MouseEvent ? e.clientY : e.touches?.[0]?.clientY) || 0;
  
  touchData.startY = startY;
  touchData.yList = [[startY, Date.now()]];
  touchData.touchScroll = scrollPos;
  touchData.isClick = true;

  cancelAnimation();

  // Attach global listeners
  const opts = { signal, passive: false };
  document.addEventListener("mousemove", (ev) => updateScrollDuringDrag(ev), opts);
  document.addEventListener("touchmove", (ev) => updateScrollDuringDrag(ev), opts);
  
  const handleEnd = (ev: MouseEvent | TouchEvent) => {
    ev.preventDefault();
    dragController?.abort();
    dragController = null;
    isDragging = false;

    // Handle Click
    if (touchData.isClick) {
      const { top } = containerRef.value!.getBoundingClientRect();
      const clickOffsetY = touchData.startY - top;
      
      const idx = wheelSegmentPositions.value.findIndex(([start, end]) => 
        clickOffsetY >= start && clickOffsetY <= end
      );
      
      if (idx !== -1) {
        const steps = (measurements.value.quarterCount - idx - 1) * -1;
        scrollByStep(steps);
      }
      return;
    }

    // Handle Inertia
    let velocity = 0;
    const { yList } = touchData;
    if (yList.length > 1) {
      const [endY, endTime] = yList[yList.length - 1];
      const [startY, startTime] = yList[yList.length - 2];
      const timeDiff = endTime - startTime;
      
      if (timeDiff > 0) {
        const dist = startY - endY;
        const velPerSec = ((dist / props.itemHeight) * 1000) / timeDiff;
        velocity = Math.min(Math.abs(velPerSec), MAX_VELOCITY) * (velPerSec > 0 ? 1 : -1);
      }
    }
    
    scrollPos = touchData.touchScroll;
    decelerateAndAnimateScroll(velocity);
  };

  document.addEventListener("mouseup", handleEnd, opts);
  document.addEventListener("touchend", handleEnd, opts);
};

// --- Lifecycle & Watchers ---

watch(() => props.modelValue, (newVal) => {
  if (newVal !== undefined && newVal !== localValue.value) {
    localValue.value = newVal;
    selectByValue(newVal);
  }
});

onMounted(() => {
  const container = containerRef.value;
  if (!container) return;
  
  // Initial draw
  nextTick(() => {
    selectByValue(localValue.value);
  });

  // Events
  container.addEventListener("wheel", handleWheel, { passive: false });
  container.addEventListener("mousedown", handleDragStart, { passive: false });
  container.addEventListener("touchstart", handleDragStart, { passive: false });
});

onUnmounted(() => {
  const container = containerRef.value;
  if (container) {
    container.removeEventListener("wheel", handleWheel);
    container.removeEventListener("mousedown", handleDragStart);
    container.removeEventListener("touchstart", handleDragStart);
  }
});
</script>

<template>
  <div 
    ref="containerRef" 
    :class="cn('relative flex w-full overflow-hidden select-none items-stretch justify-between', $props.class)" 
    class="wheel-picker-root"
    :style="{ height: `${measurements.containerHeight}px`, perspective: '2000px' }"
  >
    <div class="relative flex-1 overflow-hidden cursor-default mask-gradient">
      <ul ref="wheelItemsRef" class="wheel-3d-list">
        <li 
          v-for="(item) in displayItems" 
          :key="`${item.index}-${item.value}`"
          :data-index="item.index"
          class="absolute left-0 top-0 flex w-full items-center justify-center text-sm text-muted-foreground will-change-[transform,visibility]"
          :style="{
            top: `${-measurements.halfItemHeight}px`,
            height: `${measurements.height}px`,
            lineHeight: `${measurements.height}px`,
            transform: `rotateX(${item.angle}deg) translateZ(${measurements.radius}px)`,
          }"
        >
          {{ item.label }}
        </li>
      </ul>
    </div>

    <div 
      :class="cn('absolute top-1/2 w-full -translate-y-1/2 overflow-hidden text-base font-medium text-foreground pointer-events-none', props.overlayClass)"
      :style="{ height: `${measurements.height}px`, lineHeight: `${measurements.height}px` }"
    >
      <ul ref="highlightListRef" class="absolute w-full" :style="{ top: props.infinite ? `-${measurements.height}px` : undefined }">
        <li 
          v-for="item in highlightItems" 
          :key="`${item.key}`"
          class="flex items-center justify-center"
          :style="{ height: `${measurements.height}px` }"
        >
          {{ item.label }}
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.wheel-picker-root {
  /* Ensure mask works in various browsers */
  mask-image: linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%);
  -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%);
}

.wheel-3d-list {
  position: absolute;
  top: 50%;
  left: 0;
  display: block;
  width: 100%;
  height: 0;
  margin: 0 auto;
  transform-style: preserve-3d;
}
</style>