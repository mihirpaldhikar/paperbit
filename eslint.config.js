import globals from "globals";
import pluginJS from "@eslint/js";
import pluginTS from "typescript-eslint";


/** @type {import('eslint').Linter.Config[]} */
export default [
    {files: ["**/*.{js,mjs,cjs,ts}"]},
    {languageOptions: {globals: {...globals.browser, ...globals.node}}},
    pluginJS.configs.recommended,
    ...pluginTS.configs.recommended,
];