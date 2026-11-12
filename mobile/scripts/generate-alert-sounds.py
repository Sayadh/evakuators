#!/usr/bin/env python3
"""
Generates the selectable new-order ring tones in mobile/assets/sounds.

Original, synthesized sounds (no third-party audio, no recordings): every
melody here was written for this app — reproducible and license free.

2026-11-12, second generation ("the rings sound bad"): the first set was bare
sine partials squeezed through a strong tanh limiter, which made them harsh
and buzzy. This one models each instrument properly (inharmonic bar and bell
modes, plucked strings, FM electric piano, a breathy flute, a warm pad),
plays real little melodies with a bass/chord bed, adds a small room reverb,
and only levels gently (no distortion).

Constraints they meet:
  - iOS plays a notification sound once, at most 30 s; the server re-rings
    every 10 s -> each file is 12 s: a phrase and its answer, repeated;
  - Android's alarm loops the file (FLAG_INSISTENT) -> each file ends on a
    quiet tail so the loop is seamless;
  - 16-bit mono PCM WAV, 22.05 kHz (both platforms; ~530 KB each).
The classic tone (offer_alert.wav) is the original and is not generated.

Run: python3 scripts/generate-alert-sounds.py   (needs numpy only)
"""
import os
import wave

import numpy as np

RATE = 22050
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'sounds')
LENGTH_S = 12.0
RNG = np.random.default_rng(2026)

NOTE = {'C': -9, 'C#': -8, 'Db': -8, 'D': -7, 'D#': -6, 'Eb': -6, 'E': -5, 'F': -4, 'F#': -3, 'Gb': -3,
        'G': -2, 'G#': -1, 'Ab': -1, 'A': 0, 'A#': 1, 'Bb': 1, 'B': 2}


def hz(name):
    pitch, octave = name[:-1], int(name[-1])
    return 440.0 * 2 ** ((NOTE[pitch] + 12 * (octave - 4)) / 12)


def t_axis(dur):
    return np.arange(int(dur * RATE)) / RATE


def fade_edges(x, attack=0.003, release=0.02):
    n = len(x)
    a = max(1, int(attack * RATE))
    r = max(1, int(release * RATE))
    env = np.ones(n)
    env[:a] = np.linspace(0, 1, a) if a < n else env[:a]
    env[-r:] *= np.linspace(1, 0, r)
    return x * env


def onepole_lowpass(x, cutoff):
    a = 1 - np.exp(-2 * np.pi * cutoff / RATE)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc += a * (x[i] - acc)
        y[i] = acc
    return y


# ─── Instruments ─────────────────────────────────────────────────────────────

def modal(freq, dur, modes, attack=0.002):
    """Sum of decaying sine modes: (ratio, gain, decay seconds)."""
    t = t_axis(dur)
    out = np.zeros_like(t)
    for ratio, gain, decay in modes:
        f = freq * ratio
        if f >= RATE / 2 * 0.9:
            continue
        out += gain * np.sin(2 * np.pi * f * t + RNG.uniform(0, 0.3)) * np.exp(-t / decay)
    return fade_edges(out, attack, 0.03)


def mallet_noise(dur=0.012, cutoff=3000):
    n = int(dur * RATE)
    noise = RNG.uniform(-1, 1, n) * np.exp(-np.arange(n) / (n / 4))
    return onepole_lowpass(noise, cutoff)


def marimba(freq, dur=1.4):
    x = modal(freq, dur, [(1, 1.0, 0.55), (3.93, 0.32, 0.12), (9.24, 0.08, 0.04)])
    x[: int(0.012 * RATE)] += 0.25 * mallet_noise()
    return x


def vibes(freq, dur=2.6):
    t = t_axis(dur)
    x = modal(freq, dur, [(1, 1.0, 1.6), (3.98, 0.22, 0.5), (9.0, 0.05, 0.12)])
    tremolo = 1 - 0.28 * (0.5 + 0.5 * np.sin(2 * np.pi * 5.2 * t))
    return x * tremolo


