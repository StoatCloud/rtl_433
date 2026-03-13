# Kinetic Switch Onboarding Cheatsheet (Mac mini + 10 switches)

You bought the dongle. You plugged it in. You deserve a system that works on purpose, not by accident.

This is the fast path.

## 0) What you need (yes, actually)

- A Mac mini
- RTL-SDR USB dongle (the usual suspects like NooElec NESDR are fine)
- 10 kinetic switches
- Home Assistant + MQTT broker already alive

## 1) Install the boring stuff

```bash
brew install rtl_433
cd apps/kinetic-switch-adopter
npm install
```

## 2) Confirm your dongle exists in this reality

```bash
rtl_433 -d help
```

If your dongle is not listed, congrats: hardware/USB permissions are your first side quest.

## 3) Launch the app

```bash
npm run start:electron
```

In the UI, keep defaults unless you have a reason not to.

## 4) Analyze once, not forever

1. Go to **Analyze**.
2. Frequency: `433920000`.
3. Click **Run Analysis** while pressing one switch a few times.
4. Let the app auto-fill the decoder fields.

If it finds no useful pulses, your frequency is wrong or your switch is ignoring you.

## 5) Discover all 10 switches without losing your mind

1. Go to **Discover**.
2. Click **Run Discovery**.
3. Press each physical switch **3 times**, one switch at a time.
4. Wait for the table to populate payloads.

Pro tip: put sticky notes on switches now. Future-you is lazy and forgetful.

## 6) Adopt each payload (10 times, yes)

For each discovered payload:

1. Enter payload (example: `e198`)
2. Enter sane name (`kitchen_main`, `hall_scene`, etc.)
3. Click **Adopt Payload**

Repeat until all 10 are adopted.

## 7) Export your Home Assistant bundle

In **Export Home Assistant bundle**, click **Export Bundle**.

You get:

- `ha_helpers_input_boolean.yaml`
- `ha_automation_kinetic_switches.yaml`
- `rtl_433.conf.template.generated`

## 8) Put files where HA expects them

- Copy generated `rtl_433.conf.template.generated` into your HA `rtl_433.conf.template` workflow.
- Merge helpers/automations YAML into your HA config (or include files cleanly like an adult).
- Restart/reload HA + rtl_433 add-on.

## 9) Smoke test (the moment of truth)

- Press each switch once.
- Confirm matching helper toggles in HA.
- Build real automations after this works.

If random junk triggers automations, your decoder filter is too loose. Tighten bits bounds, keep `unique`, stop pretending RF is clean.

---

## CLI speedrun (for terminal people)

```bash
cd apps/kinetic-switch-adopter

# Analyze
npm run start:cli -- analyze --frequency 433920000 --duration 30

# Discover
npm run start:cli -- discover --frequency 433920000 --duration 60 --decoder "n=KineticSwitch,m=OOK_PWM,s=52,l=188,g=1000,r=5000,bits>=14,bits<=24,unique"

# Adopt one payload
npm run start:cli -- adopt --payload e198 --name kitchen_main

# Export HA files
npm run start:cli -- export-ha --frequency 433920000 --decoder "n=KineticSwitch,m=OOK_PWM,s=52,l=188,g=1000,r=5000,bits>=14,bits<=24,unique"
```

## Micro-troubleshooting

- **No packets at all:** wrong frequency, weak signal, bad dongle path, or cosmic punishment.
- **Too many ghost events:** tighten decoder (`bits>=`, `bits<=`, `unique`), reduce RF noise.
- **App can’t call rtl_433:** set the binary path explicitly (`/opt/homebrew/bin/rtl_433` on Apple Silicon).
- **HA sees nothing:** MQTT topic mismatch or broker auth typo. Yes, check the password again.
