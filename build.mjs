import { build } from "esbuild";

await build({
  entryPoints: ["index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  sourcemap: false,
  external: ["@typegaro/atom-plugin", "@opentui/core"]
});