def kalimba(freq, dur=1.6):
    x = modal(freq, dur, [(1, 1.0, 0.75), (5.95, 0.16, 0.08), (2.0, 0.05, 0.3), (11.7, 0.04, 0.03)])
    x[: int(0.008 * RATE)] += 0.18 * mallet_noise(0.008, 5000)
    return x


def glock(freq, dur=2.2):
    return modal(freq, dur, [(1, 1.0, 1.1), (2.76, 0.32, 0.45), (5.40, 0.12, 0.2), (8.93, 0.05, 0.1)], attack=0.001)


def tubular(freq, dur=4.0):
    modes = [(0.5, 0.18, 2.4), (1.0, 1.0, 2.2), (1.183, 0.42, 1.6), (1.506, 0.35, 1.3), (2.0, 0.42, 1.1),
             (2.514, 0.18, 0.8), (2.662, 0.2, 0.7), (3.011, 0.1, 0.5), (4.166, 0.06, 0.35)]
    x = modal(freq, dur, modes, attack=0.001)
    x[: int(0.01 * RATE)] += 0.2 * mallet_noise(0.01, 4000)
    return x


def piano(freq, dur=2.4):
    """A few slightly inharmonic, slightly detuned strings per note; highs die first."""
    t = t_axis(dur)
    out = np.zeros_like(t)
    B = 0.00035
    base_decay = 1.6 * (261.6 / freq) ** 0.35
    for detune in (1.0, 1.0012):
        for n in range(1, 10):
            f = freq * n * np.sqrt(1 + B * n * n) * detune
            if f >= RATE / 2 * 0.9:
                break
            gain = (1 / n ** 1.15) * (0.55 if n == 1 else 1.0 if n == 2 else 0.8)
            out += gain * np.sin(2 * np.pi * f * t) * np.exp(-t / (base_decay / (1 + 0.45 * (n - 1))))
    out[: int(0.006 * RATE)] += 0.15 * mallet_noise(0.006, 2500)
    return fade_edges(out * 0.5, 0.002, 0.05)


def epiano(freq, dur=2.4):
    """FM electric piano: bell-like attack that mellows."""
    t = t_axis(dur)
    index = 0.4 + 2.2 * np.exp(-t / 0.18)
    mod = np.sin(2 * np.pi * freq * t)
    carrier = np.sin(2 * np.pi * freq * t + index * mod)
    tine = 0.12 * np.sin(2 * np.pi * freq * 7.0 * t) * np.exp(-t / 0.05)
    env = np.exp(-t / 1.1)
    return fade_edges((carrier * env + tine), 0.002, 0.05)


_pluck_cache = {}


def pluck(freq, dur=2.2, brightness=0.5, damping=0.9965):
    """Karplus-Strong string; `brightness` lowers the initial noise for a softer, nylon-like pluck."""
    key = (round(freq, 3), dur, brightness, damping)
    if key in _pluck_cache:
        return _pluck_cache[key]
    n = int(dur * RATE)
    period = max(2, int(round(RATE / freq)))
    burst = RNG.uniform(-1, 1, period)
    burst = onepole_lowpass(burst, 1500 + 6000 * brightness)
    buf = list(burst - burst.mean())
    out = np.empty(n)
    idx = 0
    prev = 0.0
    for i in range(n):
        cur = buf[idx]
        out[i] = cur
        buf[idx] = damping * 0.5 * (cur + prev)
        prev = cur
        idx += 1
        if idx == period:
            idx = 0
    out = fade_edges(out, 0.001, 0.05)
    _pluck_cache[key] = out
    return out


