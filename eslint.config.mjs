// @ts-check

import { baseConfig } from "@decibeltrade/eslint-config/base";
import { dirname } from "path";
import tseslint from "typescript-eslint";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default tseslint.config(
  {
    languageOptions: {
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        projectService: {
          allowDefaultProject: ["*.mjs"],
        },
        tsconfigRootDir: __dirname,
      },
    },
  },
  baseConfig,
);
