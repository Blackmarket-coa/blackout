FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

RUN useradd -m -u 1000 -s /bin/bash appuser

COPY services/blackout-api/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY services/blackout-api /app

USER appuser
EXPOSE 9000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:9000/health')"
CMD ["uvicorn", "blackout_api.main:app", "--host", "0.0.0.0", "--port", "9000"]
