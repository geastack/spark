# Silent Flora reproduction

Spark now uses `gpt-live-1` through the Live API. The original renderer reproduction
remains pinned to `gpt-realtime-2.1` through the Realtime API, with its own explicit
session configuration, so changes to the production model do not change that workload.

`flora-device.tsx` starts a real Realtime speech response with the speaker amplifier
muted and microphone capture disabled. It uses the normal speech decoder and PCM
playback, holds Flora's leaves fully grown, and stops the diagnostic worker after
two minutes. It requires the same API key and Wi-Fi configuration as Spark.

Temporarily set `gea.entry` in `package.json` to `test/flora-device.tsx`, build and
flash with `gea flash --board amoled --app spark`. Restore `gea.entry` to `src/main.tsx` afterward,
then build and flash again to restore the normal app. The diagnostic intentionally
does not run through the app's Start/Stop button.

The October 3 reproduction exposed `[render-worker] WAIT TIMEOUT` in the ESP32
targets renderer: the 100 ms join deadline returned while the lower-band worker
still borrowed its caller's stack. The corrected join preserves that ownership
until completion. In the fixed muted speech run, four jobs passed 100 ms, the
captured stems remained intact, and the physical display was confirmed clean.

The worker-join regression lives in the targets repository at
`targets/esp32/test/render-worker-join.test.cpp`. Compile it as C++20 with thread
support and run it; it holds a real worker past the former deadline and verifies
that the caller remains joined to it until its borrowed frame data is complete.

## Microphone pickup and clipping

The later October 3 investigation found that capture and upload continued while
Flora ignored speech. A simultaneous measurement of both physical microphones
picked up the same spoken sentence: MIC1 reached 225 RMS / 1994 peak, and MIC2
243 RMS / 2059 peak. The speaker reference was quiet, and AEC preserved MIC1's
speech at 222 RMS / 1980 peak. Neither microphone was dead in that test.

The original driver captures MIC1 and the analog speaker loopback on ES7210 MIC3.
Its TDM order is MIC1, MIC3, MIC2, MIC4. AEC is configured for one voice microphone
and one playback reference; the second physical microphone is not the reference.
Using both voice microphones requires a separate multi-microphone processing
change, rather than substituting MIC2 for the playback reference.

The board's post-AEC gain is 53.3408610. Spark previously multiplied it by
3.981071706, giving approximately 212.35 total gain. Uploaded speech reached the
PCM16 limit, with one measured interval containing 12.2% clipped samples.
Spark now uses a scale of 0.25, giving approximately 13.34 total gain; the measured
1980 peak would become approximately 26404, below the PCM16 limit. This preserves
headroom for that utterance, but does not guarantee that louder speech cannot clip.

This gain change is under device validation. Reduced clipping alone has not yet
been confirmed to fix the missed-turn bug. The Flora-only server VAD configuration
(threshold 0.5, 300 ms prefix, 500 ms silence) also did not resolve the bug by
itself. Temporary instrumentation reports the accepted VAD configuration,
speech-start/stop events, and post-gain clipping; remove it after validation.

## Dual microphone trial

The current experimental targets adapter captures three TDM slots: MIC1, MIC3
(speaker loopback), and MIC2. Both physical microphones use 18 dB input gain.
It averages the synchronized microphones with a 32-bit sum, then passes that
combined signal and the speaker reference to one ESP-SR full-duplex AEC channel
before applying the 13.34 output gain. This uses both microphones; it does not implement
beamforming or Espressif AFE's automatic channel selection.

Spark uses four DMA descriptors for this trial. The earlier three-slot capture
with six descriptors could not allocate the speaker's DMA buffers. Device checks
must include successful speaker and network startup, processing below the 32 ms
AEC frame deadline, no DMA drops, clipping, and repeated spoken turns.

The first dual-AEC run initialized both microphone channels and processed frames
in approximately 23 ms, but left only 12 KB of internal memory and failed the TLS
AES allocation. The revision moves the aligned processing buffers into PSRAM and
releases them when capture stops or AEC initialization fails. The ISR capture ring
remains in internal memory. The regression test checks allocation failure and
restart under AddressSanitizer and UndefinedBehaviorSanitizer.