def flute(freq, dur):
    t = t_axis(dur)
    vib = 1 + 0.004 * np.sin(2 * np.pi * 5.0 * t) * np.clip((t - 0.15) / 0.3, 0, 1)
    phase = 2 * np.pi * np.cumsum(freq * vib) / RATE
    tone = np.sin(phase) + 0.22 * np.sin(2 * phase) + 0.07 * np.sin(3 * phase)
    breath = onepole_lowpass(RNG.uniform(-1, 1, len(t)), 2500) * 0.12 * np.exp(-t / 0.12)
    env = np.minimum(1, t / 0.07) * np.minimum(1, np.maximum(0, (dur - t) / 0.12))
    return (tone + breath) * env


def pad(freqs, dur, cutoff=1400):
    """Warm detuned saw pad, slow attack and release."""
    t = t_axis(dur)
    out = np.zeros_like(t)
    for f0 in freqs:
        for detune in (0.997, 1.0, 1.003):
            f = f0 * detune
            for k in range(1, 12):
                if f * k >= RATE / 2 * 0.9:
                    break
                out += np.sin(2 * np.pi * f * k * t + RNG.uniform(0, 6.28)) / k
    out = onepole_lowpass(out, cutoff)
    env = np.minimum(1, t / 0.5) * np.minimum(1, np.maximum(0, (dur - t) / 0.6))
    return out * env / (len(freqs) * 3)


def soft_square(freq, dur):
    t = t_axis(dur)
    x = sum(np.sin(2 * np.pi * freq * k * t) / k for k in (1, 3, 5, 7) if freq * k < RATE / 2 * 0.9)
    return fade_edges(x, 0.004, 0.012)


# ─── Mixing helpers ──────────────────────────────────────────────────────────

def track():
    return np.zeros(int(LENGTH_S * RATE))


def place(tr, sound, at, gain=1.0):
    start = int(at * RATE)
    if start >= len(tr):
        return
    end = min(len(tr), start + len(sound))
    tr[start:end] += gain * sound[: end - start]


def comb(x, delay, feedback, damp=0.3):
    """Feedback comb with a lowpass in the loop, processed in blocks of `delay`."""
    y = np.zeros(len(x))
    state = np.zeros(delay)
    for start in range(0, len(x), delay):
        block = x[start:start + delay]
        prev = y[start - delay:start] if start >= delay else np.zeros(delay)
        state = (1 - damp) * prev + damp * state
        y[start:start + len(block)] = block + feedback * state[: len(block)]
    return y


def allpass(x, delay, g=0.5):
    y = np.zeros(len(x))
    for start in range(0, len(x), delay):
        block = x[start:start + delay]
        xd = x[start - delay:start] if start >= delay else np.zeros(delay)
        yd = y[start - delay:start] if start >= delay else np.zeros(delay)
        y[start:start + len(block)] = -g * block + xd[: len(block)] + g * yd[: len(block)]
    return y


def reverb(x, wet=0.22, size=1.0):
    combs = [int(d * size) for d in (1116, 1188, 1277, 1356)]
    w = sum(comb(x, d, 0.80) for d in combs) / 4
    for d in (225, 556):
        w = allpass(w, d)
    return (1 - wet) * x + wet * w


def finish(x, wet=0.22, target_rms=0.16):
    x = reverb(x, wet)
    x -= np.mean(x)
    x /= np.max(np.abs(x)) or 1.0
    # Gentle leveling: a mild soft knee only above 0.6 - audible, never buzzy.
    rms = np.sqrt(np.mean(x ** 2))
    gain = min(2.2, target_rms / rms) if rms > 0 else 1.0
    x = x * gain
    knee = 0.6
    over = np.abs(x) > knee
    x[over] = np.sign(x[over]) * (knee + (1 - knee) * np.tanh((np.abs(x[over]) - knee) / (1 - knee)))
    # Full scale: an alarm should use the loudness it has
    x *= 0.97 / (np.max(np.abs(x)) or 1.0)
    # Quiet tail so Android's loop restarts cleanly
    tail = int(0.25 * RATE)
    x[-tail:] *= np.linspace(1, 0, tail)
    return x


