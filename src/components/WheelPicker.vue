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

// --- 1. Option Gathering (Support for Props OR Children) ---
const childOptions = ref<WheelPickerOption<T>[]>([]);
provide('wheel-picker-register', (option: WheelPickerOption<T>) => {
  childOptions.value.push(option);
});

const optionsProp = computed(() => (props.options && props.options.length > 0) ? props.options : childOptions.value);

// --- 2. Data Padding (React "options" useMemo Logic) ---
const options = computed(() => {
  if (!props.infinite) return optionsProp.value;
  
  const result = [];
  const halfCount = Math.ceil(props.visibleCount / 2);
  
  if (optionsProp.value.length === 0) return result;

  // Clone options until we have enough to fill the half-circle
  while (result.length < halfCount) {
    result.push(...optionsProp.value);
  }
  return result;
});

// --- 3. Measurements ---
const measurements = computed(() => {
  const count = props.visibleCount;
  const height = props.itemHeight;
  const itemAngle = 360 / count;
  const radius = height / Math.tan((itemAngle * Math.PI) / 180);
  const containerHeight = Math.round(radius * 2 + height * 0.25);
  const quarterCount = count >> 2; 

  return { height, halfItemHeight: height * 0.5, itemAngle, radius, containerHeight, quarterCount };
});

// --- 4. Visual Padding (React "renderWheelItems" Logic) ---
const displayItems = computed(() => {
  const { itemAngle, quarterCount } = measurements.value;
  const src = options.value;
  
  // Base mapping
  const items = src.map((item, index) => ({
    ...item,
    _index: index,
    angle: -itemAngle * index
  }));

  if (props.infinite && src.length > 0) {
    for (let i = 0; i < quarterCount; ++i) {
      // Prepend
      const prependIndex = -i - 1;
      items.unshift({
        ...src[src.length - i - 1], // Fixed index logic to match React
        _index: prependIndex,
        angle: itemAngle * (i + 1)
      });
      // Append
      const appendIndex = i + src.length;
      items.push({
        ...src[i],
        _index: appendIndex,
        angle: -itemAngle * appendIndex
      });
    }
  }
  return items;
});

