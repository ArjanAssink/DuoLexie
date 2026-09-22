# Piper, locally

The TTS backend the word and spelling clips are generated with
(`tools/generate-word-audio.mjs`). Free, offline, and — with the noise terms zeroed, which
the generator does by default — reproducible: the same text gives a byte-identical clip on
every run, so a clip you approved is the clip you get next time.

Everything this sets up is local and ignored by git: a virtualenv, a 63MB voice model, and
the clips themselves. Nothing here is committed.

## Setup

```sh
python3 -m venv tools/piper/.venv
tools/piper/.venv/bin/pip install piper-tts

mkdir -p tools/piper/models
tools/piper/.venv/bin/python -m piper.download_voices \
  --download-dir tools/piper/models nl_NL-ronnie-medium
```

`ffmpeg` and `ffprobe` have to be on PATH too — the generator normalises every clip to the
same spec as the recorded ones (mono, -16 LUFS, 64kbps mp3) and measures its length.

## Generating

```sh
# the words Hardop lezen reads — only the ones that have no clip yet
node tools/generate-word-audio.mjs --backend piper --missing \
  --piper-bin tools/piper/.venv/bin/piper \
  --piper-model tools/piper/models/nl_NL-ronnie-medium.onnx

# the longer forms Maak het woord af speaks ("hond… honden")
node tools/generate-word-audio.mjs --set spelling --backend piper \
  --piper-bin tools/piper/.venv/bin/piper \
  --piper-model tools/piper/models/nl_NL-ronnie-medium.onnx \
  --report
```

The two pair *rules* are skipped unless you pass `--rules`; see the note above
`spellingItems` in the generator for why.

## The voice

`nl_NL-ronnie-medium`, chosen by ear over Pim and Alex across all 257 words and 45 klanken.
Pim lost on `tas`. Alex clips `kat`, `pot` and `kok` down to 0.19s — first-lesson words —
where Ronnie clips none, and Ronnie's klanken land at a median 0.39s, closest to the real
recordings' ~0.35s.

Other Dutch voices, if this ever needs revisiting: `nl_NL-pim-medium` (male),
`nl_NL-mls-medium` with a speaker id for a female voice (33 of its 52 speakers measure in
the female range), and `nl_BE-nathalie-medium`, which is **Flemish** — different vowels are
precisely what she is learning, so it is the one to avoid.

## What this voice is *not* for

The 45 klanken in `app/public/audio/sounds/` are a real person reading them, and they stay
that way. Synthesising an isolated `/b/` from text does not work at all (espeak reads a bare
letter as its name), and even done properly from phonemes, RID teaches those sounds a
particular way — a synthetic one need not match what she hears in treatment. The win from
TTS is whole words, which is what this generates.