def seq(tr, instrument, notes, t0, beat, gain=1.0, **kw):
    """notes: [(name, start_in_beats)] - None name = rest."""
    for name, at in notes:
        if name:
            place(tr, instrument(hz(name), **kw), t0 + at * beat, gain)


# ─── The rings (all melodies original) ───────────────────────────────────────

def ring_marimba():
    """Bright and cheerful: a bouncing call and answer in G major."""
    tr = track()
    beat = 0.17
    call = [('G5', 0), ('B5', 1), ('D6', 2), ('G6', 3), ('E6', 5), ('D6', 6), ('B5', 7)]
    answer = [('C6', 0), ('E6', 1), ('G6', 2), ('F#6', 4), ('D6', 5), ('A6', 6), ('G6', 8)]
    for cycle in range(3):
        t0 = cycle * 4.0
        seq(tr, marimba, call, t0, beat)
        seq(tr, marimba, answer, t0 + 1.9, beat)
        for name, at in (('G3', 0), ('D4', 4), ('C4', 11.2), ('D4', 15.2)):
            place(tr, marimba(hz(name), 1.2), t0 + at * beat, 0.45)
    return finish(tr, wet=0.16)


def ring_kalimba():
    """Gentle: a rounded thumb-piano lullaby in D pentatonic."""
    tr = track()
    beat = 0.22
    a = [('D5', 0), ('F#5', 1), ('A5', 2), ('D6', 3), ('B5', 4.5), ('A5', 5.5)]
    b = [('E5', 0), ('A5', 1), ('B5', 2), ('E6', 3), ('D6', 4.5), ('F#5', 6)]
    for cycle in range(3):
        t0 = cycle * 4.0
        seq(tr, kalimba, a, t0, beat)
        seq(tr, kalimba, b, t0 + 1.95, beat)
    return finish(tr, wet=0.25, target_rms=0.13)


def ring_chime():
    """Sparkling glockenspiel: a rising C major figure that lands on a sixth."""
    tr = track()
    beat = 0.15
    phrase = [('E6', 0), ('G6', 1), ('C7', 2), ('E7', 3), ('D7', 5), ('A6', 6.5)]
    reply = [('F6', 0), ('A6', 1), ('C7', 2), ('F7', 3), ('E7', 5), ('C7', 6.5)]
    for cycle in range(3):
        t0 = cycle * 4.0
        seq(tr, glock, phrase, t0, beat)
        seq(tr, glock, reply, t0 + 1.8, beat)
    return finish(tr, wet=0.3)


def ring_harp():
    """A harp glissando up an A minor ninth chord, then a soft resolution to C."""
    tr = track()
    up = ['A4', 'C5', 'E5', 'G5', 'B5', 'C6', 'E6', 'G6', 'A6']
    res = ['C5', 'E5', 'G5', 'C6', 'E6', 'G6', 'C7']
    for cycle in range(3):
        t0 = cycle * 4.0
        for i, name in enumerate(up):
            place(tr, pluck(hz(name), 2.4, 0.6, 0.997), t0 + i * 0.075, 0.9)
        for i, name in enumerate(res):
            place(tr, pluck(hz(name), 2.4, 0.5, 0.997), t0 + 1.7 + i * 0.07, 0.8)
        place(tr, pluck(hz('A2'), 2.5, 0.3, 0.998), t0, 0.7)
        place(tr, pluck(hz('C3'), 2.5, 0.3, 0.998), t0 + 1.7, 0.7)
    return finish(tr, wet=0.28)


def ring_calm():
    """The softest: a warm pad under a slow electric-piano melody (Fmaj7 -> Am7)."""
    tr = track()
    chords = [['F3', 'A3', 'C4', 'E4'], ['A3', 'C4', 'E4', 'G4'], ['D3', 'F3', 'A3', 'C4'], ['G3', 'B3', 'D4', 'F4']]
    melody = [('C5', 0), ('E5', 1), ('A5', 2), ('G5', 3.5), ('E5', 5), ('F5', 6), ('D5', 7), ('E5', 8.5)]
    for i, chord in enumerate(chords):
        place(tr, pad([hz(n) for n in chord], 3.2, 1200), i * 3.0, 0.55)
    for cycle in range(2):
        seq(tr, epiano, melody, cycle * 6.0 + 0.2, 0.55, 0.55)
    return finish(tr, wet=0.3, target_rms=0.12)


