#!/usr/bin/env python3
"""Create a 16-second, calming sound walk from a Gaussian-splat PLY."""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from plyfile import PlyData
from scipy.io.wavfile import write
from scipy.signal import fftconvolve
from scipy.special import expit


ROOT = Path(__file__).resolve().parents[1]
SAMPLE_RATE = 44_100
DURATION = 16.0
ALPHA_MIN = 8 / 255
MAX_SPLAT_SCALE = 0.0045
SH_C0 = 0.28209479177387814
PENTATONIC = np.array([0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24])


def read_gaussian_ply(path: Path) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    ply = PlyData.read(str(path))
    if "vertex" not in ply:
        raise ValueError(f"{path} no contiene una sección vertex.")
    vertices = ply["vertex"].data
    required = {
        "x", "y", "z", "opacity", "scale_0", "scale_1", "scale_2",
        "f_dc_0", "f_dc_1", "f_dc_2",
    }
    missing = required.difference(vertices.dtype.names or ())
    if missing:
        raise ValueError(
            "El PLY no contiene los atributos de Gaussian Splat requeridos: "
            + ", ".join(sorted(missing))
        )

    positions = np.column_stack((vertices["x"], vertices["y"], vertices["z"])).astype(np.float64)
    raw_scales = np.column_stack((vertices["scale_0"], vertices["scale_1"], vertices["scale_2"])).astype(np.float64)
    scales = np.exp(np.clip(raw_scales, -30, 10))
    alpha = expit(np.asarray(vertices["opacity"], dtype=np.float64))
    sh_dc = np.column_stack((vertices["f_dc_0"], vertices["f_dc_1"], vertices["f_dc_2"])).astype(np.float64)
    rgb = np.clip(0.5 + SH_C0 * sh_dc, 0.0, 1.0)
    return positions, scales, alpha, rgb


def crop_for_specimen(
    positions: np.ndarray,
    scales: np.ndarray,
    alpha: np.ndarray,
    specimen: str,
) -> np.ndarray:
    keep = (alpha >= ALPHA_MIN) & (np.max(scales, axis=1) <= MAX_SPLAT_SCALE)
    if specimen == "amarilla":
        keep &= positions[:, 1] <= -0.04
    elif specimen == "pompon":
        keep &= (
            (positions[:, 1] <= -0.08)
            & (positions[:, 0] >= -0.13)
            & (positions[:, 0] <= 0.06)
            & (positions[:, 2] >= -0.02)
            & (positions[:, 2] <= 0.15)
        )
    return keep


def calming_impulse(sample_rate: int) -> np.ndarray:
    """Sparse, soft reflections that leave long but quiet note tails."""
    impulse = np.zeros(int(sample_rate * 1.35), dtype=np.float64)
    for delay, level in zip(
        (0.083, 0.127, 0.191, 0.276, 0.391, 0.548, 0.731, 0.947, 1.19),
        (0.22, 0.18, 0.145, 0.115, 0.09, 0.07, 0.052, 0.037, 0.024),
    ):
        impulse[int(delay * sample_rate)] = level
    return impulse


