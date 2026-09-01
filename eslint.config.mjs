import { defineConfig } from "eslint/config";
import v3xlint from "eslint-plugin-v3xlabs";

export default defineConfig([
  {
    ignores: [
      "**/node_modules/**",
      "**/.output/**",
      "**/.wxt/**",
      "**/*.js",
      "**/*.mjs",
    ],
  },
  ...v3xlint.configs.recommended,
  {
    rules: {
      "unicorn/no-useless-undefined": "off",
      "@stylistic/type-named-tuple-spacing": "off",
      "import/no-default-export": "off",
      "unicorn/no-null": "off",
    },
  },
]);
