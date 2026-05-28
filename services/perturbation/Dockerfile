# Blackout image-perturbation sidecar.
#
# CPU-only scaffold. The default perturbation is best-effort (Pillow/NumPy).
# To run real Fawkes/Glaze protection, base this on a CUDA image, add the model
# weights + torch, and swap perturb_image() (see app.py SEAM).
FROM python:3.11-slim

WORKDIR /app

# Pillow needs a few runtime libs for JPEG/WEBP.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libjpeg62-turbo libwebp7 zlib1g \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py ./

EXPOSE 8000

# Internal-only service; no auth here — only the Blackout API reaches it on the
# private network. Keep it off the public edge.
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
