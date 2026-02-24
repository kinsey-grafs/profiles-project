#!/usr/bin/env node
/**
 * Validates that .env credentials work by sending a test trace to Grafana Cloud.
 * Run: node scripts/validate-env.js
 * Exits 0 on success, 1 on failure.
 */

const path = require('path');
const fs = require('fs');

// Load .env
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) {
      const key = m[1].trim();
      const val = m[2].trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  });
}

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
const headers = process.env.OTEL_EXPORTER_OTLP_HEADERS;

async function validateOtlp() {
  if (!endpoint || !endpoint.includes('grafana.net')) {
    console.log('Skipping OTLP validation (not configured for Grafana Cloud)');
    return { ok: true, skip: true };
  }

  if (!headers || !headers.includes('Authorization')) {
    console.error('OTLP validation failed: OTEL_EXPORTER_OTLP_HEADERS required for Grafana Cloud');
    return { ok: false };
  }

  // Parse headers (same logic as instrumentation)
  const parseHeaders = (headerStr) => {
    const h = {};
    headerStr.split(',').forEach((pair) => {
      const idx = pair.indexOf('=');
      if (idx === -1) return;
      const key = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      if (key && value) h[key] = value;
    });
    return h;
  };

  const baseUrl = endpoint.startsWith('http') ? endpoint : `https://${endpoint}`;
  const normalized = baseUrl.replace(/\/$/, '');
  const tracesUrl = normalized.includes('/v1/traces') ? normalized : normalized + '/v1/traces';
  const authHeaders = parseHeaders(headers);

  if (!authHeaders?.Authorization) {
    console.error('OTLP validation failed: Could not parse Authorization header');
    return { ok: false };
  }

  // Direct HTTP POST to verify auth - the SDK's forceFlush doesn't wait for export
  const minimalOtlpTrace = { resourceSpans: [] };
  try {
    const res = await fetch(tracesUrl, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(minimalOtlpTrace),
    });
    if (res.status === 401 || res.status === 403) {
      console.error('OTLP validation failed: Auth rejected (401/403)');
      return { ok: false };
    }
    if (res.status >= 400) {
      console.error(`OTLP validation failed: ${res.status} ${res.statusText}`);
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    console.error('OTLP validation failed:', err.message);
    return { ok: false };
  }
}

async function validatePyroscope() {
  const pyroscopeUrl = process.env.PYROSCOPE_URL;
  const user = process.env.PYROSCOPE_BASIC_AUTH_USER;
  const pass = process.env.PYROSCOPE_BASIC_AUTH_PASSWORD;

  if (!pyroscopeUrl || !pyroscopeUrl.includes('grafana.net')) {
    console.log('Skipping Pyroscope validation (not configured for Grafana Cloud)');
    return { ok: true, skip: true };
  }

  if (!user || !pass) {
    console.error('Pyroscope validation failed: PYROSCOPE_BASIC_AUTH_USER and _PASSWORD required');
    return { ok: false };
  }

  // Pyroscope has a /ready or /ingest endpoint - try a simple auth check
  const ingestUrl = pyroscopeUrl.replace(/\/$/, '') + '/ingest';
  const auth = Buffer.from(`${user}:${pass}`).toString('base64');

  try {
    const res = await fetch(ingestUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ appName: 'env-validation', profile: 'dGVzdA==', sampleType: 'cpu' }),
    });
    // 200, 202, or even 400 (bad payload) means auth worked
    if (res.status === 401 || res.status === 403) {
      console.error('Pyroscope validation failed: Auth rejected (401/403)');
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    console.error('Pyroscope validation failed:', err.message);
    return { ok: false };
  }
}

async function main() {
  console.log('Validating .env configuration...\n');

  const otlpResult = await validateOtlp();
  if (!otlpResult.ok) {
    console.log('\n❌ Validation failed. Fix .env and try again.');
    process.exit(1);
  }
  if (!otlpResult.skip) {
    console.log('✓ OTLP (traces/metrics/logs): connection successful');
  }

  const pyroscopeResult = await validatePyroscope();
  if (!pyroscopeResult.ok) {
    console.log('\n❌ Validation failed. Fix .env and try again.');
    process.exit(1);
  }
  if (!pyroscopeResult.skip) {
    console.log('✓ Pyroscope: credentials accepted');
  }

  console.log('\n✓ All validations passed. Your .env is working.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Validation error:', err);
  process.exit(1);
});
