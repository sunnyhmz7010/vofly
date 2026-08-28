import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/commandCenter.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
});
const moduleURL = `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`;
const {
  buildDangerousCommand,
  mergeCommandEvents,
  retainLatestCommandEvents,
} = await import(moduleURL);

test("merges command events by id and keeps chronological order", () => {
  const merged = mergeCommandEvents(
    [{ id: 2, text: "old" }, { id: 1, text: "first" }],
    [{ id: 2, text: "new" }, { id: 3, text: "third" }],
  );

  assert.deepEqual(merged.map((event) => [event.id, event.text]), [
    [1, "first"],
    [2, "new"],
    [3, "third"],
  ]);
});

test("retains the latest command events and reports dropped history", () => {
  const retained = retainLatestCommandEvents([{ id: 1 }, { id: 2 }, { id: 3 }], 2);

  assert.equal(retained.dropped, true);
  assert.deepEqual(retained.events.map((event) => event.id), [2, 3]);
});

test("builds dangerous shortcut commands with required arguments", () => {
  assert.equal(buildDangerousCommand({ name: "switch", device: "dev1", target: "2" }), "/switch dev1 2");
  assert.equal(buildDangerousCommand({ name: "rotate", device: "dev1" }), "/rotate dev1");
  assert.equal(
    buildDangerousCommand({ name: "cellcall", device: "dev1", phone: "+12025550123", duration: 15 }),
    "/cellcall dev1 +12025550123 15",
  );
  assert.throws(
    () => buildDangerousCommand({ name: "vocall", device: "dev1", phone: "", duration: 15 }),
    /号码/,
  );
});
