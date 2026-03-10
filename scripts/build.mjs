import { mkdir, copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const distDir = path.join(root, "dist");
const distIconsDir = path.join(distDir, "icons");

await mkdir(distIconsDir, { recursive: true });

await esbuild.build({
  entryPoints: [path.join(root, "app.js")],
  outfile: path.join(distDir, "app.js"),
  bundle: true,
  format: "iife",
  target: ["es2020"],
  sourcemap: false,
  minify: false,
});

await copyFile(path.join(root, "index.html"), path.join(distDir, "index.html"));
await copyFile(path.join(root, "styles.css"), path.join(distDir, "styles.css"));
await copyFile(path.join(root, "manifest.webmanifest"), path.join(distDir, "manifest.webmanifest"));
await copyFile(path.join(root, "service-worker.js"), path.join(distDir, "service-worker.js"));
await copyFile(path.join(root, "icons", "icon.svg"), path.join(distIconsDir, "icon.svg"));

const configContents = await resolveConfig();
await writeFile(path.join(distDir, "config.js"), configContents, "utf8");

async function resolveConfig() {
  const envUrl = process.env.SUPABASE_URL;
  const envAnonKey = process.env.SUPABASE_ANON_KEY;

  if (envUrl && envAnonKey) {
    return `window.MONEYFLOW_CONFIG = ${JSON.stringify({
      supabaseUrl: envUrl,
      supabaseAnonKey: envAnonKey,
    }, null, 2)};\n`;
  }

  try {
    return await readFile(path.join(root, "config.js"), "utf8");
  } catch {
    return await readFile(path.join(root, "config.example.js"), "utf8");
  }
}
