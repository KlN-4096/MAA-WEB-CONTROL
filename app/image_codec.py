from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO

from PIL import Image, UnidentifiedImageError


IMAGE_JPEG = "image/jpeg"
IMAGE_PNG = "image/png"
LOG_PREVIEW_MAX_SIZE = (1280, 720)
PEEP_FRAME_MAX_SIZE = (1280, 720)
LOG_PREVIEW_QUALITY = 78
PEEP_FRAME_QUALITY = 72
SCREENSHOT_BACKGROUND = (16, 17, 20)


@dataclass(frozen=True)
class EncodedImage:
    data: bytes
    media_type: str


def encode_log_preview(image_data: bytes) -> EncodedImage:
    return encode_jpeg_preview(
        image_data,
        max_size=LOG_PREVIEW_MAX_SIZE,
        quality=LOG_PREVIEW_QUALITY,
    )


def encode_peep_frame(image_data: bytes) -> EncodedImage:
    return encode_jpeg_preview(
        image_data,
        max_size=PEEP_FRAME_MAX_SIZE,
        quality=PEEP_FRAME_QUALITY,
    )


def encode_jpeg_preview(
    image_data: bytes,
    *,
    max_size: tuple[int, int],
    quality: int,
) -> EncodedImage:
    try:
        with Image.open(BytesIO(image_data)) as source:
            source.load()
            image = _resize_for_preview(source, max_size)
            output = BytesIO()
            image.save(output, format="JPEG", quality=quality, subsampling=2)
            return EncodedImage(output.getvalue(), IMAGE_JPEG)
    except (OSError, UnidentifiedImageError, ValueError):
        return EncodedImage(image_data, detect_media_type(image_data))


def detect_media_type(image_data: bytes) -> str:
    if image_data.startswith(b"\x89PNG\r\n\x1a\n"):
        return IMAGE_PNG
    if image_data.startswith(b"\xff\xd8\xff"):
        return IMAGE_JPEG
    return "application/octet-stream"


def _resize_for_preview(source: Image.Image, max_size: tuple[int, int]) -> Image.Image:
    image = _to_rgb(source)
    if image.width <= max_size[0] and image.height <= max_size[1]:
        return image
    image.thumbnail(max_size, Image.Resampling.BILINEAR)
    return image


def _to_rgb(source: Image.Image) -> Image.Image:
    if source.mode in {"RGBA", "LA"} or (source.mode == "P" and "transparency" in source.info):
        rgba = source.convert("RGBA")
        background = Image.new("RGB", rgba.size, SCREENSHOT_BACKGROUND)
        background.paste(rgba, mask=rgba.getchannel("A"))
        return background
    return source.convert("RGB")
