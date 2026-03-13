# Kinetic Switch Adopter

Purpose-built local app for discovering unknown 433 MHz kinetic switches and adopting them into Home Assistant with repeatable, low-noise configuration.

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

## Core workflow

1. **Analyze signal** (`rtl_433 -R 0 -A`) to extract pulse/gap distributions and raw codes.
2. **Recommend decoder** with strict bounds (`bits>=`, `bits<=`, `unique`) to reduce RF junk.
3. **Discover switches** from decoder-backed JSON events, grouped by payload with confidence scoring.
4. **Adopt switches** by assigning names and generating a Home Assistant bundle:
   - `rtl_433.conf.template` snippet
   - `input_boolean` helpers
   - MQTT-trigger automations filtered by payload data

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

## Electron app

```bash
npm run start:electron
```

Use the UI tabs in order: Analyze -> Discover -> Adopt -> Export.

## New here with a Mac mini and 10 switches?

Read the snarky quickstart: `ONBOARDING_CHEATSHEET.md`.
