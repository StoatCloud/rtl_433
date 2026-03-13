#!/usr/bin/env node
import { Command } from "commander";
import {
  analyzeSignal,
  discoverSwitches,
  getPersistedState
} from "./core/discovery-service.js";
import {
  adoptSwitch,
  exportHomeAssistantBundle
} from "./core/adoption-service.js";

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
