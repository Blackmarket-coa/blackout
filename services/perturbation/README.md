# Blackout perturbation sidecar

Internal HTTP service that applies anti–facial-recognition perturbation to
images before they're uploaded. The Blackout API (`POST /v1/media/perturb`)
proxies to it; the web client falls back to a client-side perturbation when
this service isn't configured.

## Contract

```
POST /perturb   {"image": "<base64>", "mimetype": "image/jpeg|png|webp"}
             -> {"image": "<base64>", "mimetype": "..."}
GET  /health -> {"status": "ok"}
```

## Status: scaffold (not Fawkes-grade)

The bundled `perturb_image()` is a CPU-only, best-effort transform
(low-amplitude structured noise). It makes the full pipeline runnable without a
GPU but **does not** defeat state-of-the-art facial recognition. The UI labels
the client-facing toggle as "best-effort" accordingly.

### Upgrading to real protection (Fawkes/Glaze)

1. Replace the body of `perturb_image()` (marked `SEAM` in `app.py`) with a
   Fawkes or Glaze cloak.
2. Rebase the `Dockerfile` on a CUDA image, add `torch` + the model weights,
   and give the container a GPU (nvidia runtime / `nvidia.com/gpu` in K8s).
3. Keep the `(PIL.Image) -> PIL.Image` shape so the HTTP contract is unchanged.

## Wiring

Set `PERTURBATION_SERVICE_URL=http://perturbation:8000` on the API. The service
is internal-only (no auth); never expose it on the public edge.
