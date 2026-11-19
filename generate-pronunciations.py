import argparse
import io
import json
import piper
import shutil
import tempfile
from pathlib import Path
import wave

from lameenc import Encoder
from piper import PiperVoice, SynthesisConfig

parser = argparse.ArgumentParser(description="Generate the CET6 bundled English pronunciations.")
parser.add_argument("model", type=Path, help="Path to the Piper voice model (with its JSON config).")
parser.add_argument("accent", choices=["en-US", "en-GB"])
parser.add_argument("--examples", action="store_true", help="Generate the full example sentence for every term.")
parser.add_argument("--options", action="store_true", help="Generate audio for extra distractors.")
args = parser.parse_args()
if args.examples and args.options:
    parser.error("--examples and --options cannot be combined")
dist = Path(__file__).resolve().parent / "dist"
out = dist / ("example-audio" if args.examples else "pronunciation") / args.accent
out.mkdir(parents=True, exist_ok=True)
deck = {}
for name in ("base-words", "paper-words", "paper-extra-reading", "paper-extra-mixed", "paper-writing-translation"):
    for item in json.loads((dist / (name + ".json")).read_text(encoding="utf-8-sig")):
        deck.setdefault(item["word"].strip().lower(), item)

if args.options:
    deck = dict.fromkeys(json.loads((dist / "option-pronunciations.json").read_text(encoding="utf-8")))

# Context disambiguates heteronyms and the initialism. Only the declared
# target pronunciation is synthesized (not the whole example sentence).
pronunciation = {"conduct": "kəndˈʌkt", "content": ("kˈɑːntɛnt" if args.accent == "en-US" else "kˈɒntɛnt"), "ai": "A I"}
# The Windows phonemizer cannot always open dictionaries from a Unicode path.
data = Path(piper.__file__).parent / "espeak-ng-data"
if not str(data).isascii():
    temporary = tempfile.TemporaryDirectory(prefix="cet6-voice-")
    data = Path(shutil.copytree(data, Path(temporary.name) / "espeak-ng-data"))
voice = PiperVoice.load(args.model, espeak_data_dir=data)
config = SynthesisConfig(length_scale=1.12, noise_scale=0.40, noise_w_scale=0.4, volume=0.8)
for n, term in enumerate(sorted(deck), 1):
    if not term.isascii() or any(not (c.isalpha() or c in " '-") for c in term):
        raise ValueError(f"Unexpected training term: {term}")
    text = pronunciation.get(term, term).replace("-", " ")
    if term in {"conduct", "content"}:
        text = f"[[ {text} ]]"
    if args.examples:
        text = deck[term]["example"].strip()
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav:
        voice.synthesize_wav(text.rstrip(".!?") + ".", wav, syn_config=config)
    buffer.seek(0)
    with wave.open(buffer, "rb") as wav:
        encoder = Encoder()
        encoder.set_channels(wav.getnchannels())
        encoder.set_in_sample_rate(wav.getframerate())
        encoder.set_bit_rate(48)
        encoder.set_quality(2)
        frames = wav.getnframes()
        if frames < wav.getframerate() / 5:
            raise ValueError(f"Audio too short: {term}")
        silence = bytes(round(wav.getframerate() * 0.17) * wav.getsampwidth() * wav.getnchannels())
        payload = encoder.encode(silence + wav.readframes(frames)) + encoder.flush()
    filename = term.replace(" ", "_").replace("'", "_") + ".mp3"
    (out / filename).write_bytes(payload)
    if n % 50 == 0 or n == len(deck):
        print(f"Generated {n}/{len(deck)} audio clips", flush=True)
