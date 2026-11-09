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
assert.ok(app.includes('$("up").value=sys()==1?"220":"380"'), "Network type and voltage selector synchronization missing");

const current = (p, u, threePhase) => p / (threePhase ? Math.sqrt(3) * u : u);
assert.equal(current(920, 230, false), 4);
assert.ok(Math.abs(current(2760, 400, true) - 3.9837168574) < 1e-9);
assert.ok(Math.abs(current(2280, 380, true) - 3.4641016151) < 1e-9);

const circuits = (p, phaseVoltage) => Math.max(1, Math.ceil(p / (0.8 * 10 * phaseVoltage)));
assert.equal(circuits(920, 230), 1);
assert.equal(circuits(2760, 400 / Math.sqrt(3)), 2);


const unbalance = (currents) => { const average = currents.reduce((sum, value) => sum + value, 0) / currents.length; return average > 0 ? Math.max(...currents.map(value => Math.abs(value - average))) / average * 100 : 0; };
assert.equal(unbalance([10, 10, 10]), 0);
assert.ok(Math.abs(unbalance([12, 9, 9]) - 20) < 1e-12);
assert.ok(Math.abs(unbalance([8, 11, 11]) - 20) < 1e-12);
const capacitorKvar = (kw, currentCos, targetCos) => kw * (Math.tan(Math.acos(currentCos)) - Math.tan(Math.acos(targetCos)));
assert.ok(capacitorKvar(20, 0.75, 0.95) > 0);
assert.ok(capacitorKvar(20, 0.95, 0.75) < 0);

console.log("PASS: inline JavaScript syntax, required safeguards, and representative electrical arithmetic.");
