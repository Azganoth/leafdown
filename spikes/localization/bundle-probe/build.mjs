import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const { build } = await import(process.argv[2]);

for (const entry of readdirSync(join(here, "entries"))) {
  const name = entry.replace(/\.ts$/, "");
  const outDir = join(here, "dist", name);
  await build({
    configFile: false,
    logLevel: "silent",
    root: here,
    build: {
      outDir,
      emptyOutDir: true,
      target: "es2022",
      lib: { entry: join(here, "entries", entry), formats: ["es"], fileName: name },
    },
  });
  const code = readFileSync(join(outDir, `${name}.js`));
  console.log(
    `${name.padEnd(10)} minified ${String(code.length).padStart(7)} B  gzip ${String(gzipSync(code).length).padStart(6)} B`,
  );
}
