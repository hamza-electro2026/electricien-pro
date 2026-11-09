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
const balancedThreePhaseCircuits = (p, phaseVoltage) => 3 * Math.max(1, Math.ceil((p / 3) / (0.8 * 10 * phaseVoltage)));
assert.equal(balancedThreePhaseCircuits(2760, 400 / Math.sqrt(3)), 3);
assert.equal(balancedThreePhaseCircuits(11040, 400 / Math.sqrt(3)), 6);


const unbalance = (currents) => { const average = currents.reduce((sum, value) => sum + value, 0) / currents.length; return average > 0 ? Math.max(...currents.map(value => Math.abs(value - average))) / average * 100 : 0; };
assert.equal(unbalance([10, 10, 10]), 0);
assert.ok(Math.abs(unbalance([12, 9, 9]) - 20) < 1e-12);
assert.ok(Math.abs(unbalance([8, 11, 11]) - 20) < 1e-12);
const capacitorKvar = (kw, currentCos, targetCos) => kw * (Math.tan(Math.acos(currentCos)) - Math.tan(Math.acos(targetCos)));
assert.ok(capacitorKvar(20, 0.75, 0.95) > 0);
assert.ok(capacitorKvar(20, 0.95, 0.75) < 0);

console.log("PASS: inline JavaScript syntax, required safeguards, and representative electrical arithmetic.");


// Exercise the actual pure calculation functions extracted from index.html.
// This avoids duplicating formulas in the test and accidentally testing a different implementation.
import vm from "node:vm";

const coreMatch = app.match(/\/\*CORE\*\/([\s\S]*?)\/\*END\*\//);
assert.ok(coreMatch, "Electrical calculation core markers missing");
const motorMatch = app.match(/const CS=\[[^\]]+\];\s*C\.motor=\(P,U,c,e\)=>\{[\s\S]*?\};\s*C\.lamps=\(E,S,F,cu,mf\)=>Math\.ceil\([^;]+;/);
assert.ok(motorMatch, "Motor and lighting calculation functions missing");
const advancedMatch = app.match(/C\.qc=\(P,c1,c2\)=>[^;]+;\s*C\.unbalance=\(a\)=>\{[\s\S]*?\};\s*const CVK=\[[^;]+;\s*C\.conv=\(v,m\)=>[^;]+;/);
assert.ok(advancedMatch, "Power-factor, phase-balance, and conversion functions missing");

const { C } = vm.runInNewContext(
  coreMatch[1] + "\n" + motorMatch[0] + "\n" + advancedMatch[0] + "\n({ C })"
);

// Single- and three-phase P/I arithmetic, using the application's own functions.
assert.equal(C.P(1, 230, 4, 1), 920);
assert.ok(Math.abs(C.I(3, 400, 2760, 1) - 3.9837168574) < 1e-9);
assert.ok(Math.abs(C.I(1, 230, 920, 1) - 4) < 1e-12);
assert.ok(Math.abs(C.P(3, 400, 5, 0.8) - 2771.2812921) < 1e-6);

// Cable voltage-drop and selection: one-way route length, copper resistivity,
// and the application's mono/three-phase coefficients.
assert.ok(Math.abs(C.dU("cu", 1, 25, 30, 2.5) - 13.5) < 1e-12);
assert.ok(Math.abs(C.dU("cu", 3, 25, 30, 2.5) - 11.6913429511) < 1e-9);
assert.ok(Math.abs(C.sByDrop("cu", 1, 230, 25, 30, 5).need - 2.9347826087) < 1e-9);
assert.equal(C.sByDrop("cu", 1, 230, 25, 30, 5).S, 4);
assert.equal(C.sByI("cu", 25, 1), 4);
assert.equal(C.sByI("cu", 25, 3), 4);
assert.equal(C.sByI("al", 50, 3), 16);
assert.equal(C.breaker(5), 6);
assert.equal(C.breaker(25), 25);
assert.equal(C.breaker(251), null);

// Motor, lighting, capacitor correction, unbalance, and unit conversion.
const motor = C.motor(5500, 380, 0.85, 0.88);
assert.ok(Math.abs(motor.I - 11.1716383357) < 1e-9);
assert.ok(Math.abs(motor.Pe - 6250) < 1e-9);
assert.ok(Math.abs(motor.Iy - motor.Id / 3) < 1e-12);
assert.equal(C.lamps(200, 20, 800, 0.6, 0.8), 11);
assert.ok(C.qc(20, 0.75, 0.95) > 0);
assert.ok(C.qc(20, 0.95, 0.75) < 0);
assert.equal(C.unbalance([10, 10, 10]), 0);
assert.ok(Math.abs(C.unbalance([12, 9, 9]) - 20) < 1e-12);
assert.ok(Math.abs(C.conv(1, 0) - 0.7355) < 1e-12);
assert.ok(Math.abs(C.conv(1, 1) - 0.7457) < 1e-12);

// UI-level guards must reject zero/negative physical inputs and out-of-range PF/efficiency.
assert.ok(app.includes("validPower=val>0") && app.includes("validCos=c>0&&c<=1") && app.includes("validU=U>0"));
assert.ok(app.includes("I2>0&&L2>0&&pc>0") && app.includes("I3>0&&L3>0&&S3>0"));
assert.ok(app.includes("I4>0"), "Breaker selector must reject zero/negative current");
assert.ok(app.includes("pm<=0||um<=0||mc<=0||mc>1||me<=0||me>100"));
assert.ok(app.includes("rho>0&&len>0&&dia>0"), "Earth-rod estimator must reject non-positive dimensions");
assert.ok(app.includes("su>0&&z>0"), "Short-circuit estimator must reject non-positive impedance");
assert.ok(app.includes("loads.every(x=>x>=0)&&loads.some(x=>x>0)"), "Phase balance must reject negative/all-zero loads");
