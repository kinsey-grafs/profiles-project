# Node.js Multi-Service Demo: OpenTelemetry + Pyroscope

A multi-service Node.js application demonstrating **OpenTelemetry tracing** and **Pyroscope CPU profiling** for Grafana Cloud. Traces span multiple services so you can see distributed request flows, and CPU profiles help identify performance hotspots.

## Architecture

```
┌─────────────┐     HTTP      ┌─────────────┐
│ API Gateway │ ───────────►  │   Backend   │
│  (port 3000)│               │  (port 3001)│
└─────────────┘               └─────────────┘
       │                             │
       │ OTLP (traces, metrics, logs)│ OTLP (traces, metrics, logs)
       │ Pyroscope profiles          │ Pyroscope profiles
       ▼                             ▼
┌──────────────────────────────────────────────────┐
│  Grafana Cloud (Tempo, Mimir, Loki, Pyroscope)     │
└──────────────────────────────────────────────────┘
```

## Features

- **OpenTelemetry tracing** – Auto-instrumented HTTP/Express with W3C trace context propagation
- **CPU profiling** – Pyroscope wall profiles with `collectCpuTime: true` for CPU flamegraphs
- **Structured logging** – Logs exported via OTLP to Loki (Grafana Cloud) or local stack
- **Multiple services** – API gateway calls backend; traces include spans from both
- **Grafana Cloud first** – Send data directly to your Grafana Cloud stack

---

## Quick Start: Grafana Cloud

This is the preferred setup. Send traces and profiles directly to your Grafana Cloud stack.

### 1. Get your Grafana Cloud credentials

