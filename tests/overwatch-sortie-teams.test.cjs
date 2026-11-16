const test = require("node:test"),
  assert = require("node:assert/strict"),
  C = require("../overwatch/core"),
  P = require("../overwatch/personnel"),
  D = require("../overwatch/command"),
  B = require("../overwatch/battle"),
  M = require("../overwatch/missions"),
  S = require("../overwatch/command-staff");
function make(key = "aid-cover") {
  const s = C.createCampaign({ id: "SORTIE" }),
    h = (r) =>
      P.hire(s, s.market.candidates.find((c) => c.specialty === r).id, 30);
  for (const call of C.CALLSIGNS)
    P.assign(s, call, h("observer").id, h("sniper").id);
  S.upgrade(s);
  const chief = S.hire(
    s,
    s.commandStaff.market.find((c) => c.duty === "controller").id,
  );
  S.assign(s, "controller", chief.id);
  const c = s.contracts.find((c) => c.key === key);
  M.accept(s, c.id);
  return { s, c };
}
test("commander selects one of three teams; exactly two actual entities deploy and four remain at headquarters", () => {
  const { s, c } = make(),
    all = M.reserveFor(s).total,
    roster = C.clone(s.squads);
  M.setTeams(s, c.id, ["BRAVO"]);
  const cost = M.reserveFor(s).total;
  assert.equal(cost, all / 3);
  const copy = C.clone(s);
  C.validate(copy);
  M.launch(copy, c.id);
  const e = copy.commandExercise;
  assert.deepEqual(
    e.squads.map((q) => q.callsign),
    ["BRAVO"],
  );
  assert.equal(e.world.units.length, 2);
  assert.deepEqual(
    copy.activeMission.memberIds,
    s.squads[1] ? [s.squads[1].observerId, s.squads[1].sniperId] : [],
  );
  assert.deepEqual(copy.squads, roster);
  assert.equal(copy.members.length, 6);
  assert.equal(e.mission.budget.total, cost);
  C.validate(copy);
  assert.throws(() => M.setTeams(copy, c.id, ["ALPHA"]));
  for (let i = 0; i < 160; i++) {
    B.setPaused(copy, false);
    D.step(copy, 1);
    C.validate(copy);
  }
  assert.equal(e.status, "running");
  assert.equal(e.mission.returnRequested, false);
  assert.ok(
    e.commands.some((c) => c.callsign === "BRAVO" && c.kind === "recon"),
  );
});
test("zero teams and a contract below its required crew cannot launch; missing and duplicate team names are rejected", () => {
  const { s, c } = make("rescue-cover");
  M.setTeams(s, c.id, []);
  assert.match(M.ready(s, c), /4~6/);
  assert.throws(() => M.launch(s, c.id));
  M.setTeams(s, c.id, ["CHARLIE"]);
  assert.match(M.ready(s, c), /4~6/);
  M.setTeams(s, c.id, ["ALPHA", "CHARLIE"]);
  assert.equal(M.ready(s, c), null);
  assert.throws(() => M.setTeams(s, c.id, ["ALPHA", "ALPHA"]));
  assert.throws(() => M.setTeams(s, c.id, ["DELTA"]));
  M.launch(s, c.id);
  assert.equal(s.commandExercise.world.units.length, 4);
  assert.deepEqual(
    s.commandExercise.squads.map((q) => q.callsign),
    ["ALPHA", "CHARLIE"],
  );
  C.validate(s);
});
test("old contracts without a selection still use the existing full formation and training keeps all pairs", () => {
  const { s, c } = make();
  assert.equal(M.selectedSquads(s, c).length, 3);
  M.cancel(s, c.id);
  B.begin(s, { mapId: "urban-port" });
  assert.equal(s.commandExercise.world.units.length, 6);
  C.validate(s);
});
test("an unselected wounded pair does not block selected healthy operators or appear in mission statistics", () => {
  const { s, c } = make(),
    unselected = s.members.find((m) => m.id === s.squads[0].sniperId);
  unselected.fatigue = 100;
  M.setTeams(s, c.id, ["CHARLIE"]);
  assert.equal(M.ready(s, c), null);
  M.launch(s, c.id);
  assert.ok(!s.commandExercise.mission.stats[unselected.id]);
  assert.equal(unselected.fatigue, 100);
  C.validate(s);
});
