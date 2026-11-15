/* Isolate end-to-end command and transport progression from combat outcomes. */
const test = require("node:test"),
  assert = require("node:assert/strict"),
  C = require("../overwatch/core"),
  P = require("../overwatch/personnel"),
  D = require("../overwatch/command"),
  B = require("../overwatch/battle"),
  M = require("../overwatch/missions"),
  Staff = require("../overwatch/command-staff");
for (const key of [
  "ridge-watch",
  "aid-cover",
  "rescue-cover",
  "vip-cover",
  "quiet-watch",
])
  test(
    "delegated " +
      key +
      " advances from approval through actual objective and physical return without player orders",
    () => {
      const s = C.createCampaign({ id: "AUTO-" + key }),
        hire = (role) =>
          P.hire(
            s,
            s.market.candidates.find((c) => c.specialty === role).id,
            30,
          ),
        contract = s.contracts.find((c) => c.key === key);
      for (let i = 0; i < contract.min / 2; i++) {
        const o = hire("observer"),
          n = hire("sniper");
        P.assign(s, C.CALLSIGNS[i], o.id, n.id);
      }
      const controller = hire("observer"),
        instructor = hire("sniper");
      Staff.initialize(s);
      Staff.assign(s, "controller", controller.id);
      Staff.assign(s, "instructor", instructor.id);
      M.accept(s, contract.id);
      M.launch(s, contract.id);
      const e = s.commandExercise;
      for (let i = 0; i < 4000 && e.status === "running"; i++) {
        for (const a of e.world.actors.filter((a) => a.side === "red"))
          a.weapon.nextFireAt = e.time + 20;
        B.setPaused(s, false);
        D.step(s, 1);
        if (i % 40 === 0) C.validate(s);
      }
      C.validate(s);
      assert.equal(
        e.status,
        "ended",
        JSON.stringify({
          key,
          time: e.time,
          phase: e.mission.phase,
          control: e.control?.phase,
        }),
      );
      assert.equal(e.mission.knowledge.objective, "complete");
      assert.equal(e.mission.home.length, contract.min);
      assert.equal(s.operations.reports.length, 1);
      assert.equal(s.activeMission, null);
      assert.ok(
        e.radio.some((r) => r.route === "down" && r.from.id === controller.id),
      );
      assert.ok(
        D.frame(s).transports.every(
          (t) => !["home", "unused"].includes(t.state),
        ),
      );
    },
  );