def ring_doorbell():
    """A three-tone chime: ding-dong-ding, then a lower answer."""
    tr = track()
    for cycle in range(3):
        t0 = cycle * 4.0
        place(tr, tubular(hz('E5'), 3.0), t0, 0.9)
        place(tr, tubular(hz('C5'), 3.0), t0 + 0.55, 0.9)
        place(tr, tubular(hz('G5'), 3.0), t0 + 1.1, 0.9)
        place(tr, tubular(hz('C5'), 3.0), t0 + 2.1, 0.7)
    return finish(tr, wet=0.2)


def ring_digital():
    """The loudest, for noisy places: a clean, rhythmic two-tone beeper."""
    tr = track()
    for cycle in range(int(LENGTH_S / 1.5)):
        t0 = cycle * 1.5
        for i, name in enumerate(['A6', 'E7', 'A6', 'E7']):
            place(tr, soft_square(hz(name), 0.085), t0 + i * 0.12)
        place(tr, soft_square(hz('A7'), 0.18), t0 + 0.55, 0.8)
    return finish(tr, wet=0.05, target_rms=0.24)


def ring_piano():
    """New: a warm grand-piano phrase in E-flat major, with a soft left hand."""
    tr = track()
    beat = 0.24
    right = [('Bb4', 0), ('Eb5', 1), ('G5', 2), ('Bb5', 3), ('Ab5', 4.5), ('G5', 5), ('F5', 5.5), ('G5', 6.5)]
    right2 = [('C5', 0), ('Eb5', 1), ('Ab5', 2), ('C6', 3), ('Bb5', 4.5), ('G5', 5.5), ('Eb5', 6.5)]
    for cycle in range(3):
        t0 = cycle * 4.0
        seq(tr, piano, right, t0, beat)
        seq(tr, piano, right2, t0 + 2.0, beat)
        for name, at in (('Eb3', 0), ('Bb3', 2), ('Ab2', 8.3), ('Eb3', 10.3)):
            place(tr, piano(hz(name), 2.2), t0 + at * beat, 0.5)
    return finish(tr, wet=0.22)


def ring_vibes():
    """New: a mellow vibraphone with tremolo - a little jazz phrase in F."""
    tr = track()
    beat = 0.2
    phrase = [('A5', 0), ('C6', 1), ('E6', 2), ('D6', 3.5), ('C6', 4), ('A5', 5), ('G5', 6.5)]
    reply = [('Bb5', 0), ('D6', 1), ('F6', 2), ('E6', 3.5), ('C6', 4.5), ('F6', 6.5)]
    for cycle in range(3):
        t0 = cycle * 4.0
        seq(tr, vibes, phrase, t0, beat)
        seq(tr, vibes, reply, t0 + 1.9, beat)
    return finish(tr, wet=0.25, target_rms=0.14)


def ring_guitar():
    """New: a nylon-string guitar strumming C - G - Am - F with a little lead."""
    tr = track()
    chords = [['C3', 'G3', 'C4', 'E4', 'G4'], ['G2', 'D3', 'G3', 'B3', 'D4'],
              ['A2', 'E3', 'A3', 'C4', 'E4'], ['F2', 'C3', 'F3', 'A3', 'C4']]
    lead = [('E5', 0.6), ('G5', 1.0), ('D5', 1.6), ('B4', 2.0), ('C5', 2.6), ('E5', 3.0), ('A4', 3.6), ('C5', 4.0)]
    for cycle in range(2):
        t0 = cycle * 6.0
        for i, chord in enumerate(chords):
            for k, name in enumerate(chord):
                place(tr, pluck(hz(name), 2.0, 0.35, 0.9975), t0 + i * 1.2 + k * 0.025, 0.55)
        for name, at in lead:
            place(tr, pluck(hz(name), 1.6, 0.55, 0.997), t0 + at * 1.2, 0.8)
    return finish(tr, wet=0.2)


