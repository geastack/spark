# Spark

A personal AI agent for the Waveshare ESP32-S3 Touch AMOLED 2.06, built with Gea
and OpenAI's `gpt-live-1` through the Live API. Each persona combines
spoken conversation with its own animated display.

![Gea Spark](docs/assets/gea-spark.gif)

Swipe between KITT, Nova, Echo, and Flora. Tap **Start** to talk and **Stop** to
end the conversation.

## Personalities

| Persona | Personality                                                                       | Display                                   |
| ------- | --------------------------------------------------------------------------------- | ----------------------------------------- |
| KITT    | The protective, dry-witted Knight Industries Two Thousand, with British delivery. | Red scanner and three-column voice lamps. |
| Nova    | A curious astronomer aboard an orbital observatory.                               | Stars and planetary orbits.               |
| Echo    | A steady, practical deep-sea navigator.                                           | Sonar sweep and a speech waveform.        |
| Flora   | A warm mindfulness companion.                                                     | Growing leaves and an animated flower.    |

Use the personas for questions, ideas, everyday conversation, or a quiet moment
with Flora. Each has its own instructions, voice, and greeting.

## Hardware

Waveshare ESP32-S3 Touch AMOLED 2.06: a 410 × 502 touchscreen with onboard
microphones and speaker hardware. Conversations use the board's Wi-Fi connection
to OpenAI; no laptop bridge is required.

## Setup

Requires Git, Node.js 22.18+ or 24+, Python 3, CMake and Ninja, a USB data
cable, and 2.4 GHz Wi-Fi.

```sh
npm ci
cp .env.example .env
npx gea setup
```

`gea setup` installs ESP-IDF 6.0.2, the release the board builds with, and
registers the board. Choose **Known supported board**, select **Waveshare
ESP32-S3 Touch AMOLED 2.06**, select its USB connection, and keep the
suggested alias `amoled`. Leave `IDF_PATH` unset in the terminal you build
from.

To check the board registration, run `npx gea boards list`.

Fill in `.env`:

```dotenv
OPENAI_API_KEY=
GEA_WIFI_SSID=
GEA_WIFI_PASSWORD=
AGENT_CHARACTER=kitt
```

`AGENT_CHARACTER` selects the initial character: `kitt`, `nova`, `echo`, or
`flora`. It defaults to `kitt`.

Credentials are embedded in the firmware. Keep `.env` and built firmware private.

## Build and flash

```sh
npx gea doctor
npm run build
npm run flash
npx gea monitor --board amoled
```

## Development

```sh
npm run check
npm test
npm run format
```

Shared model and conversation settings are in `src/config/session.ts`.
Spark connects directly to `wss://api.openai.com/v1/live/sessions`, starts
`gpt-live-1` with `session.start`, and keeps microphone audio flowing while the
model speaks. Persona voices and greetings remain configured per character.

`test/flora-device.tsx` uses `gpt-realtime-2.1` and the Realtime protocol. It
does not supply the model configuration for the app.

## Add a persona

Each persona is a folder under `src/components/characters/`, named by its ID
(lowercase letters and digits, starting with a letter), next to `kitt/`,
`nova/`, `echo/` and `flora/`. Follow an existing one:

- `character.ts`: a default export with the `id` (the folder name), `name`,
  `voice`, `instructions` and `opening` greeting (`satisfies Character`)
- `View.tsx`: the persona's display, as the default export
- `styles.css`: its styles
- `animation.ts` (optional): `prime()` and `paint()` for a Canvas animation

Run `npm run characters` to register it: `scripts/register-characters.ts`
scans that directory and regenerates `registry.ts`, `CharacterView.tsx` and
`paint.ts` in it. Build and development commands also run registration automatically.
Set `AGENT_CHARACTER` to its ID to select it at boot, then rebuild and flash.

## License

Copyright 2026 Geastack contributors. Licensed under the
[GNU General Public License version 3](LICENSE) (`GPL-3.0-only`).

Redistributed firmware must comply with GPLv3, including providing the corresponding
source and required notices. Dependencies retain their own licenses.

Sora uses the [SIL Open Font License](src/assets/fonts/OFL.txt).
