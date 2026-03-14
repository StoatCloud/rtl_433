# Kinetic Switch Adopter

Purpose-built local app for discovering unknown 433 MHz kinetic switches and onboarding common weather RF sensors into Home Assistant with repeatable, low-noise configuration.

## Why this exists

This app is focused on the exact pain points from ad-hoc `rtl_433` setup:

- brittle trial-and-error decoder tuning
- noisy, unfiltered RF data
- one-off scripts that do not preserve state
- no guided handoff into Home Assistant

It provides one shared workflow engine with two interfaces:

- macOS-first local Electron desktop UI
- Linux headless CLI (same core logic)

Windows is supported by the same Node/Electron stack, prioritized after macOS and Linux.

## Core workflow (Kinetic Switch mode)

1. **Analyze signal** (`rtl_433 -R 0 -A`) to extract pulse/gap distributions and raw codes.
2. **Recommend decoder** with strict bounds (`bits>=`, `bits<=`, `unique`) to reduce RF junk.
3. **Discover switches** from decoder-backed JSON events, grouped by payload with confidence scoring.
4. **Adopt switches** by assigning names and generating a Home Assistant bundle:
   - `rtl_433.conf.template` snippet
   - `input_boolean` helpers
   - MQTT-trigger automations filtered by payload data

## Core workflow (Weather mode)

1. **Discover weather sensors** with built-in protocol presets for Ambient Weather-class devices.
2. **Adopt sensors** by stable identity (`model::id::channel`), select metric fields.
3. **Export weather bundle**:
   - `ha_weather_mqtt_sensors.yaml` for Home Assistant MQTT sensors
   - `rtl_433.weather.conf.template.generated`

All sessions and discovered/adopted devices are stored atomically at:

- `~/.kinetic-switch-adopter/state.json` (override via `KINETIC_SWITCH_HOME`)

## Requirements

- `rtl_433` on PATH (or pass explicit binary path)
- RTL-SDR dongle attached locally
- Node.js 20+

## Install

```bash
cd apps/kinetic-switch-adopter
npm install
```

## CLI usage

### 1) Analyze

```bash
npm run start:cli -- analyze --frequency 433920000 --duration 30
```

### 2) Discover with recommended decoder

```bash
npm run start:cli -- discover --frequency 433920000 --duration 60 --decoder "n=KineticSwitch,m=OOK_PWM,s=52,l=188,g=1000,r=5000,bits>=14,bits<=24,unique"
```

### 3) Adopt a payload

```bash
npm run start:cli -- adopt --payload e198 --name kitchen_toggle
```

### 4) Export HA bundle

```bash
npm run start:cli -- export-ha --frequency 433920000 --mqtt-url "mqtt://core-mosquitto:1883,user=iot,pass=REPLACE,retain=1"
```

### 5) Discover Ambient Weather-class sensors

```bash
npm run start:cli -- discover-weather --frequency 433920000 --duration 90
```

### 6) Adopt weather sensor

```bash
npm run start:cli -- adopt-weather --sensor-key "AmbientWeather-WH31E::88::1" --name backyard_weather --fields temperature_C,humidity,pressure_hPa
```

### 7) Export weather HA bundle

```bash
npm run start:cli -- export-ha-weather --frequency 433920000
```

## Electron app

```bash
npm run start:electron
```

Use the UI in order for switch mode: Analyze -> Discover -> Adopt -> Export.  
Use Weather Mode sections for sensor onboarding.

## New here with a Mac mini and 10 switches?

Read the snarky quickstart: `ONBOARDING_CHEATSHEET.md`.
