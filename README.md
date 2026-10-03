# Spark

A personal AI agent for the Waveshare ESP32-S3 Touch AMOLED 2.06, built with Gea
and OpenAI's `gpt-realtime-2.1` through the Realtime API. Each persona combines
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

Requires Node.js 22.18+ or 24+, Python 3, a USB data cable, and 2.4 GHz Wi-Fi.

```sh
npm ci
cp .env.example .env
npx gea setup
```

In the setup wizard, select `esp32-s3-touch-amoled-2.06`, name it `amoled`, and
choose its USB connection. The wizard checks or installs ESP-IDF.

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

## Add a persona

Follow an existing character: define its ID, name, voice, instructions, and
greeting in `character.ts`, then create its `View.tsx` and `styles.css`. Add
`animation.ts` if it needs a Canvas animation.

Place it alongside the existing characters and run `npm run characters` to
register it. Build and development commands also run registration automatically.
Set `AGENT_CHARACTER` to its ID to select it at boot, then rebuild and flash.

## License

Copyright 2026 Geastack contributors. Licensed under the
[GNU General Public License version 3](LICENSE) (`GPL-3.0-only`).

Redistributed firmware must comply with GPLv3, including providing the corresponding
source and required notices. Dependencies retain their own licenses.

Sora uses the [SIL Open Font License](src/assets/fonts/OFL.txt).
