import fs from "fs";
import path from "path";

// 1. Configuration
const COMPONENT_NAME = "wheel-picker";
const REGISTRY_URL =
  "https://your-username.github.io/vue-wheel-picker-registry"; // Update this later

const COMPONENT_PATH = path.join(
  __dirname,
  "../src/components/WheelPicker.vue"
);
const TYPES_PATH = path.join(__dirname, "../src/components/types.ts"); // If you separated types
const OUTPUT_DIR = path.join(__dirname, "../docs/registry");

// 2. Read Source Files
const componentContent = fs.readFileSync(COMPONENT_PATH, "utf-8");
// If you have a separate types file, read it too. If not, ignore this.
// const typesContent = fs.readFileSync(TYPES_PATH, 'utf-8');

// 3. Define the Registry Schema
const registryItem = {
  name: COMPONENT_NAME,
  type: "registry:ui",
  dependencies: ["@vueuse/core"],
  files: [
    {
      // 1. Change path to just "folder/file" (No "ui/" prefix)
      // This will result in: src/components/ui/wheel-picker/index.vue
      path: `${COMPONENT_NAME}/index.vue`,

      content: componentContent,
      type: "registry:ui",

      // 2. DELETE THE TARGET LINE COMPLETELY
      // target: `components/ui/${COMPONENT_NAME}/index.vue` <--- DELETE THIS
    },
  ],
};

// 4. Create Output Directory
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// 5. Write the JSON file
const outputPath = path.join(OUTPUT_DIR, `${COMPONENT_NAME}.json`);
fs.writeFileSync(outputPath, JSON.stringify(registryItem, null, 2));

console.log(`✅ Registry built at: ${outputPath}`);