def make_sound(positions: np.ndarray, rgb: np.ndarray, duration: float) -> tuple[np.ndarray, int]:
    sample_rate = SAMPLE_RATE
    sample_count = int(round(duration * sample_rate))
    center = np.median(positions, axis=0)
    relative = positions - center
    radial_distance = np.linalg.norm(relative, axis=1)
    angle = np.mod(np.arctan2(relative[:, 2], relative[:, 0]), 2 * np.pi)

    event_count = 48
    sector = np.floor(angle / (2 * np.pi) * event_count).astype(np.int32)
    low, high = np.quantile(radial_distance, (0.08, 0.92))
    span = max(high - low, 1e-9)
    mix = np.zeros((sample_count, 2), dtype=np.float64)

    for index in range(event_count):
        selected = np.flatnonzero(sector == index)
        if selected.size == 0:
            continue

        radius = float(np.median(radial_distance[selected]))
        normalized_radius = float(np.clip((radius - low) / span, 0.0, 1.0))
        scale_index = int(round(normalized_radius * (len(PENTATONIC) - 1)))
        midi_note = 60 + int(PENTATONIC[scale_index])
        frequency = 440.0 * (2.0 ** ((midi_note - 69) / 12.0))
        event_angle = (index + 0.5) * (2 * np.pi / event_count)
        start = int((index / event_count) * duration * sample_rate)
        length = min(int(sample_rate * 2.6), sample_count - start)
        if length <= 0:
            continue

        time = np.arange(length, dtype=np.float64) / sample_rate
        attack = 1.0 - np.exp(-time / 0.32)
        tail = np.exp(-time / 1.42)
        envelope = attack * tail
        tone = (
            np.sin(2 * np.pi * frequency * time)
            + 0.18 * np.sin(2 * np.pi * frequency * 2 * time + 0.16)
            + 0.045 * np.sin(2 * np.pi * frequency * 3 * time + 0.31)
        )

        local_color = np.mean(rgb[selected], axis=0)
        brightness = float(np.mean(local_color))
        level = 0.026 * (0.62 + 0.38 * brightness)
        pan = 0.5 + 0.35 * np.sin(event_angle)
        left_gain = np.cos(pan * np.pi / 2)
        right_gain = np.sin(pan * np.pi / 2)
        voice = level * envelope * tone
        mix[start : start + length, 0] += voice * left_gain
        mix[start : start + length, 1] += voice * right_gain

    impulse = calming_impulse(sample_rate)
    wet = np.column_stack(
        [fftconvolve(mix[:, channel], impulse, mode="full")[:sample_count] for channel in range(2)]
    )
    mix = 0.84 * mix + 0.16 * wet

    fade_start = int(sample_count * 0.92)
    fade_length = sample_count - fade_start
    mix[fade_start:] *= 0.5 * (1 + np.cos(np.linspace(0, np.pi, fade_length)))[:, None]
    peak = float(np.max(np.abs(mix)))
    if peak > 0:
        mix *= 0.88 / peak
    return np.clip(mix, -1.0, 1.0), sample_rate


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input",
        type=Path,
        default=ROOT / "dist" / "scans-final" / "scan-01.ply",
        help="PLY Gaussian de entrada (por defecto: la dalia amarilla del proyecto).",
    )
    parser.add_argument(
        "--specimen",
        choices=("amarilla", "pompon", "sin-recorte"),
        default="amarilla",
        help="Recorte espacial de la flor; usa sin-recorte para un PLY ya editado en SuperSplat.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / "public" / "audio" / "dalia-calma.wav",
        help="Ruta para el WAV generado.",
    )
    parser.add_argument("--duration", type=float, default=DURATION, help="Duración del WAV en segundos.")
    args = parser.parse_args()

    if args.duration <= 2:
        parser.error("La duración debe ser mayor que 2 segundos para que quepan las colas sonoras.")
    if not args.input.is_file():
        parser.error(f"No existe el archivo PLY: {args.input}")

    positions, scales, alpha, rgb = read_gaussian_ply(args.input)
    keep = crop_for_specimen(positions, scales, alpha, args.specimen)
    positions, rgb = positions[keep], rgb[keep]
    if len(positions) < 48:
        parser.error("El recorte dejó muy pocos splats para crear una pieza sonora.")

    audio, sample_rate = make_sound(positions, rgb, args.duration)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    write(args.output, sample_rate, np.round(audio * 32767).astype(np.int16))
    print(
        f"WAV creado: {args.output}\n"
        f"{len(positions):,} Gaussian splats · 48 notas en una vuelta · "
        f"{args.duration:g} s · {sample_rate:,} Hz estéreo"
    )


if __name__ == "__main__":
    main()
