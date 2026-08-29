import { nextjs } from "@repo/config-eslint";

const config = [
  {
    ignores: ["next-env.d.ts", "**/next-env.d.ts"],
  },
  ...nextjs,
];

export default config;
