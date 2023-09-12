require("@rushstack/eslint-patch/modern-module-resolution");

module.exports = {
  extends: ["@toruslabs/eslint-config-typescript"],
  parser: "@typescript-eslint/parser",
  ignorePatterns: "*.config.js",
  parserOptions: {
    sourceType: "module",
    ecmaVersion: 2022,
    project: "./tsconfig.json",
  },
  rules: {
    "@typescript-eslint/no-throw-literal": 0,
    "no-case-declarations": 0,
    "import/extensions": [
      "error",
      "ignorePackages",
      {
        js: "never",
        jsx: "never",
        ts: "never",
        tsx: "never",
      },
    ],
  },
  env: {
    es2020: true,
    browser: true,
    node: true,
  },
};