const highlightItems = computed(() => {
  const src = options.value;
  const items = src.map((item, i) => ({ ...item, key: i }));
  if (props.infinite && src.length > 0) {
    items.unshift({ ...src[src.length - 1], key: 'start-inf' as any });
    items.push({ ...src[0], key: 'end-inf' as any });
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

// --- 5. Physics State (Non-Reactive "Refs") ---
const containerRef = ref<HTMLElement | null>(null);
const wheelItemsRef = ref<HTMLElement | null>(null);
const highlightListRef = ref<HTMLElement | null>(null);

const localValue = ref<T>(props.modelValue ?? props.defaultValue ?? (optionsProp.value[0]?.value as T));

let scrollRef = 0;
let moveId = 0;
let isDragging = false;
let lastWheelTime = 0;
let dragController: AbortController | null = null;

const touchData = { 
  startY: 0, 
  yList: [] as [number, number][], 
  touchScroll: 0, 
  isClick: true 
};

// --- 6. Core Logic (Exact Port) ---
const RESISTANCE = 0.3;
const MAX_VELOCITY = 30;
const easeOutCubic = (p: number) => Math.pow(p - 1, 3) + 1;
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(v, max));

const normalizeScroll = (scroll: number) => {
  const len = options.value.length;
  if (len === 0) return 0;
  return ((scroll % len) + len) % len;
};

const scrollTo = (scroll: number) => {
  const { radius, itemAngle, quarterCount, height } = measurements.value;
  const normalizedScroll = props.infinite ? normalizeScroll(scroll) : scroll;

  // 3D Transform
  if (wheelItemsRef.value) {
    wheelItemsRef.value.style.transform = `translateZ(${-radius}px) rotateX(${itemAngle * normalizedScroll}deg)`;
    
    // Visibility Culling (Manual DOM access for speed)
    const children = wheelItemsRef.value.children;
    for (let i = 0; i < children.length; i++) {
      const li = children[i] as HTMLElement;
      const idx = parseFloat(li.dataset.index || '0');
      const distance = Math.abs(idx - normalizedScroll);
      li.style.visibility = distance > quarterCount ? "hidden" : "visible";
    }
  }

  // Highlight Transform
  if (highlightListRef.value) {
    highlightListRef.value.style.transform = `translateY(${-normalizedScroll * height}px)`;
  }

  return normalizedScroll;
};

const cancelAnimation = () => cancelAnimationFrame(moveId);

const animateScroll = (start: number, end: number, duration: number, onComplete?: () => void) => {
  if (start === end || duration === 0) {
    scrollTo(start);
    return;
  }
  const startTime = performance.now();
  const dist = end - start;
  
  const tick = (now: number) => {
    const elapsed = (now - startTime) / 1000;
    if (elapsed < duration) {
      scrollRef = scrollTo(start + easeOutCubic(elapsed / duration) * dist);
      moveId = requestAnimationFrame(tick);
    } else {
      cancelAnimation();
      scrollRef = scrollTo(end);
      onComplete?.();
    }
  };
  requestAnimationFrame(tick);
};

const selectByScroll = (scroll: number) => {
  const opts = options.value;
  if (!opts.length) return;
  const norm = normalizeScroll(scroll) | 0;
  const bounded = props.infinite ? norm : Math.min(Math.max(norm, 0), opts.length - 1);
  
  if (!props.infinite && bounded !== scroll) return;
  
  scrollRef = scrollTo(bounded);
  const selected = opts[scrollRef];
  if (selected && selected.value !== localValue.value) {
    localValue.value = selected.value;
    emit('update:modelValue', selected.value);
  }
};

const selectByValue = (val: T) => {
  const idx = options.value.findIndex(o => o.value === val);
  if (idx !== -1) {
    cancelAnimation();
    selectByScroll(idx);
  }
};

// --- 7. Interactions (Drag/Touch) ---
const scrollByStep = (step: number) => {
  const start = scrollRef;
  let end = start + step;
  if (props.infinite) end = Math.round(end);
  else end = clamp(Math.round(end), 0, options.value.length - 1);
  
  const dist = Math.abs(end - start);
  if (dist === 0) return;
  
  const duration = Math.sqrt(dist / props.scrollSensitivity);
  cancelAnimation();
  animateScroll(start, end, duration, () => selectByScroll(scrollRef));
};

const updateScrollDuringDrag = (e: MouseEvent | TouchEvent) => {
  const y = (e instanceof MouseEvent ? e.clientY : e.touches?.[0]?.clientY) || 0;
  const { startY, yList } = touchData;
  
  if (touchData.isClick && Math.abs(y - startY) > 5) touchData.isClick = false;
  
  touchData.yList.push([y, Date.now()]);
  if (touchData.yList.length > 5) touchData.yList.shift();
  
  const delta = (startY - y) / props.itemHeight;
  let next = scrollRef + delta;
  
  if (props.infinite) {
    next = normalizeScroll(next);
  } else {
    const max = options.value.length;
    if (next < 0) next *= RESISTANCE;
    else if (next > max) next = max + (next - max) * RESISTANCE;
  }
  
  touchData.touchScroll = scrollTo(next);
};

const handleDragStart = (e: MouseEvent | TouchEvent) => {
  const isTarget = !!containerRef.value?.contains(e.target as Node) || e.target === containerRef.value;
  if (!isTarget && !isDragging) return;
  if (e.cancelable) e.preventDefault();

  isDragging = true;
  dragController = new AbortController();
  const { signal } = dragController;
  
  const y = (e instanceof MouseEvent ? e.clientY : e.touches?.[0]?.clientY) || 0;
  touchData.startY = y;
  touchData.yList = [[y, Date.now()]];
  touchData.touchScroll = scrollRef;
  touchData.isClick = true;
  
  cancelAnimation();
  
  const opts = { signal, passive: false };
  const onMove = (ev: MouseEvent | TouchEvent) => { if(ev.cancelable) ev.preventDefault(); updateScrollDuringDrag(ev); };
  document.addEventListener('mousemove', onMove, opts);
  document.addEventListener('touchmove', onMove, opts);
  
  const onEnd = (ev: MouseEvent | TouchEvent) => {
    if(ev.cancelable) ev.preventDefault();
    dragController?.abort();
    dragController = null;
    isDragging = false;
    
    if (touchData.isClick) {
      handleWheelItemClick(touchData.startY);
      return;
    }
    
    // Inertia
    let vel = 0;
    const { yList } = touchData;
    if (yList.length > 1) {
      const last = yList[yList.length - 1];
      const prev = yList[yList.length - 2];
      const timeDiff = last[1] - prev[1];
      if (timeDiff > 0) {
        const dist = prev[0] - last[0];
        const v = ((dist / props.itemHeight) * 1000) / timeDiff;
        vel = Math.min(Math.abs(v), MAX_VELOCITY) * Math.sign(v);
      }
    }
    
    scrollRef = touchData.touchScroll;
    decelerateAndAnimateScroll(vel);
  };
  
  document.addEventListener('mouseup', onEnd, opts);
  document.addEventListener('touchend', onEnd, opts);
};

const handleWheelItemClick = (clientY: number) => {
  if (!containerRef.value) return;
  const { top } = containerRef.value.getBoundingClientRect();
  const offset = clientY - top;
  const idx = wheelSegmentPositions.value.findIndex(([s, e]) => offset >= s && offset <= e);
  if (idx !== -1) {
    const steps = (measurements.value.quarterCount - idx - 1) * -1;
    scrollByStep(steps);
  }
};

const decelerateAndAnimateScroll = (velocity: number) => {
  const start = scrollRef;
  const len = options.value.length;
  const decel = props.dragSensitivity * 10;
  let end = start;
  let duration = 0;
  
  if (props.infinite) {
    duration = Math.abs(velocity / decel);
    const dist = velocity * duration + 0.5 * (velocity > 0 ? -decel : decel) * duration ** 2;
    end = Math.round(start + dist);
  } else {
    // Logic for boundary snapping
    if (start < 0 || start > len - 1) {
      end = clamp(start, 0, len - 1);
      duration = Math.sqrt(Math.abs(start - end) / 10);
    } else {
      duration = Math.abs(velocity / decel);
      const dist = velocity * duration + 0.5 * (velocity > 0 ? -decel : decel) * duration ** 2;
      end = Math.round(start + dist);
      end = clamp(end, 0, len - 1);
      duration = Math.sqrt(Math.abs(end - start) / decel);
    }
  }
  
  animateScroll(start, end, duration, () => selectByScroll(scrollRef));
};

const handleWheel = (e: WheelEvent) => {
  if(!containerRef.value?.contains(e.target as Node)) return;
  e.preventDefault();
  if (Date.now() - lastWheelTime < 100) return;
  lastWheelTime = Date.now();
  scrollByStep(Math.sign(e.deltaY));
};

watch(() => props.modelValue, (v) => { if(v !== undefined && v !== localValue.value) { localValue.value = v; selectByValue(v); }});
onMounted(() => {
  nextTick(() => selectByValue(localValue.value));
  const el = containerRef.value;
  if(el) {
    el.addEventListener('mousedown', handleDragStart, { passive: false });
    el.addEventListener('touchstart', handleDragStart, { passive: false });
    el.addEventListener('wheel', handleWheel, { passive: false });
  }
});
onUnmounted(() => {
  const el = containerRef.value;
  if(el) {
    el.removeEventListener('mousedown', handleDragStart);
    el.removeEventListener('touchstart', handleDragStart);
    el.removeEventListener('wheel', handleWheel);
  }
});
</script>

<template>
  <div ref="containerRef" :class="cn($props.class)" :style="{ height: `${measurements.containerHeight}px` }" data-rwp>
    
    <slot />

    <ul ref="wheelItemsRef" data-rwp-options>
      <li 
        v-for="item in displayItems" 
        :key="`${item._index}-${item.value}`"
        :data-index="item._index"
        data-rwp-option
        :style="{
          top: `${-measurements.halfItemHeight}px`,
          height: `${measurements.height}px`,
          lineHeight: `${measurements.height}px`,
          transform: `rotateX(${item.angle}deg) translateZ(${measurements.radius}px)`,
          visibility: 'hidden'
        }"
      >
        {{ item.label }}
      </li>
    </ul>

    <div 
      :class="cn(props.overlayClass)" 
      data-rwp-highlight-wrapper
      :style="{ height: `${measurements.height}px`, lineHeight: `${measurements.height}px` }"
    >
      <ul ref="highlightListRef" data-rwp-highlight-list :style="{ top: props.infinite ? `-${measurements.height}px` : undefined }">
        <li 
          v-for="item in highlightItems" 
          :key="`${item.key}`"
          data-rwp-highlight-item
          :style="{ height: `${measurements.height}px` }"
        >
          {{ item.label }}
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
/* CSS copied exactly from React style.css */
[data-rwp] {
  position: relative;
  overflow: hidden;
  flex: 1;
  cursor: default;
  mask-image: linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%);
  -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%);
}

[data-rwp-highlight-wrapper] {
  position: absolute;
  overflow: hidden;
  top: 50%;
  width: 100%;
  transform: translateY(-50%);
  font-size: 1rem;
  font-weight: 500;
  pointer-events: none; /* crucial so clicks pass through to container */
}

[data-rwp-highlight-list] {
  position: absolute;
  width: 100%;
}

[data-rwp-options] {
  position: absolute;
  top: 50%;
  left: 0;
  display: block;
  width: 100%;
  height: 0;
  margin: 0 auto;
  -webkit-font-smoothing: subpixel-antialiased;
  will-change: transform;
  backface-visibility: hidden;
  transform-style: preserve-3d;
}

[data-rwp-option] {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  -webkit-font-smoothing: subpixel-antialiased;
  will-change: visibility;
  font-size: 0.875rem;
}

[data-rwp-option], [data-rwp-highlight-item] {
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>