def ring_flute():
    """New: a soft flute melody over a quiet pad - calm but clearly a call."""
    tr = track()
    beat = 0.3
    melody = [('D5', 0, 1), ('F#5', 1, 1), ('A5', 2, 1.5), ('B5', 3.5, 0.5), ('A5', 4, 1), ('F#5', 5, 1), ('E5', 6, 2),
              ('G5', 9, 1), ('F#5', 10, 1), ('E5', 11, 1), ('D5', 12, 2.5)]
    for cycle in range(2):
        t0 = cycle * 6.0
        for name, at, length in melody:
            place(tr, flute(hz(name), length * beat * 0.95), t0 + at * beat, 0.8)
        place(tr, pad([hz('D3'), hz('A3'), hz('F#4')], 2.8, 900), t0, 0.35)
        place(tr, pad([hz('G3'), hz('B3'), hz('D4')], 2.8, 900), t0 + 2.7, 0.35)
    return finish(tr, wet=0.3, target_rms=0.13)


def ring_bells():
    """New: tower bells - a descending peal answered by a rising one."""
    tr = track()
    peal = ['G5', 'E5', 'D5', 'C5']
    answer = ['C5', 'D5', 'E5', 'G5']
    for cycle in range(2):
        t0 = cycle * 6.0
        for i, name in enumerate(peal):
            place(tr, tubular(hz(name), 3.5), t0 + i * 0.42, 0.8)
        for i, name in enumerate(answer):
            place(tr, tubular(hz(name), 3.5), t0 + 2.4 + i * 0.42, 0.8)
    return finish(tr, wet=0.3)


def ring_sunrise():
    """New: an electric-piano arpeggio climbing Cmaj9 -> Fmaj9, like a sunrise."""
    tr = track()
    up1 = ['C4', 'E4', 'G4', 'B4', 'D5', 'E5', 'G5', 'B5']
    up2 = ['F4', 'A4', 'C5', 'E5', 'G5', 'A5', 'C6', 'E6']
    for cycle in range(3):
        t0 = cycle * 4.0
        for i, name in enumerate(up1):
            place(tr, epiano(hz(name), 2.0), t0 + i * 0.11, 0.6)
        for i, name in enumerate(up2):
            place(tr, epiano(hz(name), 2.0), t0 + 1.9 + i * 0.11, 0.6)
        place(tr, epiano(hz('C3'), 2.4), t0, 0.5)
        place(tr, epiano(hz('F2'), 2.4), t0 + 1.9, 0.5)
    return finish(tr, wet=0.28, target_rms=0.14)


RINGS = {
    'calm': ring_calm,
    'kalimba': ring_kalimba,
    'chime': ring_chime,
    'harp': ring_harp,
    'marimba': ring_marimba,
    'doorbell': ring_doorbell,
    'digital': ring_digital,
    'piano': ring_piano,
    'vibes': ring_vibes,
    'guitar': ring_guitar,
    'flute': ring_flute,
    'bells': ring_bells,
    'sunrise': ring_sunrise,
}


def write(name, x):
    data = (x * 0.89 * 32767).astype('<i2')
    path = os.path.join(OUT, f'offer_{name}.wav')
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(data.tobytes())
    rms = np.sqrt(np.mean(x ** 2))
    print(f'{path}  {len(data) / RATE:.1f}s  rms={rms:.3f}')


if __name__ == '__main__':
    import sys
    only = sys.argv[1:]
    for name, make in RINGS.items():
        if not only or name in only:
            write(name, make())