1. Sign in to [Grafana Cloud](https://grafana.com/auth/sign-in/)
2. Open your stack and go to **Details**
3. **Traces (Tempo)** – Under **OpenTelemetry**, copy the **URL**, **User**, and **Password** (or create an API key)
4. **Profiles (Pyroscope)** – Under **Pyroscope** (or **Profiles**), copy the **URL**, **User**, and **Password**

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and replace the placeholders with your values. Use `KEY=value` format (no `export`). For example:

```env
# Traces (from Grafana Cloud → OpenTelemetry / Tempo)
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
OTEL_EXPORTER_OTLP_ENDPOINT=https://tempo-PROD-XX-XXXXX.grafana.net
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic YOUR_BASE64_CREDENTIALS

# Profiles (from Grafana Cloud → Pyroscope / Profiles)
PYROSCOPE_URL=https://pyroscope-prod-XX-XXXXX.grafana.net
PYROSCOPE_BASIC_AUTH_USER=YOUR_STACK_USER_ID
PYROSCOPE_BASIC_AUTH_PASSWORD=YOUR_API_KEY
```

For `OTEL_EXPORTER_OTLP_HEADERS`, generate the Base64 value:

```bash
echo -n 'YOUR_STACK_USER_ID:YOUR_API_KEY' | base64
```

Paste the result after `Authorization=Basic ` (no quotes).

### 3. Install and run

```bash
npm run install:all
npm run start:all
```

### 4. Generate traffic

In another terminal:

```bash
npm run load
```

**Or** run services and load generator together in one command:

```bash
npm run start:with-load
```

### 5. Explore in Grafana Cloud

Open your Grafana Cloud instance and go to **Explore** → select **Tempo** (traces), **Loki** (logs), or **Pyroscope** (profiles). Filter by `service.name` (e.g. `api-gateway`, `backend`).

---

## Running Locally

For local development without Grafana Cloud, use Docker to run Tempo, Pyroscope, and Grafana.

```bash
cp .env.local.example .env   # optional, for local overrides
```

### Option A: OpenTelemetry Collector

```bash
docker compose up -d
```

### Option B: Grafana Alloy (recommended for production-like setup)

[Grafana Alloy](https://grafana.com/oss/alloy-opentelemetry-collector/) is Grafana's recommended collector distribution.

```bash
docker compose -f docker-compose-alloy.yml up -d
```

### Run the apps

```bash
npm run install:all
npm run start:all
npm run load
```

Or run services and load generator together: `npm run start:with-load`

Open Grafana at **http://localhost:3030** → Explore → Tempo (traces), Loki (logs), or Pyroscope (profiles).

### Full stack in Docker (apps + local stack + load generator)

```bash
docker compose --profile full up -d
```

---

## Environment Variables

| Variable | Description | Default (local) |
|----------|-------------|-----------------|
| `OTEL_SERVICE_NAME` | Service name for traces | `api-gateway` or `backend` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP endpoint for traces | `http://localhost:4318` |
| `OTEL_EXPORTER_OTLP_HEADERS` | Auth headers (e.g. Basic) | (none) |
| `PYROSCOPE_URL` | Pyroscope server URL | `http://localhost:4040` |
| `PYROSCOPE_BASIC_AUTH_USER` | Pyroscope basic auth user | (none) |
| `PYROSCOPE_BASIC_AUTH_PASSWORD` | Pyroscope basic auth password | (none) |
| `BACKEND_URL` | Backend service URL (for gateway) | `http://localhost:3001` |
| `OTEL_METRICS_ENABLED` | Enable OTLP metrics export | `true` (set to `false` to disable) |
| `OTEL_LOGS_ENABLED` | Enable OTLP logs export to Loki | `true` (set to `false` to disable) |

## Load Generator

Sustained traffic populates traces and profiles:

```bash
# Run services + load generator together (single command)
npm run start:with-load

# Node.js script (built-in) – run in a separate terminal after start:all
npm run load
# Or: node scripts/load-generator.js --url=http://localhost:3000 --interval=500

# k6 (install: brew install k6)
k6 run k6/load-test.js
```

## Profiling and Tracing Together

Profiling and tracing complement each other:

- **Traces** show where time is spent across services (latency, spans).
- **Profiles** show CPU usage and call stacks inside each service.

Use the same `service.name` for a service in both systems so you can correlate traces and profiles in Grafana (e.g. via trace-to-profile links).

## Project Structure

```
profiles-project/
├── services/
│   ├── api-gateway/     # Express app that proxies to backend
│   └── backend/        # Express app with data endpoints
├── instrumentation/    # Shared OpenTelemetry + Pyroscope setup
├── alloy/              # Grafana Alloy configs
│   ├── config.alloy        # Grafana Cloud (default)
│   └── config.local.alloy # Local dev (Tempo, Loki)
├── grafana/            # Dashboards and provisioning
├── k6/                 # k6 load test script
├── k8s/                # Kubernetes manifests
├── scripts/            # Load generator, etc.
├── loki-config.yaml    # Loki config for local dev
├── .env.example        # Grafana Cloud template (default)
├── .env.local.example  # Local dev template
└── README.md
```

## Troubleshooting

### No data in Grafana Cloud (traces, logs, or profiles)

1. **Verify your config:**
   ```bash
   node scripts/verify-otel-config.js
   ```

2. **Check .env is loaded** – `npm run start:all` loads `.env` from the project root. Ensure `.env` exists and contains your values (copy from `.env.example`).

3. **OTEL_EXPORTER_OTLP_ENDPOINT** – Must be the full URL from Grafana Cloud:
   - Go to your stack → **Connections** → **OpenTelemetry** (or **Add new connection**)
   - Copy the **URL** exactly (e.g. `https://tempo-us-central1-XXXXX.grafana.net`)
   - Do **not** add `/v1/traces` – the SDK appends it

4. **OTEL_EXPORTER_OTLP_HEADERS** – Format: `Authorization=Basic BASE64_STRING`
   - Generate Base64: `echo -n 'YOUR_USER_ID:YOUR_API_KEY' | base64`
   - Set: `OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic <paste_result>`
   - No spaces around `=`, no quotes around the Base64 value

5. **Generate traffic** – Run `npm run load` in another terminal. No requests = no data.

6. **Time range in Grafana** – In Explore, set the time range to **Last 15 minutes** or **Last 1 hour**.

7. **Correct datasource** – In Explore, select **Tempo** (traces), **Loki** (logs), or **Pyroscope** (profiles), not a different datasource.

8. **TraceQL query** – For Tempo, try: `{ resource.service.name = "api-gateway" }` or `{ resource.service.name = "backend" }`

9. **Debug mode** – Run with `OTEL_LOG_LEVEL=debug` to see export activity:
   ```bash
   OTEL_LOG_LEVEL=debug npm run start:all
   ```

10. **validate-env passes but no traces/logs** – Try immediate export (bypasses batching):
    ```bash
    OTEL_SPAN_PROCESSOR=simple npm run start:all
    ```
    Then run `npm run load` and check Tempo/Loki. If data appears, the batch processor was the issue. Revert to default (remove the env var) for production.

### No traces in Tempo (local)

- Verify OTLP endpoint: apps send to `OTEL_EXPORTER_OTLP_ENDPOINT`.
- For local: use `http://opentelemetry-collector:4318` or `http://alloy:4318` when running in Docker.

### No profiles in Pyroscope

- Ensure `PYROSCOPE_URL` is set and valid. Disable with `PYROSCOPE_URL=false`.
- For Grafana Cloud: set `PYROSCOPE_BASIC_AUTH_USER` and `PYROSCOPE_BASIC_AUTH_PASSWORD`.
- Debug: `DEBUG=pyroscope node services/api-gateway/index.js` for verbose Pyroscope logs.

### Native module / Electron error

- Run from a regular terminal with standard Node.js (not Cursor's embedded Node). The `@pyroscope/nodejs` package uses native bindings that may fail in Electron.

### Metrics not appearing

- Metrics are optional. Set `OTEL_METRICS_ENABLED=false` to disable. The OTLP collector must be configured to receive and forward metrics (see `otel-config.yaml`).

### No logs in Loki

- Logs are optional. Set `OTEL_LOGS_ENABLED=false` to disable. For local: ensure Loki is running and the collector/Alloy forwards logs to it. For Grafana Cloud: the same OTLP endpoint routes logs to Loki.

## Linting

```bash
npm run lint
```

To use pre-commit hooks: `pip install pre-commit && pre-commit install`

## Validate .env (Grafana Cloud)

Before running, validate that your `.env` credentials work:

```bash
npm run validate-env
```

This sends a test trace to Grafana Cloud and verifies Pyroscope auth. Exits 0 on success, 1 on failure.

For a quick config check (no network): `node scripts/verify-otel-config.js`
