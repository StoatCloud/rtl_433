#!/usr/bin/env node
import { Command } from "commander";
import {
  AMBIENT_WEATHER_PROTOCOLS,
  analyzeSignal,
  discoverWeatherSensors,
  discoverSwitches,
  getPersistedState
} from "./core/discovery-service.js";
import {
  adoptWeatherSensor,
  adoptSwitch,
  exportHomeAssistantWeatherBundle,
  exportHomeAssistantBundle
} from "./core/adoption-service.js";

function parseCsvNumbers(value) {
  return String(value)
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((num) => Number.isFinite(num));
}

function parseCsvStrings(value) {
  return String(value)
    .split(",")
    .map((part) => part.trim())
    .filter((entry) => entry.length > 0);
}

const program = new Command();
program
  .name("kinetic-switch-adopter")
  .description("Discover and adopt kinetic RF switches for Home Assistant")
  .showHelpAfterError();

program
  .command("analyze")
  .description("Run rtl_433 analysis mode and recommend a decoder")
  .requiredOption("--frequency <hz>", "RF frequency in Hz", Number)
  .option("--duration <seconds>", "analysis duration", Number, 30)
  .option("--device <id>", "rtl_433 device selector")
  .option("--binary <path>", "rtl_433 binary path", "rtl_433")
  .action(async (options) => {
    const result = await analyzeSignal({
      frequency: options.frequency,
      durationSeconds: options.duration,
      device: options.device,
      binaryPath: options.binary
    });
    if (!result.recommendation.usable) {
      console.log(
        JSON.stringify(
          {
            status: "insufficient_data",
            reason: result.recommendation.reason
          },
          null,
          2
        )
      );
      return;
    }
    console.log(JSON.stringify(result.recommendation, null, 2));
  });

program
  .command("discover")
  .description("Run decoder-backed discovery and group likely switches")
  .requiredOption("--frequency <hz>", "RF frequency in Hz", Number)
  .requiredOption("--decoder <spec>", "rtl_433 flex decoder spec")
  .option("--duration <seconds>", "discovery duration", Number, 60)
  .option("--sample-rate <sps>", "sample rate", Number, 250000)
  .option("--device <id>", "rtl_433 device selector")
  .option("--binary <path>", "rtl_433 binary path", "rtl_433")
  .action(async (options) => {
    const result = await discoverSwitches({
      decoder: options.decoder,
      frequency: options.frequency,
      durationSeconds: options.duration,
      sampleRate: options.sampleRate,
      device: options.device,
      binaryPath: options.binary
    });
    console.log(JSON.stringify(result.summary, null, 2));
  });

program
  .command("discover-weather")
  .description("Discover weather RF sensors using built-in rtl_433 protocols")
  .option("--frequency <hz>", "RF frequency in Hz", Number, 433920000)
  .option("--duration <seconds>", "discovery duration", Number, 90)
  .option("--sample-rate <sps>", "sample rate", Number, 250000)
  .option(
    "--protocols <csv>",
    `protocol numbers (default Ambient preset: ${AMBIENT_WEATHER_PROTOCOLS.join(",")})`
  )
  .option("--device <id>", "rtl_433 device selector")
  .option("--binary <path>", "rtl_433 binary path", "rtl_433")
  .action(async (options) => {
    const protocols = options.protocols
      ? parseCsvNumbers(options.protocols)
      : [...AMBIENT_WEATHER_PROTOCOLS];
    const result = await discoverWeatherSensors({
      frequency: options.frequency,
      durationSeconds: options.duration,
      sampleRate: options.sampleRate,
      protocols,
      useAmbientPreset: !options.protocols,
      device: options.device,
      binaryPath: options.binary
    });
    console.log(JSON.stringify(result.summary, null, 2));
  });

program
  .command("adopt")
  .description("Adopt one discovered payload into named helper entity")
  .requiredOption("--payload <hex>", "payload data, e.g. e198")
  .requiredOption("--name <name>", "friendly switch name")
  .action(async (options) => {
    const adopted = await adoptSwitch({
      payload: options.payload,
      name: options.name
    });
    console.log(JSON.stringify(adopted, null, 2));
  });

program
  .command("adopt-weather")
  .description("Adopt one discovered weather sensor into Home Assistant entities")
  .requiredOption("--sensor-key <key>", "sensor key from discover-weather output")
  .option("--name <name>", "friendly sensor name")
  .option("--fields <csv>", "optional metric field names to include")
  .action(async (options) => {
    const adopted = await adoptWeatherSensor({
      sensorKey: options.sensorKey,
      name: options.name,
      fields: options.fields ? parseCsvStrings(options.fields) : []
    });
    console.log(JSON.stringify(adopted, null, 2));
  });

program
  .command("export-ha")
  .description("Generate Home Assistant template, helpers, and automation YAML")
  .requiredOption("--decoder <spec>", "rtl_433 flex decoder spec")
  .option("--frequency <hz>", "RF frequency in Hz", Number, 433920000)
  .option(
    "--mqtt-url <url>",
    "rtl_433 mqtt output URL",
    "mqtt://core-mosquitto:1883,user=iot,pass=REPLACE,retain=1"
  )
  .option("--mqtt-topic <topic>", "MQTT topic used by HA automation", "rtl_433/events")
  .action(async (options) => {
    const result = await exportHomeAssistantBundle({
      frequency: options.frequency,
      decoder: options.decoder,
      mqttUrl: options.mqttUrl,
      mqttEventTopic: options.mqttTopic
    });
    console.log(JSON.stringify(result, null, 2));
  });

program
  .command("export-ha-weather")
  .description("Generate weather-specific Home Assistant sensor YAML and rtl_433 template")
  .option("--frequency <hz>", "RF frequency in Hz", Number, 433920000)
  .option(
    "--mqtt-url <url>",
    "rtl_433 mqtt output URL",
    "mqtt://core-mosquitto:1883,user=iot,pass=REPLACE,retain=1"
  )
  .option("--mqtt-topic <topic>", "MQTT topic used by HA sensors", "rtl_433/events")
  .option(
    "--protocols <csv>",
    `protocol numbers (default Ambient preset: ${AMBIENT_WEATHER_PROTOCOLS.join(",")})`
  )
  .action(async (options) => {
    const protocols = options.protocols
      ? parseCsvNumbers(options.protocols)
      : [...AMBIENT_WEATHER_PROTOCOLS];
    const result = await exportHomeAssistantWeatherBundle({
      frequency: options.frequency,
      mqttUrl: options.mqttUrl,
      mqttEventTopic: options.mqttTopic,
      protocols
    });
    console.log(JSON.stringify(result, null, 2));
  });

program
  .command("state")
  .description("Print saved discovery/adoption state")
  .action(async () => {
    const state = await getPersistedState();
    console.log(JSON.stringify(state, null, 2));
  });

program.parseAsync(process.argv).catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
