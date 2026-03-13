import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { discoverWeatherSensors } from "../src/core/discovery-service.js";
import { loadState } from "../src/core/persistence.js";

async function createFakeRtlBinary(scriptDir) {
  const scriptPath = path.join(scriptDir, "fake_weather_rtl_433");
  const lines = [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "echo '{\"time\":\"2026-03-13T00:00:00Z\",\"model\":\"AmbientWeather-WH31E\",\"id\":42,\"channel\":1,\"temperature_C\":21.5,\"humidity\":40,\"rssi\":-0.3,\"snr\":14.2}'",
    "echo '{\"time\":\"2026-03-13T00:00:01Z\",\"model\":\"AmbientWeather-WH31E\",\"id\":42,\"channel\":1,\"temperature_C\":21.6,\"humidity\":41,\"rssi\":-0.4,\"snr\":14.0}'",
    "echo '{\"time\":\"2026-03-13T00:00:02Z\",\"model\":\"AmbientWeather-WH31E\",\"id\":42,\"channel\":1,\"temperature_C\":21.7,\"humidity\":42,\"rssi\":-0.5,\"snr\":13.8}'"
  ];
  await fs.writeFile(scriptPath, lines.join("\n"), "utf8");
  await fs.chmod(scriptPath, 0o755);
  return scriptPath;
}

test("discover weather sensors groups Ambient frames by stable identity", async () => {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "kinetic-weather-discovery-test-")
  );
  process.env.KINETIC_SWITCH_HOME = path.join(tempDir, "state");
  const binaryPath = await createFakeRtlBinary(tempDir);

  const result = await discoverWeatherSensors({
    frequency: 433920000,
    durationSeconds: 1,
    protocols: [113],
    useAmbientPreset: false,
    binaryPath
  });

  assert.equal(result.summary.totalCandidates, 1);
  assert.equal(result.summary.likelySensors, 1);
  assert.equal(result.summary.sensors[0].sensorKey, "AmbientWeather-WH31E::42::1");
  assert.match(result.summary.sensors[0].metricFields.join(","), /temperature_C/);
  assert.match(result.summary.sensors[0].metricFields.join(","), /humidity/);

  const state = await loadState();
  assert.ok(state.discoveredWeather["AmbientWeather-WH31E::42::1"]);
});
