# Stage 1: install production dependencies into an isolated venv
FROM python:3.12-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /build

RUN python -m venv /venv
ENV PATH="/venv/bin:$PATH"

COPY backend/requirements/ requirements/
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements/prod.txt

# Stage 2: lean runtime image
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/venv/bin:$PATH"

# Non-root user for security
RUN addgroup --system appgroup && \
    adduser --system --ingroup appgroup appuser

WORKDIR /app

# Copy the pre-built venv from the builder stage
COPY --from=builder /venv /venv

# Copy backend source
COPY backend/ .

RUN chown -R appuser:appgroup /app && \
    chmod +x /app/entrypoint.sh

USER appuser

EXPOSE 8000

CMD ["/app/entrypoint.sh"]
