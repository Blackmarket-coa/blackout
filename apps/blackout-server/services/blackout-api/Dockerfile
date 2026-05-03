FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

COPY services/blackout-api/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY services/blackout-api /app

EXPOSE 9000
CMD ["uvicorn", "blackout_api.main:app", "--host", "0.0.0.0", "--port", "9000"]
