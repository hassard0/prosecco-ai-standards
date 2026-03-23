import { mkdir, writeFile } from "node:fs/promises";

const projectId = process.env.VITE_SUPABASE_PROJECT_ID;

if (!projectId) {
  console.error("Missing VITE_SUPABASE_PROJECT_ID");
  process.exit(1);
}

const baseUrl = `https://${projectId}.supabase.co/functions/v1/llms-txt`;

const targets = [
  { file: "public/llms.txt", url: baseUrl },
  { file: "public/llms-full.txt", url: `${baseUrl}?full=true` },
  { file: "public/directory.json", url: `${baseUrl}?format=json` },
  { file: "public/discovery.json", url: `${baseUrl}?format=json` },
];

await mkdir("public", { recursive: true });

await Promise.all(
  targets.map(async ({ file, url }) => {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }

    const text = await response.text();
    await writeFile(file, text, "utf8");
  }),
);

console.log("Generated machine-readable files:", targets.map((target) => target.file).join(", "));