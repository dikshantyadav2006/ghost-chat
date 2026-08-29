import reactHooks from "eslint-plugin-react-hooks";

import { base } from "./base.js";

const react = [
  ...base,
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
];

export { react };
