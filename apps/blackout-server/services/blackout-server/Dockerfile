# syntax=docker/dockerfile:1

FROM rust:1.76-bookworm AS rust-builder
WORKDIR /src
COPY rust ./rust
RUN cd rust && cargo build --release || true

FROM python:3.11-slim-bookworm AS py-builder
WORKDIR /src
ENV PIP_DISABLE_PIP_VERSION_CHECK=1 PIP_NO_CACHE_DIR=1 PYTHONDONTWRITEBYTECODE=1
ENV RUSTUP_HOME=/usr/local/rustup CARGO_HOME=/usr/local/cargo PATH=/usr/local/cargo/bin:$PATH
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential libffi-dev libssl-dev pkg-config git gettext-base \
    && rm -rf /var/lib/apt/lists/*
COPY --from=rust-builder /usr/local/cargo /usr/local/cargo
COPY --from=rust-builder /usr/local/rustup /usr/local/rustup
COPY pyproject.toml poetry.lock README.rst build_rust.py ./
COPY synapse ./synapse
COPY scripts-dev ./scripts-dev
COPY rust ./rust
RUN python -m pip install --upgrade pip setuptools wheel poetry==1.3.2 \
 && poetry export --without-hashes -f requirements.txt -o /tmp/requirements.txt \
 && pip install -r /tmp/requirements.txt \
 && pip install .

FROM python:3.11-slim-bookworm AS runtime
WORKDIR /data
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
RUN apt-get update && apt-get install -y --no-install-recommends \
      libssl3 libffi8 gettext-base \
    && rm -rf /var/lib/apt/lists/*
COPY --from=py-builder /usr/local /usr/local
COPY services/blackout-server/entrypoint.sh /entrypoint.sh
COPY services/blackout-server/homeserver.yaml.template /templates/homeserver.yaml.template
RUN chmod +x /entrypoint.sh
EXPOSE 8008
ENTRYPOINT ["/entrypoint.sh"]
