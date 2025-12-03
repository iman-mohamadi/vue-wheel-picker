<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { cn } from '@/lib/utils'

interface Props {
  options: string[]
  modelValue: string
  perspective?: 'left' | 'right' | 'center'
  loop?: boolean
  class?: string
}

const props = withDefaults(defineProps<Props>(), {
  loop: true,
  perspective: 'center',
})

const emit = defineEmits(['update:modelValue'])

const containerRef = ref<HTMLElement | null>(null)
const isDragging = ref(false)
const startY = ref(0)
const currentY = ref(0)
const velocity = ref(0)
const itemHeight = 40 // Matches h-[40px]
const friction = 0.95
const visibleItems = 5 // Keep odd for center alignment

// Infinite Loop Logic: Duplicate items to create illusion
const normalizedOptions = computed(() => {
  if (!props.loop) return props.options
  // 5 sets ensures we have enough buffer to jump silently
  return [...props.options, ...props.options, ...props.options, ...props.options, ...props.options]
})

// Visual offset wrapper
const wrapperStyle = computed(() => ({
  transform: `translate3d(0, ${currentY.value}px, 0)`,
  cursor: isDragging.value ? 'grabbing' : 'grab',
}))

let animationFrameId: number
let lastTime = 0
let lastY = 0

// --- Physics Engine ---

const handleStart = (e: MouseEvent | TouchEvent) => {
  isDragging.value = true
  const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
  startY.value = clientY
  lastY = currentY.value
  lastTime = performance.now()
  velocity.value = 0
  cancelAnimationFrame(animationFrameId)
}

const handleMove = (e: MouseEvent | TouchEvent) => {
  if (!isDragging.value) return
  e.preventDefault() // Prevent page scroll
  
  const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
  const delta = clientY - startY.value
  currentY.value = lastY + delta

  const now = performance.now()
  const dt = now - lastTime
  if (dt > 0) {
    velocity.value = (delta - (currentY.value - lastY)) / dt // Instant velocity
    // Simpler velocity:
    velocity.value = delta / (dt + 1) * 1.5 
  }
}

const handleEnd = () => {
  isDragging.value = false
  startInertia()
}

const startInertia = () => {
  const step = () => {
    if (Math.abs(velocity.value) < 0.1) {
      snapToNearest()
      return
    }

    velocity.value *= friction
    currentY.value += velocity.value * 10 
    
    // Infinite Loop Jump Logic
    if (props.loop) {
      const singleSetHeight = props.options.length * itemHeight
      const totalHeight = normalizedOptions.value.length * itemHeight
      
      // If we scrolled too far up/down, jump back to middle silently
      if (currentY.value > 0) {
        currentY.value -= singleSetHeight
      } else if (currentY.value < -(totalHeight - singleSetHeight)) {
        currentY.value += singleSetHeight
      }
    } else {
       // Boundary checks for non-loop
      const maxScroll = itemHeight * 2 // Padding
      const minScroll = -(props.options.length * itemHeight) + (itemHeight * 3)
      if (currentY.value > maxScroll) velocity.value = 0
      if (currentY.value < minScroll) velocity.value = 0
    }

    animationFrameId = requestAnimationFrame(step)
  }
  step()
}

const snapToNearest = () => {
  const index = Math.round(currentY.value / itemHeight)
  const targetY = index * itemHeight
  
  // Smooth snap animation
  const animateSnap = () => {
    const diff = targetY - currentY.value
    if (Math.abs(diff) < 0.5) {
      currentY.value = targetY
      updateModelValue(index)
      return
    }
    currentY.value += diff * 0.2
    animationFrameId = requestAnimationFrame(animateSnap)
  }
  animateSnap()
}

const updateModelValue = (index: number) => {
  // Convert visual index to actual data index
  let actualIndex = Math.abs(index) % props.options.length
  // Handle negative modulo in JS
  if (index > 0) actualIndex = (props.options.length - (index % props.options.length)) % props.options.length
  
  emit('update:modelValue', props.options[actualIndex])
}

// Global Event Listeners for drag release
onMounted(() => {
  window.addEventListener('mouseup', handleEnd)
  window.addEventListener('touchend', handleEnd)
})

onUnmounted(() => {
  window.removeEventListener('mouseup', handleEnd)
  window.removeEventListener('touchend', handleEnd)
  cancelAnimationFrame(animationFrameId)
})
</script>

<template>
  <div 
    :class="cn('relative h-[200px] w-full overflow-hidden select-none touch-none bg-background', props.class)"
    ref="containerRef"
    @mousedown="handleStart"
    @mousemove="handleMove"
    @touchstart="handleStart"
    @touchmove="handleMove"
  >
    <div class="absolute top-0 left-0 right-0 z-10 h-1/4 bg-gradient-to-b from-background to-transparent pointer-events-none" />
    <div class="absolute bottom-0 left-0 right-0 z-10 h-1/4 bg-gradient-to-t from-background to-transparent pointer-events-none" />
    
    <div class="absolute top-1/2 left-4 right-4 h-[40px] -mt-[20px] z-0 bg-muted/20 rounded-lg pointer-events-none border-y border-muted/30" />

    <div class="absolute top-1/2 left-0 right-0 -mt-[20px] will-change-transform" :style="wrapperStyle">
        <div 
          v-for="(option, index) in normalizedOptions" 
          :key="index"
          class="flex items-center justify-center h-[40px] text-foreground/80 font-medium tracking-tight transition-opacity duration-200"
          :class="{
            'text-foreground font-bold scale-105': Math.round(currentY / itemHeight) === -index
          }"
        >
          {{ option }}
        </div>
    </div>
  </div>
</template>