/**
 * Shared instrumentation: OpenTelemetry tracing + Pyroscope CPU profiling.
 * Require this module at the very top of your application entry point, before any other imports.
 *
 * Supports local (OTLP collector + Pyroscope) and Grafana Cloud.
 */

const api = require('@opentelemetry/api');
const { diag, DiagConsoleLogger, DiagLogLevel } = require('@opentelemetry/api');
const logsApi = require('@opentelemetry/api-logs');
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');

// Enable OTEL SDK internal logs when OTEL_LOG_LEVEL is set (debug, verbose, all)
const otelLogLevel = process.env.OTEL_LOG_LEVEL?.toLowerCase();
if (otelLogLevel) {
  const levelMap = {
    none: DiagLogLevel.NONE,
    error: DiagLogLevel.ERROR,
    warn: DiagLogLevel.WARN,
    info: DiagLogLevel.INFO,
    debug: DiagLogLevel.DEBUG,
    verbose: DiagLogLevel.VERBOSE,
    all: DiagLogLevel.ALL,
  };
  const level = levelMap[otelLogLevel] ?? DiagLogLevel.INFO;
  diag.setLogger(new DiagConsoleLogger(), level);
}
const { BatchSpanProcessor, SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-base');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
const { OTLPLogExporter } = require('@opentelemetry/exporter-logs-otlp-http');
const { LoggerProvider, BatchLogRecordProcessor } = require('@opentelemetry/sdk-logs');
const { Resource } = require('@opentelemetry/resources');
const { MeterProvider, PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
const { registerInstrumentations } = require('@opentelemetry/instrumentation');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const Pyroscope = require('@pyroscope/nodejs');

const { SeverityNumber } = logsApi;

const DEFAULT_OTLP_ENDPOINT = 'http://localhost:4318'; // OTLP HTTP (4317 is gRPC)
const DEFAULT_PYROSCOPE_URL = 'http://localhost:4040';

/**
 * Check if Pyroscope profiling should be enabled.
 * @returns {{ enabled: boolean, reason: string }}
 */
function isPyroscopeEnabled() {
  const url = process.env.PYROSCOPE_URL || DEFAULT_PYROSCOPE_URL;
  if (!url || url === 'false' || url === 'disabled') {
    return { enabled: false, reason: 'PYROSCOPE_URL not set or disabled' };
  }
  try {
    new URL(url);
  } catch {
    return { enabled: false, reason: `Invalid PYROSCOPE_URL: ${url}` };
  }
  return { enabled: true, reason: `Configured: ${url}` };
}

/**
 * Create SourceMapper for Pyroscope if available (improves flamegraph readability with source maps).
 * @param {string[]} [rootDirs] - Directories to search for source maps (default: ['.'])
 * @returns {Promise<object|undefined>}
 */
async function createSourceMapper(rootDirs = ['.']) {
  const SourceMapper = Pyroscope.default?.SourceMapper ?? Pyroscope.SourceMapper;
  if (!SourceMapper || typeof SourceMapper.create !== 'function') {
    return undefined;
  }
  try {
    return await SourceMapper.create(rootDirs);
  } catch (err) {
    console.warn('[instrumentation] SourceMapper create failed:', err.message);
    return undefined;
  }
}

/**
 * Initialize OpenTelemetry tracing.
 * @param {string} serviceName - Service name for traces (e.g. 'api-gateway', 'backend')
 * @returns {Promise<{ api: object, tracer: object }>}
 */
async function initTracing(serviceName) {
  const endpoint =
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT || DEFAULT_OTLP_ENDPOINT;
  const headers = parseOtlpHeaders(process.env.OTEL_EXPORTER_OTLP_HEADERS);

  // Don't pass url - let the exporter use OTEL_EXPORTER_OTLP_ENDPOINT from env
  // so it correctly appends /v1/traces (e.g. .../otlp -> .../otlp/v1/traces)
  const exporterConfig = {};
  if (headers && Object.keys(headers).length > 0) {
    exporterConfig.headers = headers;
  }

  const exporter = new OTLPTraceExporter(exporterConfig);
  const resource = new Resource({
    'service.name': serviceName,
    ...parseResourceAttributes(process.env.OTEL_RESOURCE_ATTRIBUTES),
  });

  const provider = new NodeTracerProvider({ resource });
  const spanProcessor =
    process.env.OTEL_SPAN_PROCESSOR === 'simple'
      ? new SimpleSpanProcessor(exporter)
      : new BatchSpanProcessor(exporter);
  provider.addSpanProcessor(spanProcessor);
  provider.register();

  registerInstrumentations({
    instrumentations: [getNodeAutoInstrumentations()],
  });

  // Optional: initialize metrics (request duration, etc.)
  if (process.env.OTEL_METRICS_ENABLED !== 'false') {
    initMetrics(serviceName, endpoint, headers);
  }

  // Optional: initialize logs (OTLP to Loki/Grafana Cloud)
  if (process.env.OTEL_LOGS_ENABLED !== 'false') {
    initLogging(serviceName, endpoint, headers);
  }

  return {
    api,
    tracer: api.trace.getTracer(serviceName),
  };
}

/**
 * Initialize OpenTelemetry metrics (optional).
 * @param {string} serviceName
 * @param {string} endpoint
 * @param {object} [headers]
 */
function initMetrics(serviceName, endpoint, headers) {
  try {
    const { metrics } = require('@opentelemetry/api');
    const exporterConfig = {};
    if (headers && Object.keys(headers).length > 0) exporterConfig.headers = headers;
    const reader = new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter(exporterConfig),
      exportIntervalMillis: 60000,
    });
    const provider = new MeterProvider({
      resource: new Resource({ 'service.name': serviceName }),
      readers: [reader],
    });
    metrics.setGlobalMeterProvider(provider);
  } catch (err) {
    if (process.env.DEBUG?.includes('otel')) {
      console.debug('[instrumentation] Metrics init skipped:', err.message);
    }
  }
}

