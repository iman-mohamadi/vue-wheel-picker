import fs from "fs";
import path from "path";

// 1. Configuration
const COMPONENT_NAME = "wheel-picker";
// Make sure this points to your docs folder for GitHub Pages
const OUTPUT_DIR = path.join(__dirname, "../docs/registry");

const COMPONENT_PATH = path.join(
  __dirname,
  "../src/components/WheelPicker.vue"
);
const ITEM_PATH = path.join(__dirname, "../src/components/WheelPickerItem.vue");

// 2. Read Source Files
const componentContent = fs.readFileSync(COMPONENT_PATH, "utf-8");
const itemContent = fs.readFileSync(ITEM_PATH, "utf-8");

// 3. Define the 'index.ts' content manually
const indexContent = `export { default as WheelPicker } from './WheelPicker.vue'
export { default as WheelPickerItem } from './WheelPickerItem.vue'
export type { WheelPickerOption } from './WheelPicker.vue'
`;

// 4. Define the Registry Schema
const registryItem = {
  name: COMPONENT_NAME,
  type: "registry:ui",
  dependencies: ["@vueuse/core"],
  files: [
    {
      path: `${COMPONENT_NAME}/WheelPicker.vue`,
      content: componentContent,
      type: "registry:ui",
    },
    {
      path: `${COMPONENT_NAME}/WheelPickerItem.vue`,
      content: itemContent,
      type: "registry:ui",
    },
    {
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
