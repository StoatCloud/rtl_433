import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  adoptSwitch,
  exportHomeAssistantBundle
} from "../src/core/adoption-service.js";

test("adopt switch and export Home Assistant bundle", async () => {
  const tempHome = await fs.mkdtemp(
    path.join(os.tmpdir(), "kinetic-switch-adopter-test-")
  );
  process.env.KINETIC_SWITCH_HOME = tempHome;

  const adopted = await adoptSwitch({
    payload: "E198",
    name: "Kitchen Toggle"
  });
  assert.equal(adopted.payload, "e198");
  assert.equal(adopted.helperId, "input_boolean.kinetic_kitchen_toggle");

  const bundle = await exportHomeAssistantBundle({
    decoder:
      "n=KineticSwitch,m=OOK_PWM,s=52,l=188,g=1000,r=5000,bits>=14,bits<=24,unique",
    frequency: 433920000
  });

  const helpers = await fs.readFile(bundle.helpersPath, "utf8");
  const automations = await fs.readFile(bundle.automationPath, "utf8");
  const template = await fs.readFile(bundle.templatePath, "utf8");

  assert.match(helpers, /kinetic_kitchen_toggle/);
  assert.match(automations, /trigger\.payload_json\.data == 'e198'/);
  assert.match(template, /decoder n=KineticSwitch/);
});
