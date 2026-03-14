import {
  loadState,
  normalizeHexPayload,
  saveState
} from "./persistence.js";
import { parseAnalyzerOutput, recommendFlexDecoder } from "./decoder-advisor.js";
import { runRtl433 } from "./rtl433-process.js";

export const AMBIENT_WEATHER_PROTOCOLS = [20, 112, 113, 120, 190];

function parseJsonLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function parseTimestamp(value) {
  if (!value) {
    return Date.now();
  }
  const parsed = new Date(value).getTime();
  if (Number.isNaN(parsed)) {
    return Date.now();
  }
  return parsed;
}

class EventAggregator {
  constructor({ debounceMs = 350, minPresses = 2 } = {}) {
    this.debounceMs = debounceMs;
    this.minPresses = minPresses;
    this.records = new Map();
  }

  ingestEvent(event) {
    const payload = normalizeHexPayload(event?.data);
    if (!payload) {
      return;
    }

    const timestampMs = parseTimestamp(event.time);
    const existing =
      this.records.get(payload) ??
      {
        payload,
        firstSeen: new Date(timestampMs).toISOString(),
        lastSeen: new Date(timestampMs).toISOString(),
        rawCount: 0,
        pressCount: 0,
        avgRssi: null,
        avgSnr: null,
        bits: []
      };

    existing.rawCount += 1;
    const lastSeenMs = new Date(existing.lastSeen).getTime();
    if (timestampMs - lastSeenMs > this.debounceMs) {
      existing.pressCount += 1;
    } else if (existing.pressCount === 0) {
      existing.pressCount = 1;
    }
    existing.lastSeen = new Date(timestampMs).toISOString();

    if (Number.isFinite(event.rssi)) {
      existing.avgRssi =
        existing.avgRssi === null
          ? event.rssi
          : Number(((existing.avgRssi + event.rssi) / 2).toFixed(2));
    }
    if (Number.isFinite(event.snr)) {
      existing.avgSnr =
        existing.avgSnr === null
          ? event.snr
          : Number(((existing.avgSnr + event.snr) / 2).toFixed(2));
    }

    if (Number.isFinite(event.bits) && !existing.bits.includes(event.bits)) {
      existing.bits.push(event.bits);
      existing.bits.sort((a, b) => a - b);
    }

    this.records.set(payload, existing);
  }

  summarize() {
    const switches = Array.from(this.records.values()).map((record) => {
      const confidence =
        record.pressCount >= this.minPresses
          ? "high"
          : record.rawCount >= this.minPresses
            ? "medium"
            : "low";
      return {
        ...record,
        confidence
      };
    });

    switches.sort((a, b) => b.pressCount - a.pressCount || b.rawCount - a.rawCount);
    return {
      totalCandidates: switches.length,
      likelySwitches: switches.filter((item) => item.confidence !== "low").length,
      switches
    };
  }
}

const WEATHER_META_FIELDS = new Set([
  "time",
  "model",
  "id",
  "channel",
  "subtype",
  "protocol",
  "mod",
  "freq",
  "mic",
  "rssi",
  "snr",
  "noise",
  "raw_msg",
  "msg",
  "data",
  "code"
]);

function extractWeatherIdentity(event) {
  const model = String(event.model ?? "UnknownModel");
  const id = event.id ?? event.device ?? event.sid ?? "unknown";
  const channel = event.channel ?? event.ch ?? "na";
  const sensorKey = `${model}::${id}::${channel}`;
  return {
    sensorKey,
    model,
    id: String(id),
    channel: String(channel)
  };
}

function pickWeatherMetrics(event) {
  const metrics = {};
  for (const [key, value] of Object.entries(event)) {
    if (WEATHER_META_FIELDS.has(key)) {
      continue;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      metrics[key] = value;
      continue;
    }
    if (typeof value === "string" && value.length <= 48) {
      metrics[key] = value;
    }
  }
  return metrics;
}

class WeatherEventAggregator {
  constructor({ minFrames = 2 } = {}) {
    this.minFrames = minFrames;
    this.records = new Map();
  }

  ingestEvent(event) {
    if (!event?.model) {
      return;
    }
    const identity = extractWeatherIdentity(event);
    const metrics = pickWeatherMetrics(event);
    const timestampMs = parseTimestamp(event.time);
    const existing =
      this.records.get(identity.sensorKey) ??
      {
        sensorKey: identity.sensorKey,
        model: identity.model,
        id: identity.id,
        channel: identity.channel,
        firstSeen: new Date(timestampMs).toISOString(),
        lastSeen: new Date(timestampMs).toISOString(),
        rawCount: 0,
        avgRssi: null,
        avgSnr: null,
        lastMetrics: {},
        metricFields: []
      };

    existing.rawCount += 1;
    existing.lastSeen = new Date(timestampMs).toISOString();
    existing.lastMetrics = {
      ...existing.lastMetrics,
      ...metrics
    };
    existing.metricFields = Object.keys(existing.lastMetrics).sort((a, b) =>
      a.localeCompare(b)
    );

    if (Number.isFinite(event.rssi)) {
      existing.avgRssi =
        existing.avgRssi === null
          ? event.rssi
          : Number(((existing.avgRssi + event.rssi) / 2).toFixed(2));
    }
    if (Number.isFinite(event.snr)) {
      existing.avgSnr =
        existing.avgSnr === null
          ? event.snr
          : Number(((existing.avgSnr + event.snr) / 2).toFixed(2));
    }

    this.records.set(identity.sensorKey, existing);
  }

