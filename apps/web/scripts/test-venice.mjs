import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(path, override = false) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (override || process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(resolve(process.cwd(), ".env"));
loadEnvFile(resolve(process.cwd(), ".env.local"), true);

const apiKey = process.env.VENICE_API_KEY;
const baseURL = process.env.VENICE_BASE_URL || "https://api.venice.ai/api/v1";
const model = process.env.VENICE_MODEL || "llama-3.3-70b";

if (!apiKey) {
  throw new Error("VENICE_API_KEY is not configured in apps/web/.env.local");
}

console.log("Venice smoke test");
console.log(`Base URL: ${baseURL}`);
console.log(`Model: ${model}`);
console.log("API key: configured");

const res = await fetch(`${baseURL.replace(/\/$/, "")}/chat/completions`, {
  method: "POST",
  headers: {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    model,
    messages: [
      {
        role: "system",
        content: "You are a concise Clashboard integration health check.",
      },
      {
        role: "user",
        content:
          "Reply with one short sentence confirming Venice is ready for live debate arguments.",
      },
    ],
    max_tokens: 64,
    temperature: 0.2,
  }),
});

const raw = await res.text();
let body;
try {
  body = JSON.parse(raw);
} catch {
  body = raw;
}

if (!res.ok) {
  throw new Error(`Venice request failed (${res.status}): ${JSON.stringify(body)}`);
}

const message = body?.choices?.[0]?.message?.content;
if (!message) {
  throw new Error(`Venice response did not include a completion: ${JSON.stringify(body)}`);
}

console.log(`Response: ${message.trim()}`);
console.log("Venice smoke test passed.");
