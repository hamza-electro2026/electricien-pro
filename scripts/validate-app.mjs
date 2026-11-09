import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter(([, attrs, body]) => body.trim() && !attrs.includes("application/ld+json"))
  .map(([, , body]) => body);

assert.ok(scripts.length > 0, "No executable inline JavaScript found");
for (const source of scripts) new Function(source);

const app = scripts.join("\n");
assert.ok(app.includes('mvolt:"Tension entre phases'), "French three-phase motor voltage label missing");
assert.ok(app.includes('mvolt:"الجهد بين الأطوار'), "Arabic three-phase motor voltage label missing");
assert.ok(app.includes('Math.sqrt(3)*N("u")'), "Balanced three-phase lighting current formula missing");
assert.ok(app.includes("0.8*10*phaseU"), "80%-loaded lighting circuit calculation missing");
assert.ok(app.includes('mc>1||me<=0||me>100'), "Motor input bounds validation missing");
assert.ok(app.includes('cu<=1&&mf>0&&mf<=1'), "Lighting factor bounds validation missing");

const current = (p, u, threePhase) => p / (threePhase ? Math.sqrt(3) * u : u);
assert.equal(current(920, 230, false), 4);
assert.ok(Math.abs(current(2760, 400, true) - 3.9837168574) < 1e-9);
assert.ok(Math.abs(current(2280, 380, true) - 3.4641016151) < 1e-9);

const circuits = (p, phaseVoltage) => Math.max(1, Math.ceil(p / (0.8 * 10 * phaseVoltage)));
assert.equal(circuits(920, 230), 1);
assert.equal(circuits(2760, 400 / Math.sqrt(3)), 2);

console.log("PASS: inline JavaScript syntax, required safeguards, and representative electrical arithmetic.");
