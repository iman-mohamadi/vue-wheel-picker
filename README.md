# Shadcn Vue Wheel Picker

A high-performance, iOS-style 3D wheel picker component for Vue 3. Ported from [react-wheel-picker](https://github.com/ncdai/react-wheel-picker) to work seamlessly with the **Shadcn Vue** ecosystem.

It features 60fps physics-based scrolling, infinite looping, and genuine 3D perspective transforms.

## Features

- 🏗 **Shadcn Vue Compatible**: Designed to fit right into your `components/ui` folder.
- 🚀 **High Performance**: Physics engine runs outside the Vue reactivity loop for 60fps smoothness.
- 🔄 **Infinite Scrolling**: Seamlessly loops through options.
- 📱 **Mobile Touch**: Full touch and drag support with inertia.
- 🎨 **Compound Components**: Support for both data-driven `options` prop and declarative `<WheelPickerItem />` slots.

## Installation

You can install this component directly via the command line using the shadcn-vue CLI.

```bash
npx shadcn-vue@latest add [https://iman-mohamadi.github.io/vue-wheel-picker/registry/wheel-picker.json](https://iman-mohamadi.github.io/vue-wheel-picker/registry/wheel-picker.json)