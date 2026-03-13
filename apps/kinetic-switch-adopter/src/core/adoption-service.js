import fs from "node:fs/promises";
import path from "node:path";
import {
  AMBIENT_WEATHER_PROTOCOLS
} from "./discovery-service.js";
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

function renderWeatherRtl433Template({ frequency, mqttUrl, protocols }) {
  const lines = [
    "# --- Purpose-built weather sensor template ---",
    `frequency ${frequency}`,
    "sample_rate 250k"
  ];
  for (const protocol of protocols) {
    lines.push(`protocol ${protocol}`);
  }
  lines.push("output json");
  lines.push(`output ${mqttUrl}`);
  lines.push("report_meta time:utc");
  return lines.join("\n");
}

function yamlEscapeSingleQuotes(value) {
  return String(value).replaceAll("'", "''");
}

function hasMqttSensorHeader(lines) {
  return lines.length > 2;
}

const UNIT_BY_FIELD = {
  temperature_C: "°C",
  temperature_F: "°F",
  humidity: "%",
  pressure_hPa: "hPa",
  rain_mm: "mm",
  rain_in: "in",
  wind_avg_m_s: "m/s",
  wind_max_m_s: "m/s",
  wind_speed_m_s: "m/s",
  wind_speed_km_h: "km/h",
  wind_speed_mph: "mph",
  uv: "UV",
  lux: "lx"
};

const DEVICE_CLASS_BY_FIELD = {
  temperature_C: "temperature",
  temperature_F: "temperature",
  humidity: "humidity",
  pressure_hPa: "atmospheric_pressure",
  rain_mm: "precipitation",
  rain_in: "precipitation",
  battery_ok: "battery"
};

function renderWeatherSensorYaml(adoptedEntries, mqttTopic) {
  const lines = ["mqtt:", "  sensor:"];
  for (const entry of adoptedEntries) {
    for (const field of entry.fields) {
      const metricSlug = slugify(field);
      const uniqueId = `weather_${entry.entitySlug}_${metricSlug}`;
      const fieldName = field.replaceAll("_", " ");
      const valueTemplate =
        `{{ value_json.${field} if value_json.model == '${yamlEscapeSingleQuotes(entry.model)}' ` +
        `and value_json.id|string == '${yamlEscapeSingleQuotes(entry.id)}' ` +
        `and value_json.channel|string == '${yamlEscapeSingleQuotes(entry.channel)}' else none }}`;

      lines.push(`    - name: ${entry.name} ${fieldName}`);
      lines.push(`      unique_id: ${uniqueId}`);
      lines.push(`      state_topic: ${mqttTopic}`);
      lines.push(`      value_template: "${valueTemplate}"`);
      if (UNIT_BY_FIELD[field]) {
        lines.push(`      unit_of_measurement: "${UNIT_BY_FIELD[field]}"`);
      }
      if (DEVICE_CLASS_BY_FIELD[field]) {
        lines.push(`      device_class: ${DEVICE_CLASS_BY_FIELD[field]}`);
      }
      lines.push("      state_class: measurement");
      lines.push("      qos: 0");
      lines.push("      expire_after: 5400");
    }
  }

  if (!hasMqttSensorHeader(lines)) {
    return "mqtt:\n  sensor: []\n";
  }
  return `${lines.join("\n")}\n`;
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

export async function adoptWeatherSensor({ sensorKey, name, fields = [] }) {
  if (!sensorKey || !sensorKey.trim()) {
    throw new Error("Sensor key is required.");
  }

  const state = await loadState();
  const discoveredSensor = state.discoveredWeather[sensorKey];
  if (!discoveredSensor) {
    throw new Error(`Unknown weather sensor key: ${sensorKey}`);
  }

  const fallbackName = `${discoveredSensor.model}_${discoveredSensor.id}_${discoveredSensor.channel}`;
  const resolvedName = (name && name.trim()) || fallbackName;
  const entitySlug = slugify(resolvedName);
  const selectedFields =
    fields.length > 0
      ? fields
      : discoveredSensor.metricFields.filter((field) => field !== "battery_ok");

  if (!selectedFields.length) {
    throw new Error("No weather fields available to adopt for this sensor.");
  }

  state.adoptedWeather[sensorKey] = {
    sensorKey,
    model: discoveredSensor.model,
    id: discoveredSensor.id,
    channel: discoveredSensor.channel,
    name: resolvedName,
    entitySlug,
    fields: [...new Set(selectedFields)].sort((a, b) => a.localeCompare(b)),
    adoptedAt: new Date().toISOString()
  };

  await saveState(state);
  return state.adoptedWeather[sensorKey];
}

export async function exportHomeAssistantWeatherBundle({
  frequency = 433_920_000,
  mqttUrl = "mqtt://core-mosquitto:1883,user=iot,pass=REPLACE,retain=1",
  mqttEventTopic = "rtl_433/events",
  protocols = [...AMBIENT_WEATHER_PROTOCOLS]
}) {
  const state = await loadState();
  const adoptedWeatherEntries = Object.values(state.adoptedWeather);
  if (!adoptedWeatherEntries.length) {
    throw new Error("No adopted weather sensors found. Adopt at least one weather sensor first.");
  }

  const appHome = getAppHomeDir();
  await fs.mkdir(appHome, { recursive: true });

  const weatherSensorsYaml = renderWeatherSensorYaml(adoptedWeatherEntries, mqttEventTopic);
  const weatherTemplate = renderWeatherRtl433Template({
    frequency,
    mqttUrl,
    protocols
  });

  const weatherSensorsPath = path.join(appHome, "ha_weather_mqtt_sensors.yaml");
  const weatherTemplatePath = path.join(
    appHome,
    "rtl_433.weather.conf.template.generated"
  );

  await fs.writeFile(weatherSensorsPath, weatherSensorsYaml, "utf8");
  await fs.writeFile(weatherTemplatePath, weatherTemplate, "utf8");

  return {
    weatherSensorsPath,
    weatherTemplatePath,
    adoptedCount: adoptedWeatherEntries.length,
    protocolCount: protocols.length
  };
}
