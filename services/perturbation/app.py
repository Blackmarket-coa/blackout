"""Blackout image-perturbation sidecar (scaffold).

Exposes a tiny HTTP contract the Blackout API proxies to:

    POST /perturb   {"image": "<base64>", "mimetype": "image/jpeg"}
                 -> {"image": "<base64>", "mimetype": "image/jpeg"}
    GET  /health -> {"status": "ok"}

The default implementation here is a CPU-only, best-effort perturbation
(low-amplitude structured noise via Pillow/NumPy). It is NOT Fawkes-grade and
does not defeat state-of-the-art facial recognition — it exists so the whole
pipeline (client -> API -> sidecar) is runnable end-to-end without a GPU.

To upgrade to real protection, replace `perturb_image()` with a Fawkes/Glaze
cloak (see the SEAM marker). Those models want a GPU; wire one into the
container (nvidia runtime) and pin the model weights at build time.
"""

import base64
import io

import numpy as np
from fastapi import FastAPI, HTTPException
from PIL import Image
from pydantic import BaseModel

app = FastAPI(title="blackout-perturbation", version="0.1.0")

# Pillow format <-> mimetype mapping for the formats the client sends.
_MIME_TO_FORMAT = {
    "image/jpeg": "JPEG",
    "image/png": "PNG",
    "image/webp": "WEBP",
}

# Max decoded image bytes; mirrors MAX_PERTURBATION_BYTES on the API side.
_MAX_BYTES = 8 * 1024 * 1024
_PERTURBATION_AMPLITUDE = 6  # max per-channel delta on the 0-255 scale


class PerturbRequest(BaseModel):
    image: str
    mimetype: str


def perturb_image(img: Image.Image) -> Image.Image:
    """Apply a low-amplitude, deterministic perturbation to every pixel.

    SEAM: swap this body for a Fawkes/Glaze cloak to get real anti-
    facial-recognition protection. Keep the (PIL.Image -> PIL.Image) shape so
    the HTTP contract is unchanged.
    """
    rgb = img.convert("RGB")
    arr = np.asarray(rgb).astype(np.int16)
    h, w, _ = arr.shape

    yy, xx = np.mgrid[0:h, 0:w]
    checker = np.where((xx + yy) % 2 == 0, 1.0, -1.0)
    wave = np.sin((xx * 12.9898 + yy * 78.233) * 0.5)
    rng = np.random.default_rng(seed=(w * 2654435761 + h * 40503) & 0xFFFFFFFF)
    noise = rng.uniform(-1.0, 1.0, size=(h, w))

    delta = np.rint((checker * 0.4 + wave * 0.3 + noise * 0.3) * _PERTURBATION_AMPLITUDE)
    arr[:, :, 0] = np.clip(arr[:, :, 0] + delta, 0, 255)
    arr[:, :, 1] = np.clip(arr[:, :, 1] - delta, 0, 255)
    arr[:, :, 2] = np.clip(arr[:, :, 2] + delta, 0, 255)

    return Image.fromarray(arr.astype(np.uint8), mode="RGB")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/perturb")
def perturb(req: PerturbRequest) -> dict:
    fmt = _MIME_TO_FORMAT.get(req.mimetype)
    if fmt is None:
        raise HTTPException(status_code=415, detail=f"unsupported mimetype {req.mimetype}")

    try:
        raw = base64.b64decode(req.image, validate=True)
    except Exception as exc:  # noqa: BLE001 - surface a clean 400
        raise HTTPException(status_code=400, detail="invalid base64") from exc

    if len(raw) > _MAX_BYTES:
        raise HTTPException(status_code=413, detail="image too large")

    try:
        img = Image.open(io.BytesIO(raw))
        out = perturb_image(img)
        buf = io.BytesIO()
        save_kwargs = {"quality": 92} if fmt in ("JPEG", "WEBP") else {}
        out.save(buf, format=fmt, **save_kwargs)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=422, detail="could not process image") from exc

    return {
        "image": base64.b64encode(buf.getvalue()).decode("ascii"),
        "mimetype": req.mimetype,
    }
