import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  adoptWeatherSensor,
  adoptSwitch,
  exportHomeAssistantWeatherBundle,
  exportHomeAssistantBundle
} from "../src/core/adoption-service.js";
import { loadState, saveState } from "../src/core/persistence.js";

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

test("adopt weather sensor and export weather Home Assistant bundle", async () => {
  const tempHome = await fs.mkdtemp(
    path.join(os.tmpdir(), "kinetic-weather-adopter-test-")
  );
  process.env.KINETIC_SWITCH_HOME = tempHome;

  const sensorKey = "AmbientWeather-WH31E::42::1";
  const state = await loadState();
  state.discoveredWeather[sensorKey] = {
    sensorKey,
    model: "AmbientWeather-WH31E",
    id: "42",
    channel: "1",
    rawCount: 3,
    metricFields: ["temperature_C", "humidity", "pressure_hPa"],
    lastMetrics: {
      temperature_C: 21.4,
      humidity: 43,
      pressure_hPa: 1014.2
    }
  };
  await saveState(state);

  const adopted = await adoptWeatherSensor({
    sensorKey,
    name: "Backyard Weather",
    fields: ["temperature_C", "humidity"]
  });

  assert.equal(adopted.entitySlug, "backyard_weather");
  assert.deepEqual(adopted.fields, ["humidity", "temperature_C"]);

  const bundle = await exportHomeAssistantWeatherBundle({
    frequency: 433920000,
    protocols: [112, 113]
  });

  const sensorsYaml = await fs.readFile(bundle.weatherSensorsPath, "utf8");
  const template = await fs.readFile(bundle.weatherTemplatePath, "utf8");

  assert.match(sensorsYaml, /Backyard Weather temperature C/);
  assert.match(sensorsYaml, /Backyard Weather humidity/);
  assert.match(template, /protocol 112/);
  assert.match(template, /protocol 113/);
});
