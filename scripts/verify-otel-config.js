#!/usr/bin/env node
/**
 * Verifies OTLP and Pyroscope configuration for Grafana Cloud.
 * Run: node scripts/verify-otel-config.js
 * Loads .env from project root if present.
 */

const path = require('path');
const fs = require('fs');

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
const pyroscopeUrl = process.env.PYROSCOPE_URL;
const pyroscopeUser = process.env.PYROSCOPE_BASIC_AUTH_USER;
const pyroscopePass = process.env.PYROSCOPE_BASIC_AUTH_PASSWORD;

console.log('=== OTLP (Traces, Metrics, Logs) ===');
console.log('OTEL_EXPORTER_OTLP_ENDPOINT:', endpoint || '(not set - will use http://localhost:4318)');
console.log('OTEL_EXPORTER_OTLP_PROTOCOL:', process.env.OTEL_EXPORTER_OTLP_PROTOCOL || '(not set)');
console.log('OTEL_EXPORTER_OTLP_HEADERS:', headers ? `${headers.substring(0, 30)}...` : '(not set)');

if (endpoint && endpoint.includes('grafana.net')) {
  if (!endpoint.startsWith('https://')) {
    console.log('  ⚠️  WARNING: Grafana Cloud endpoint should start with https://');
  }
  if (!headers || !headers.includes('Authorization')) {
    console.log('  ⚠️  WARNING: Grafana Cloud requires OTEL_EXPORTER_OTLP_HEADERS with Authorization');
  }
  if (headers) {
    const match = headers.match(/Authorization=Basic\s*([^\s,]+)/);
    if (match) {
      try {
        const decoded = Buffer.from(match[1], 'base64').toString('utf8');
        if (/^\d+:.+$/.test(decoded)) {
          console.log('  ✓ Auth format looks correct (user:apiKey)');
        } else {
          console.log('  ⚠️  Base64 decoded but format unexpected - expect "user:apiKey"');
        }
      } catch (e) {
        console.log('  ⚠️  Could not decode Base64 - check formatting (no spaces, correct padding)');
      }
    }
  }
}

console.log('\n=== Pyroscope (Profiles) ===');
console.log('PYROSCOPE_URL:', pyroscopeUrl || '(not set)');
console.log('PYROSCOPE_BASIC_AUTH_USER:', pyroscopeUser ? '***' : '(not set)');
console.log('PYROSCOPE_BASIC_AUTH_PASSWORD:', pyroscopePass ? '***' : '(not set)');

if (pyroscopeUrl && pyroscopeUrl.includes('grafana.net')) {
  if (!pyroscopeUser || !pyroscopePass) {
    console.log('  ⚠️  WARNING: Grafana Cloud Pyroscope requires BASIC_AUTH_USER and BASIC_AUTH_PASSWORD');
  }
}

console.log('\n=== Quick Test ===');
console.log('1. Ensure apps are running: npm run start:all');
console.log('2. Generate traffic: npm run load');
console.log('3. In Grafana Cloud: Explore → Tempo (traces), Loki (logs), Pyroscope (profiles)');
console.log('4. Set time range to "Last 15 minutes" or "Last 1 hour"');
console.log('5. For traces: try TraceQL query: { resource.service.name = "api-gateway" }');
