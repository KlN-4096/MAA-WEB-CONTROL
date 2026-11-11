from __future__ import annotations

import base64
import binascii
import io
from typing import Any

from PIL import Image, ImageEnhance, ImageOps, UnidentifiedImageError


MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_IMAGE_PIXELS = 16_000_000
GRID_SIZE = 24
# 色序来自 MaaWpfGui/Helper/PixelPaintHelper.cs (MAA v6.22.0，AGPL-3.0)。
PIXEL_PALETTE = [
    (34,34,34),(180,180,180),(234,231,223),(255,255,255),
    (211,47,54),(156,10,0),(214,12,74),(230,150,141),
    (254,152,117),(247,208,192),(252,239,234),(251,246,232),
    (220,210,200),(226,206,171),(213,99,34),(212,140,66),
    (242,153,0),(249,201,51),(252,228,153),(179,180,122),
    (194,218,114),(108,110,0),(177,145,85),(169,143,116),
    (170,146,40),(63,43,18),(116,73,31),(83,70,88),
    (42,36,70),(57,69,153),(90,69,157),(186,163,215),
    (182,188,223),(169,172,190),(99,171,185),(180,210,220),
    (145,216,230),(71,174,160),(182,211,200),(39,56,100),
]


def decode_image(data: str) -> Image.Image:
    if len(data) > MAX_IMAGE_BYTES * 4 // 3 + 128:
        raise ValueError("图片不能超过 8 MiB")
    try:
        encoded = data.split(",", 1)[1] if data.startswith("data:") else data
        raw = base64.b64decode(encoded, validate=True)
        with Image.open(io.BytesIO(raw)) as source:
            if source.format not in {"PNG", "JPEG", "WEBP"} or source.width * source.height > MAX_IMAGE_PIXELS:
                raise ValueError("仅支持不超过 1600 万像素的 PNG/JPEG/WebP 图片")
            source = ImageOps.exif_transpose(source)
            rgba = source.convert("RGBA")
            image = Image.new("RGB", rgba.size, "white")
            image.paste(rgba, mask=rgba.getchannel("A"))
            return image
    except (binascii.Error, UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise ValueError("无法读取图片") from exc


def background_image(data: str) -> bytes:
    image = decode_image(data)
    image.thumbnail((2560, 1600))
    out = io.BytesIO()
    image.save(out, "JPEG", quality=90)
    return out.getvalue()


def _oklab(rgb: tuple[float, ...]) -> tuple[float, float, float]:
    r, g, b = [(v / 255 / 12.92 if v / 255 <= .04045 else ((v / 255 + .055) / 1.055) ** 2.4) for v in rgb]
    l = (.4122214708*r + .5363325363*g + .0514459929*b) ** (1/3)
    m = (.2119034982*r + .6806995451*g + .1073969566*b) ** (1/3)
    s = (.0883024619*r + .2817188376*g + .6299787005*b) ** (1/3)
    return (.2104542553*l + .793617785*m - .0040720468*s,
            1.9779984951*l - 2.428592205*m + .4505937099*s,
            .0259040371*l + .7827717662*m - .808675766*s)


def pixel_paint(data: str, *, fit: str = "cover", dither: bool = False, brightness: float = 1, contrast: float = 1, saturation: float = 1) -> dict[str, Any]:
    image = decode_image(data)
    size = (GRID_SIZE, GRID_SIZE)
    if fit == "contain":
        image = ImageOps.pad(image, size, color="white")
    elif fit == "stretch":
        image = image.resize(size, Image.Resampling.LANCZOS)
    elif fit == "cover":
        image = ImageOps.fit(image, size, Image.Resampling.LANCZOS)
    else:
        raise ValueError("无效构图模式")
    for enhancer, factor in ((ImageEnhance.Brightness, brightness), (ImageEnhance.Contrast, contrast), (ImageEnhance.Color, saturation)):
        if not 0 <= factor <= 3:
            raise ValueError("图像调整范围为 0–3")
        image = enhancer(image).enhance(factor)
    pixels = [[list(image.getpixel((x,y))) for x in range(GRID_SIZE)] for y in range(GRID_SIZE)]
    palette_lab = [_oklab(rgb) for rgb in PIXEL_PALETTE]
    groups: dict[int, list[list[int]]] = {}
    result = Image.new("RGB", size)
    for y in range(GRID_SIZE):
        for x in range(GRID_SIZE):
            rgb = tuple(max(0, min(255, v)) for v in pixels[y][x])
            lab = _oklab(rgb)
            color = min(range(len(PIXEL_PALETTE)), key=lambda i: sum((a-b)**2 for a,b in zip(lab,palette_lab[i])))
            result.putpixel((x,y), PIXEL_PALETTE[color])
            groups.setdefault(color, []).append([x,y])
            if dither:
                errors = [rgb[c] - PIXEL_PALETTE[color][c] for c in range(3)]
                for dx,dy,weight in ((1,0,7/16),(-1,1,3/16),(0,1,5/16),(1,1,1/16)):
                    nx,ny = x+dx,y+dy
                    if 0 <= nx < GRID_SIZE and ny < GRID_SIZE:
                        for c in range(3):
                            pixels[ny][nx][c] += errors[c] * weight
    out = io.BytesIO()
    result.resize((288,288), Image.Resampling.NEAREST).save(out, "PNG")
    return {"preview": "data:image/png;base64," + base64.b64encode(out.getvalue()).decode(),
            "groups": [{"color": color, "points": points} for color,points in sorted(groups.items())]}
