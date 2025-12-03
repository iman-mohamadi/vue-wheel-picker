import fs from "fs";
import path from "path";

// 1. Configuration
const COMPONENT_NAME = "wheel-picker";
const REGISTRY_URL = "https://iman-mohamadi.github.io/vue-wheel-picker";

const COMPONENT_PATH = path.join(
  __dirname,
  "../src/components/WheelPicker.vue"
);
const OUTPUT_DIR = path.join(__dirname, "../docs/registry");

// 2. Read Source Files
const componentContent = fs.readFileSync(COMPONENT_PATH, "utf-8");

// 3. Define the 'index.ts' content manually
// This simply exports the Vue component so users can import it cleanly
const indexContent = `export { default as WheelPicker } from './WheelPicker.vue'
export type { WheelPickerOption, WheelPickerProps } from './WheelPicker.vue'
`;

// 4. Define the Registry Schema
const registryItem = {
  name: COMPONENT_NAME,
  type: "registry:ui",
  dependencies: ["@vueuse/core"],
  files: [
    {
      // File 1: The Vue Component (Renamed to WheelPicker.vue)
      path: `${COMPONENT_NAME}/WheelPicker.vue`,
      content: componentContent,
      type: "registry:ui",
    },
    {
      // File 2: The Index Export File
      path: `${COMPONENT_NAME}/index.ts`,
      content: indexContent,
      type: "registry:ui",
    },
  ],
};

// 5. Create Output Directory
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// 6. Write the JSON file
const outputPath = path.join(OUTPUT_DIR, `${COMPONENT_NAME}.json`);
fs.writeFileSync(outputPath, JSON.stringify(registryItem, null, 2));

console.log(`✅ Registry built at: ${outputPath}`);