The PSRAM revision connected and generated replies, but processing two separate
AEC channels took approximately 23–27 ms per 32 ms frame. Upload backlog then grew
to 7.6 seconds and the connection failed; the user confirmed struggled replies.
The current revision therefore averages both synchronized physical microphones
before one AEC channel, retaining the combined echo reference path and the original
single-channel processing cost. This remains an experiment; it does not establish
that averaging improves recognition at every position. `raw_rms` now measures the
combined microphone signal, while `mic2_rms` reports the second physical microphone.

The first combined-mic run connected successfully. Observed AEC processing was
approximately 12–15 ms per 32 ms frame, upload backlog generally 0–64 ms, with no
DMA drops or capture drops; the rounded clipping percentage was 0.0. Exact
clipping was not available in that build (see the correction below). Several speech-start/stop pairs
produced replies, and speech-start during playback stopped that reply and led to
a subsequent response. These are device observations, not yet a long-duration
reliability result or a user confirmation that every attempted sentence was heard.

The user subsequently confirmed that the combined-mic version worked well after
several exchanges and interruption. The monitored call remained connected until
Stop at approximately 151 seconds, without the upload backlog of the dual-AEC
trial. Both Spark and Amuse now explicitly opt into this path with
`GEA_AUDIO_AEC_MICROPHONES=2`; the shared driver's default remains one physical
microphone for existing apps. Amuse's opt-in, four DMA descriptors, and 0.25 gain
scale are specific to the 2.06 board; its 1.8 configuration stays separate.

## Adaptive gain and exact clipping counts

The earlier `output_clipped_pct=0.0` readings used one decimal place; they did
not prove zero clipped samples. A later review found a post-AEC transient peak
of 4956 during playback, which exceeds PCM16 after multiplying by 13.34. The
loudest measured speech peak with a quiet speaker reference was 2128, leaving
only approximately 1.25 dB at that fixed gain. Raising fixed gain is therefore
not a robust way to boost quieter speech. Diagnostics now report an exact
`output_clipped` count and four decimal places for its percentage.

`GEA_AUDIO_AEC_AUTO_GAIN=1` opts into Espressif's digital AGC after AEC, with
12 dB compression gain, its limiter enabled, and a -6 dBFS target. Before PCM16
conversion, makeup gain is reduced if necessary to keep the entire AEC frame
within 28000 peak. The AGC processes 160-sample (10 ms) blocks; partial blocks
are retained across the 512-sample AEC frames without padding or sample loss.
A final uniform attenuation keeps each output block within 28000 peak,
approximately 1.37 dB below PCM16 full scale. Stop resets all retained state.

The regression checks quiet-speech boosting, positive/negative full-scale input,
the rare transient, ordered samples across frame boundaries, and failed AGC
allocation/processing. Runtime diagnostics report actual output RMS, peak,
clipping count, peak-protection activations, and full-scale samples inside the
AGC before final attenuation.

The first adaptive-gain device call ran for approximately 58 seconds and ended
through Stop. Across 57 logged intervals, output clipping and AGC full-scale
samples were both exactly zero; peak protection activated three times. The
highest output peak was 18489 (approximately 5 dB below full scale). Processing
took 12.8–16.8 ms per 32 ms frame, with zero DMA/capture drops. A temporary
960 ms upload backlog cleared, followed by mostly 0–40 ms pending audio. Seven
speech-start events were observed, including interruptions during playback.
User confirmation of quiet/normal/louder speech recognition is still pending;
the previously confirmed conversation used fixed gain.

The adapter changes live in the sibling `targets` repository under
`targets/esp32/chip_bindings/audio/{es8311.cpp,echo_cancellation.cpp,echo_cancellation.h}`
and are mirrored into Spark's installed targets package for this device build.
They are not yet in the released npm dependency. The adapter regression test is
`targets/esp32/test/test_echo_cancellation_adapter.py`; it covers both the original
single-mic path and three-slot capture, including channel ordering across frame
boundaries and averaging without overflow. Hardware speech recognition remains
under validation.
