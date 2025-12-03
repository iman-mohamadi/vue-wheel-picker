export type WheelPickerValue = string | number;

export interface WheelPickerOption<
  T extends WheelPickerValue = string | number
> {
  value: T;
  label: string;
}

export interface WheelPickerProps<
  T extends WheelPickerValue = string | number
> {
  modelValue?: T; // Replaces 'value' for v-model
  defaultValue?: T;
  options: WheelPickerOption<T>[];
  infinite?: boolean;
  visibleCount?: number;
  dragSensitivity?: number;
  scrollSensitivity?: number;
  itemHeight?: number; // Renamed from optionItemHeight for brevity
  class?: string; // Standard Vue class prop
  overlayClass?: string; // For the highlight/overlay
}