  summarize() {
    const sensors = Array.from(this.records.values()).map((record) => {
      const confidence =
        record.rawCount >= this.minFrames + 1
          ? "high"
          : record.rawCount >= this.minFrames
            ? "medium"
            : "low";
      return {
        ...record,
        confidence
      };
    });

    sensors.sort((a, b) => b.rawCount - a.rawCount);
    return {
      totalCandidates: sensors.length,
      likelySensors: sensors.filter((item) => item.confidence !== "low").length,
      sensors
    };
  }
}

export async function analyzeSignal({
  frequency = 433_920_000,
  durationSeconds = 30,
  device,
  binaryPath
}) {
  const args = ["-f", String(frequency), "-R", "0", "-A", "-T", String(durationSeconds)];
  if (device) {
    args.unshift(device);
    args.unshift("-d");
  }

  const run = await runRtl433({
    binaryPath,
    args,
    timeoutMs: Math.max(15_000, durationSeconds * 2_000)
  });

  const combinedLines = [...run.stdoutLines, ...run.stderrLines];
  const parsed = parseAnalyzerOutput(combinedLines);
  const recommendation = recommendFlexDecoder(parsed);

  const state = await loadState();
  state.sessions.push({
    kind: "analysis",
    createdAt: new Date().toISOString(),
    frequency,
    durationSeconds,
    recommendation
  });
  await saveState(state);

  return {
    exitCode: run.code,
    parsed,
    recommendation
  };
}

export async function discoverSwitches({
  decoder,
  frequency = 433_920_000,
  durationSeconds = 60,
  sampleRate = 250_000,
  device,
  binaryPath
}) {
  const args = [
    "-f",
    String(frequency),
    "-s",
    String(sampleRate),
    "-R",
    "0",
    "-F",
    "json",
    "-M",
    "time:iso:utc",
    "-M",
    "level",
    "-T",
    String(durationSeconds)
  ];
  if (decoder) {
    args.push("-X", decoder);
  }
  if (device) {
    args.unshift(device);
    args.unshift("-d");
  }

  const aggregator = new EventAggregator();

  const run = await runRtl433({
    binaryPath,
    args,
    timeoutMs: Math.max(20_000, durationSeconds * 2_000),
    onStdoutLine: (line) => {
      const parsed = parseJsonLine(line);
      if (!parsed) {
        return;
      }
      aggregator.ingestEvent({
        data: parsed.data ?? parsed.code ?? "",
        time: parsed.time,
        rssi: typeof parsed.rssi === "number" ? parsed.rssi : Number.NaN,
        snr: typeof parsed.snr === "number" ? parsed.snr : Number.NaN,
        bits: typeof parsed.bits === "number" ? parsed.bits : Number.NaN
      });
    }
  });

  const summary = aggregator.summarize();
  const state = await loadState();

  for (const sw of summary.switches) {
    state.discovered[sw.payload] = {
      ...(state.discovered[sw.payload] ?? {}),
      ...sw,
      updatedAt: new Date().toISOString()
    };
  }

  state.sessions.push({
    kind: "discovery",
    createdAt: new Date().toISOString(),
    frequency,
    durationSeconds,
    decoder,
    summary
  });
  await saveState(state);

  return {
    exitCode: run.code,
    summary
  };
}

function appendProtocolArgs(args, protocols) {
  for (const protocol of protocols) {
    args.push("-R", String(protocol));
  }
}

export async function discoverWeatherSensors({
  frequency = 433_920_000,
  durationSeconds = 90,
  sampleRate = 250_000,
  protocols = [],
  useAmbientPreset = false,
  device,
  binaryPath
}) {
  const args = [
    "-f",
    String(frequency),
    "-s",
    String(sampleRate),
    "-F",
    "json",
    "-M",
    "time:iso:utc",
    "-M",
    "level",
    "-T",
    String(durationSeconds)
  ];

  const resolvedProtocols = useAmbientPreset
    ? [...AMBIENT_WEATHER_PROTOCOLS]
    : protocols.filter((value) => Number.isFinite(value)).map((value) => Number(value));

  if (resolvedProtocols.length) {
    appendProtocolArgs(args, resolvedProtocols);
  }
  if (device) {
    args.unshift(device);
    args.unshift("-d");
  }

  const aggregator = new WeatherEventAggregator();
  const run = await runRtl433({
    binaryPath,
    args,
    timeoutMs: Math.max(25_000, durationSeconds * 2_000),
    onStdoutLine: (line) => {
      const parsed = parseJsonLine(line);
      if (!parsed) {
        return;
      }
      aggregator.ingestEvent({
        ...parsed,
        rssi: typeof parsed.rssi === "number" ? parsed.rssi : Number.NaN,
        snr: typeof parsed.snr === "number" ? parsed.snr : Number.NaN
      });
    }
  });

  const summary = aggregator.summarize();
  const state = await loadState();
  for (const sensor of summary.sensors) {
    state.discoveredWeather[sensor.sensorKey] = {
      ...(state.discoveredWeather[sensor.sensorKey] ?? {}),
      ...sensor,
      updatedAt: new Date().toISOString()
    };
  }

  state.sessions.push({
    kind: "weather-discovery",
    createdAt: new Date().toISOString(),
    frequency,
    durationSeconds,
    sampleRate,
    protocols: resolvedProtocols,
    summary
  });
  await saveState(state);

  return {
    exitCode: run.code,
    summary
  };
}

export async function getPersistedState() {
  return loadState();
}
