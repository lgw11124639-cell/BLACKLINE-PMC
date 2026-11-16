const test = require("node:test"),
  assert = require("node:assert/strict"),
  C = require("../overwatch/core"),
  P = require("../overwatch/personnel"),
  D = require("../overwatch/command"),
  B = require("../overwatch/battle");
function make() {
  const s = C.createCampaign({ id: "LONG-RADIO" }),
    h = (r) =>
      P.hire(s, s.market.candidates.find((c) => c.specialty === r).id, 30);
  P.assign(s, "ALPHA", h("observer").id, h("sniper").id);
  B.begin(s, { seed: 7 });
  for (let i = 0; i < 15; i++) {
    B.setPaused(s, false);
    D.step(s, 1);
  }
  return { s, e: s.commandExercise };
}
test("long-running delivered telemetry is compacted while retaining actual evidence for current HQ knowledge and pending radio", () => {
  const { s, e } = make(),
    source = e.radio.find(
      (r) => r.route === "up" && r.status === "delivered" && r.payload?.friends,
    );
  assert.ok(source);
  for (let i = 0; i < 2300; i++) {
    const r = C.clone(source);
    r.id = "radio-" + ++e.sequence;
    e.radio.push(r);
  }
  const pending = D.issue(s, "ALPHA", "hold");
  const pendingRadio = e.radio.find(
    (r) => r.payload?.commandId === pending.id && r.route === "down",
  );
  assert.ok(pendingRadio);
  e.time += 200;
  s.clock.elapsedSeconds = e.startedAt + e.time;
  B.setPaused(s, false);
  D.step(s, 1);
  assert.ok(e.radio.length < 2200);
  assert.ok(e.radio.some((r) => r.id === pendingRadio.id));
  assert.equal(e.status, "running");
  C.validate(s);
});
test("retired command histories compact together with their radio references without removing current commands", () => {
  const { s, e } = make();
  for (let i = 0; i < 260; i++) {
    const c = D.issue(s, "ALPHA", "hold");
    c.status = "cancelled";
    for (const r of e.radio.filter((r) => r.payload?.commandId === c.id))
      r.status = "cancelled";
  }
  assert.ok(e.commands.length < 240);
  assert.ok(
    e.radio.every(
      (r) =>
        !r.payload?.commandId ||
        e.commands.some((c) => c.id === r.payload.commandId),
    ),
  );
  C.validate(s);
});