/**
 * Initialize OpenTelemetry logs (optional). Sends logs via OTLP to Loki (Grafana Cloud) or collector.
 * @param {string} serviceName
 * @param {string} endpoint
 * @param {object} [headers]
 */
function initLogging(serviceName, endpoint, headers) {
  try {
    const exporterConfig = {};
    if (headers && Object.keys(headers).length > 0) exporterConfig.headers = headers;
    const exporter = new OTLPLogExporter(exporterConfig);
    const provider = new LoggerProvider({
      resource: new Resource({ 'service.name': serviceName }),
      processors: [new BatchLogRecordProcessor(exporter)],
    });
    logsApi.logs.setGlobalLoggerProvider(provider);
  } catch (err) {
    if (process.env.DEBUG?.includes('otel')) {
      console.debug('[instrumentation] Logs init skipped:', err.message);
    }
  }
}

/**
 * Get a logger for the given service. Logs to console and exports via OTLP when enabled.
 * @param {string} serviceName - Service name (e.g. 'api-gateway', 'backend')
 * @returns {{ info: Function, warn: Function, error: Function }}
 */
function getLogger(serviceName) {
  const logger = logsApi.logs.getLogger(serviceName, '1.0.0');

  const emit = (severityNumber, severityText, msg, attrs = {}) => {
    const body = typeof msg === 'string' ? msg : JSON.stringify(msg);
    const attributes = { 'service.name': serviceName, ...attrs };
    try {
      logger.emit({ severityNumber, severityText, body, attributes });
    } catch (_) { /* no-op if provider not set */ }
    const prefix = `[${serviceName}] ${severityText}:`;
    if (severityNumber >= SeverityNumber.ERROR) {
      console.error(prefix, body);
    } else if (severityNumber >= SeverityNumber.WARN) {
      console.warn(prefix, body);
    } else {
      console.log(prefix, body);
    }
  };

  return {
    info: (msg, attrs) => emit(SeverityNumber.INFO, 'INFO', msg, attrs),
    warn: (msg, attrs) => emit(SeverityNumber.WARN, 'WARN', msg, attrs),
    error: (msg, attrs) => emit(SeverityNumber.ERROR, 'ERROR', msg, attrs),
  };
}

/**
 * Initialize Pyroscope CPU profiling (only if enabled and properly configured).
 * Enables wall profiles with CPU time for flamegraphs.
 * @param {string} appName - App name for Pyroscope (use same as service.name for correlation)
 * @param {object} [extraTags] - Additional static tags
 * @param {object} [options] - Options: { sourceMapperRootDirs: ['.'] } to enable source map resolution
 * @returns {Promise<{ enabled: boolean, reason?: string }>}
 */
async function initPyroscope(appName, extraTags = {}, options = {}) {
  const { enabled, reason } = isPyroscopeEnabled();

  if (!enabled) {
    if (process.env.DEBUG?.includes('pyroscope')) {
      console.debug(`[instrumentation] Pyroscope not initialized - ${reason}`);
    }
    return { enabled: false, reason };
  }

  try {
    const serverAddress =
      process.env.PYROSCOPE_URL || DEFAULT_PYROSCOPE_URL;
    const tags = {
      namespace: process.env.KUBERNETES_NAMESPACE || process.env.NAMESPACE || 'local',
      cluster: process.env.KUBERNETES_CLUSTER || 'local',
      pod: process.env.POD_UID || 'local',
      ...extraTags,
    };

    const config = {
      serverAddress,
      appName,
      wall: {
        collectCpuTime: true, // Required for CPU profiling
      },
      tags,
    };

    if (process.env.PYROSCOPE_BASIC_AUTH_USER && process.env.PYROSCOPE_BASIC_AUTH_PASSWORD) {
      config.basicAuthUser = process.env.PYROSCOPE_BASIC_AUTH_USER;
      config.basicAuthPassword = process.env.PYROSCOPE_BASIC_AUTH_PASSWORD;
    }

    const rootDirs = options.sourceMapperRootDirs ?? ['.'];
    if (rootDirs.length > 0) {
      const sourceMapper = await createSourceMapper(rootDirs);
      if (sourceMapper) {
        config.sourceMapper = sourceMapper;
      }
    }

    Pyroscope.init(config);
    Pyroscope.start();

    if (process.env.DEBUG?.includes('pyroscope')) {
      console.debug(`[instrumentation] Pyroscope started for ${appName}, tags=${JSON.stringify(tags)}`);
    }

    return { enabled: true };
  } catch (error) {
    console.error('[instrumentation] Failed to initialize Pyroscope:', error.message);
    return { enabled: false, reason: error.message };
  }
}

function parseOtlpHeaders(headerStr) {
  if (!headerStr || typeof headerStr !== 'string') return undefined;
  const headers = {};
  headerStr.split(',').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (key && value) headers[key] = value;
  });
  return Object.keys(headers).length ? headers : undefined;
}

function parseResourceAttributes(attrStr) {
  if (!attrStr || typeof attrStr !== 'string') return {};
  const attrs = {};
  attrStr.split(',').forEach((pair) => {
    const [key, value] = pair.split('=').map((s) => s.trim());
    if (key && value) attrs[key] = value;
  });
  return attrs;
}

module.exports = {
  initTracing,
  initPyroscope,
  initLogging,
  getLogger,
  isPyroscopeEnabled,
  createSourceMapper,
};
