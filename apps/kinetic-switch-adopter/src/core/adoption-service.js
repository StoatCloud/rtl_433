import fs from "node:fs/promises";
import path from "node:path";
import {
  getAppHomeDir,
  loadState,
  normalizeHexPayload,
  saveState
} from "./persistence.js";

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export async function adoptSwitch({ payload, name }) {
  const normalizedPayload = normalizeHexPayload(payload);
  if (!normalizedPayload) {
    throw new Error("Payload is required.");
  }
  if (!name || !name.trim()) {
    throw new Error("Name is required.");
  }

  const state = await loadState();
  const entitySlug = slugify(name);
  const helperId = `input_boolean.kinetic_${entitySlug}`;

  state.adopted[normalizedPayload] = {
    payload: normalizedPayload,
    name: name.trim(),
    entitySlug,
    helperId,
    adoptedAt: new Date().toISOString()
  };
  await saveState(state);

  return state.adopted[normalizedPayload];
}

function renderHelperYaml(adoptedEntries) {
  const lines = ["input_boolean:"];
  for (const entry of adoptedEntries) {
    lines.push(`  kinetic_${entry.entitySlug}:`);
    lines.push(`    name: Kinetic ${entry.name}`);
    lines.push("    icon: mdi:gesture-tap-button");
  }
  return `${lines.join("\n")}\n`;
}

function renderAutomationYaml(adoptedEntries, mqttTopic) {
  const lines = ["automation:"];
  for (const entry of adoptedEntries) {
    lines.push(`  - id: kinetic_switch_${entry.entitySlug}_toggle`);
    lines.push(`    alias: Kinetic ${entry.name} toggle helper`);
    lines.push("    trigger:");
    lines.push("      - platform: mqtt");
    lines.push(`        topic: ${mqttTopic}`);
    lines.push("    condition:");
    lines.push(
      `      - condition: template\n        value_template: \"{{ trigger.payload_json.data == '${entry.payload}' }}\"`
    );
    lines.push("    action:");
    lines.push("      - service: input_boolean.toggle");
    lines.push("        target:");
    lines.push(`          entity_id: ${entry.helperId}`);
    lines.push("    mode: queued");
  }
  return `${lines.join("\n")}\n`;
}

function renderRtl433Template({ frequency, decoder, mqttUrl }) {
  return [
    "# --- Purpose-built kinetic switch template ---",
    `frequency ${frequency}`,
    "sample_rate 250k",
    "protocol 0",
    `decoder ${decoder}`,
    "output json",
    `output ${mqttUrl}`,
    "report_meta time:utc"
  ].join("\n");
}

export async function exportHomeAssistantBundle({
  frequency = 433_920_000,
  decoder,
  mqttUrl = "mqtt://core-mosquitto:1883,user=iot,pass=REPLACE,retain=1",
  mqttEventTopic = "rtl_433/events"
}) {
  if (!decoder || !decoder.trim()) {
    throw new Error("Decoder is required to export Home Assistant bundle.");
  }

  const state = await loadState();
  const adoptedEntries = Object.values(state.adopted);
  if (!adoptedEntries.length) {
    throw new Error("No adopted switches found. Adopt at least one payload first.");
  }

  const appHome = getAppHomeDir();
  await fs.mkdir(appHome, { recursive: true });

  const helpersYaml = renderHelperYaml(adoptedEntries);
  const automationYaml = renderAutomationYaml(adoptedEntries, mqttEventTopic);
  const rtlTemplate = renderRtl433Template({ frequency, decoder, mqttUrl });

  const helpersPath = path.join(appHome, "ha_helpers_input_boolean.yaml");
  const automationPath = path.join(appHome, "ha_automation_kinetic_switches.yaml");
  const templatePath = path.join(appHome, "rtl_433.conf.template.generated");

  await fs.writeFile(helpersPath, helpersYaml, "utf8");
  await fs.writeFile(automationPath, automationYaml, "utf8");
  await fs.writeFile(templatePath, rtlTemplate, "utf8");

  return {
    helpersPath,
    automationPath,
    templatePath,
    adoptedCount: adoptedEntries.length
  };
}
