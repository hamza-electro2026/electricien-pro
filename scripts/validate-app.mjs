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
const advancedMatch = app.match(/C\.qc=\(P,c1,c2\)=>[^;]+;\s*C\.unbalance=a=>\{[\s\S]*?\};\s*const CVK=\[[^;]+;\s*C\.conv=\(v,m\)=>[^;]+;/);
assert.ok(advancedMatch, "Power-factor, phase-balance, and conversion functions missing");

const { C } = vm.runInNewContext(
  coreMatch[1] + "\n" + motorMatch[0] + "\n" + advancedMatch[0] + "\n({ C })"
);

// Input voltage resolver preserves legacy blank defaults but rejects explicit invalid values.
assert.equal(C.inputVoltage("", 1), 220);
assert.equal(C.inputVoltage("   ", 3), 380);
assert.equal(C.inputVoltage("230", 1), 230);
assert.equal(C.inputVoltage("400", 3), 400);
assert.equal(C.inputVoltage("0", 1), null);
assert.equal(C.inputVoltage("-230", 1), null);
assert.equal(C.inputVoltage("not-a-voltage", 3), null);
assert.equal(C.inputVoltage("1e999", 3), null);

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
assert.ok(app.includes("C.earthRod(rho,len,dia)") && app.includes("rho<=0||len<=0||dia<=0"), "Earth-rod estimator must reject non-positive dimensions");
assert.ok(app.includes("C.shortCircuit(su,z)") && app.includes("u<=0||z<=0"), "Short-circuit estimator must reject non-positive impedance");
assert.ok(app.includes("C.balance(vl,bc,loads)") && app.includes("loads.every(x=>Number.isFinite(x)&&x>=0)"), "Phase balance must reject negative/all-zero loads");

assert.ok(app.includes("vérifier la limite du circuit") && app.includes("تحقق من الحد الخاص بالدائرة"), "Voltage drop between 3% and 5% must not be labelled compliant without knowing circuit type");
assert.ok(!app.includes('pp<=5?"✔ ≤ 5 %"'), "Remove the misleading universal 5% compliance label");
assert.ok(app.includes('U=C.inputVoltage($("u").value,s)'), "Power-factor correction must resolve and validate its voltage input");
assert.ok(app.includes("if(U!==null&&P>0&&a>0"), "Power-factor correction must reject zero, negative and non-numeric voltage");
assert.ok(app.includes('row(t.rcd,t.rcdv,"")'), "Breaker result must retain the 30 mA circuit context");
assert.ok(!app.includes('row(t.rcd,t.rcdv.split(" ")[0],"mA")'), "Do not strip the RCD use conditions from the displayed result");
assert.ok(app.includes("risque de surcompensation à faible charge") && app.includes("خطر التعويض الزائد عند الحمل المنخفض"), "Capacitor correction guidance must warn about overcompensation");
assert.ok(!app.includes("Choisissez le gradin de condensateurs standard immédiatement supérieur"), "Do not automatically recommend the next capacitor step");
assert.ok(app.includes("courants sinusoïdaux décalés de 120°") && app.includes("لا يحسب اختلاف معاملات القدرة ولا التوافقيات"), "Phase-balance neutral estimate must state its assumptions");
assert.ok(app.includes("NM 06.1.100 à NM 06.1.106") && app.includes("NM IEC 60909-0") && app.includes("NM EN 50160"), "Moroccan references must be explicit");
assert.ok(app.includes("NF C 15-100 est une référence française, pas une prescription marocaine") && app.includes("NF C 15-100 مرجع فرنسي"), "French reference must not be presented as Moroccan law");
assert.ok(app.includes("IEC 60038 retient 230/400 V") && app.includes("يعتمد IEC 60038 قيمة 230/400 فولت"), "Voltage defaults must be distinguished from current IEC reference values");

// Public content pages must be discoverable and contain useful bilingual material.
const publicPages = [
  ["about.html", "À propos d’Électricien Pro"],
  ["guide.html", "Guide pratique des calculs électriques"],
  ["calculs-pratiques.html", "Exemples pratiques de calcul électrique"],
  ["guide-installation.html", "Préparer et vérifier une installation électrique"],
  ["faq.html", "Questions fréquentes sur les calculs électriques"],
  ["privacy.html", "Politique de confidentialité"],
  ["contact.html", "Contact"]
];
const sitemap = readFileSync(new URL("../sitemap.xml", import.meta.url), "utf8");
for (const [path, title] of publicPages) {
  const page = readFileSync(new URL("../" + path, import.meta.url), "utf8");
  assert.ok(page.includes("<title>") && page.includes(title), `Missing or incorrect page title: ${path}`);
  assert.ok(page.includes('rel="canonical"'), `Missing canonical URL: ${path}`);
  assert.ok(sitemap.includes(`/electricien-pro/${path}`), `Page missing from sitemap: ${path}`);
  assert.ok(page.includes('lang="ar"'), `Arabic content missing: ${path}`);
}
assert.ok(html.includes('href="guide-installation.html"'), "Homepage must link to the installation guide");
assert.ok(html.includes('href="calculs-pratiques.html"'), "Homepage must link to practical calculation examples");
assert.ok(readFileSync(new URL("../privacy.html", import.meta.url), "utf8").includes("ne contient pas de code publicitaire"), "Privacy policy must accurately disclose that ads are not active yet");

console.log("PASS: public pages, bilingual content, canonical links, sitemap, and monetization disclosure.");

const serviceWorker = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
for (const path of ["about.html", "guide.html", "calculs-pratiques.html", "guide-installation.html", "faq.html", "privacy.html", "contact.html"]) {
  assert.ok(serviceWorker.includes(`"${path}"`), `Service worker must cache ${path} for offline reading`);
}
assert.ok(serviceWorker.includes('const V="ep-v10"'), "Service worker cache version must change when the offline file list changes");

assert.ok(html.includes('shortu:"Tension phase-neutre U (V)"') && html.includes('shortu:"الجهد بين الطور والمحايد U (فولت)"'), "Short-circuit voltage input must explicitly be phase-to-neutral");
assert.ok(html.includes("U0 est la tension phase-neutre") && html.includes("ليست معادلة لقصر ثلاثي الأطوار"), "Short-circuit estimate must state its single-phase loop assumptions");
assert.ok(html.includes("référence française") && html.includes("المعيار الفرنسي"), "NF C 15-100 examples must be clearly identified as French reference values");
assert.ok(html.includes("ne constituent pas à eux seuls une prescription marocaine") && html.includes("ولا تمثل وحدها متطلبات المغرب"), "Do not imply French circuit examples automatically establish Moroccan compliance");

assert.ok(html.includes('len:"Longueur aller (m)"') && html.includes('len:"طول المسار في اتجاه واحد (متر)"'), "Cable route length must be specified as one-way");
assert.ok(html.includes("source normative et le mode de pose exact") && html.includes("مصدر جدول تحمل التيار والمعيار وطريقة التركيب المرجعية غير محددة"), "Do not imply the undocumented ampacity table has a verified normative basis");
assert.ok(html.includes("coefficient conventionnel de calcul, pas la résistivité à 20 °C") && html.includes("معامل حسابي اصطلاحي وليست مقاومية الموصل عند 20 درجة مئوية"), "Do not mislabel the application's conventional voltage-drop coefficients as 20°C resistivity");
assert.ok(html.includes("NM EN 60228") && html.includes("درجة حرارة التشغيل"), "Direct conductor resistance checks to NM EN 60228 or manufacturer data corrected to service temperature");
assert.ok(html.includes("ρ:0.0225") && html.includes("rho:0.036"), "Preserve the existing calculation coefficients pending a justified engineering review");
assert.ok(html.includes("la formule suppose un réseau triphasé équilibré") && html.includes("يفترض توازن الشبكة الثلاثية"), "Three-phase resistive voltage-drop formula must state balanced-load assumption");

assert.equal(C.ohm(230, 2, 0).R, 115);
assert.equal(C.ohm(230, 0, 115).I, 2);
assert.equal(C.ohm(0, 2, 115).U, 230);
assert.equal(C.ohm(230, 2, 115), null, "Ohm calculator must not silently ignore a third supplied value");
assert.equal(C.ohm(-230, 2, 0), null, "Ohm calculator must reject negative inputs");
assert.equal(C.ohm(0, 0, 115), null, "Ohm calculator must require exactly two positive values");
assert.ok(app.includes("cv>0&&Number.isFinite(r)"), "Unit conversion must reject zero/negative/non-finite values");
assert.ok(app.includes("Saisissez une valeur strictement positive") && app.includes("أدخل قيمة موجبة أكبر من صفر"), "Unit conversion validation message must be bilingual");
assert.ok(app.includes("const ohm=C.ohm(u,i,rr)"), "Ohm calculator must use validated pure helper");

const capSingle = C.capBank(5000, 230, 50, 1, "d");
const capDelta = C.capBank(5000, 400, 50, 3, "d");
const capStar = C.capBank(5000, 400, 50, 3, "y");
assert.ok(Math.abs(capSingle * 1e6 - 300.8600058) < 1e-6);
assert.ok(Math.abs(capDelta * 1e6 - 33.15727981) < 1e-7);
assert.ok(Math.abs(capStar * 1e6 - 99.47183943) < 1e-7);
assert.equal(C.capBank(0, 230, 50, 1, "d"), null);
assert.equal(C.capBank(5000, 0, 50, 3, "y"), null);
assert.equal(C.capBank(5000, 400, 50, 2, "d"), null);

const earth = C.earthRod(100, 2, 0.016);
assert.ok(Math.abs(earth - 41.49653276) < 1e-7);
assert.equal(C.earthRod(100, 0, 0.016), null);
assert.equal(C.earthRod(100, 0.001, 0.016), null);
assert.ok(Math.abs(C.shortCircuit(230, 0.5) - 460) < 1e-12);
assert.equal(C.shortCircuit(230, 0), null);
assert.equal(C.shortCircuit(-230, 0.5), null);

const transformer = C.transformer(100, 20000, 400, 3);
assert.ok(Math.abs(transformer.ip - 2.886751346) < 1e-9);
assert.ok(Math.abs(transformer.is - 144.3375673) < 1e-7);
assert.equal(C.transformer(100, 20000, 0, 3), null);
assert.equal(C.transformer(100, 20000, 400, 2), null);

const balanced = C.balance(400, 0.9, [3000, 2500, 2000]);
assert.ok(Math.abs(balanced.unbalance - 20) < 1e-10);
assert.ok(Math.abs(balanced.neutral - 4.166666667) < 1e-8);
assert.equal(C.balance(400, 0, [3000, 2500, 2000]), null);
assert.equal(C.balance(400, 0.9, [3000, -1, 2000]), null);
assert.equal(C.balance(400, 0.9, [0, 0, 0]), null);
assert.ok(app.includes("C.capBank(q,uc,hz,ph,conn)") && app.includes("C.earthRod(rho,len,dia)"));
assert.ok(app.includes("C.shortCircuit(su,z)") && app.includes("C.transformer(kva,up,us,phase)"));
assert.ok(app.includes("C.balance(vl,bc,loads)"), "Advanced calculators must use tested pure helpers");
