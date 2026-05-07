import BaseManager from './BaseManager.js';
import logger from '../utils/logger.js';
import type { WikiEngine } from '../types/WikiEngine.js';
import type ConfigurationManager from './ConfigurationManager.js';
import type { Request, Response, RequestHandler } from 'express';

// OpenTelemetry imports
import { metrics, type Meter, type Counter, type Histogram, type ObservableGauge } from '@opentelemetry/api';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';

/**
 * MetricsManager - OpenTelemetry metrics with Prometheus export
 *
 * Provides application-level observability for page load times, index rebuild
 * duration, save throughput, and HTTP request metrics. When disabled, all
 * recording methods are no-ops.
 *
 * @class MetricsManager
 * @extends BaseManager
 */
class MetricsManager extends BaseManager {
  private enabled: boolean = false;
  private meterProvider: MeterProvider | null = null;
  private prometheusExporter: PrometheusExporter | null = null;
  private otlpReader: PeriodicExportingMetricReader | null = null;
  private meter: Meter | null = null;
  private prefix: string = 'ngdpbase';

  // Counters
  private pageViewsTotal: Counter | null = null;
  private pageSavesTotal: Counter | null = null;
  private pageDeletesTotal: Counter | null = null;
  private searchRebuildsTotal: Counter | null = null;
  private pageIndexSavesTotal: Counter | null = null;
  private loginAttemptsTotal: Counter | null = null;
  private httpRequestsTotal: Counter | null = null;
  private cacheLookupsTotal: Counter | null = null;

  // Histograms
  private pageViewDuration: Histogram | null = null;
  private pageSaveDuration: Histogram | null = null;
  private pageDeleteDuration: Histogram | null = null;
  private searchRebuildDuration: Histogram | null = null;
  private pageIndexSaveDuration: Histogram | null = null;
  private engineInitDuration: Histogram | null = null;
  private httpRequestDuration: Histogram | null = null;

  // Observable gauges (process memory — one process.memoryUsage() call per
  // scrape via batch callback, see #610)
  private processResidentMemory: ObservableGauge | null = null;
  private processHeapTotal: ObservableGauge | null = null;
  private processHeapUsed: ObservableGauge | null = null;
  private processExternalMemory: ObservableGauge | null = null;
  private processArrayBuffers: ObservableGauge | null = null;

  constructor(engine: WikiEngine) {
    super(engine);
  }

  async initialize(_config: Record<string, unknown> = {}): Promise<void> {
    await super.initialize(_config);

    const configManager = this.engine.getManager<ConfigurationManager>('ConfigurationManager');
    if (!configManager) {
      logger.warn('[MetricsManager] ConfigurationManager not available, metrics disabled');
      return;
    }

    this.enabled = configManager.getProperty('ngdpbase.telemetry.enabled', false) as boolean;

    if (!this.enabled) {
      logger.info('[MetricsManager] Telemetry disabled by configuration');
      return;
    }

    // Derive metric prefix from applicationName (sanitized for Prometheus)
    const appName = configManager.getProperty('ngdpbase.application-name', 'ngdpbase') as string;
    this.prefix = appName.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');

    try {
      const port = configManager.getProperty('ngdpbase.telemetry.metrics.port', 9464) as number;
      const host = configManager.getProperty('ngdpbase.telemetry.metrics.host', '0.0.0.0') as string;
      const metricsPath = configManager.getProperty('ngdpbase.telemetry.metrics.path', '/metrics') as string;
      const interval = configManager.getProperty('ngdpbase.telemetry.metrics.interval', 15000) as number;

      this.prometheusExporter = new PrometheusExporter({
        port,
        host,
        endpoint: metricsPath
      });

      // Build readers array: always Prometheus, optionally OTLP
      const readers: (PrometheusExporter | PeriodicExportingMetricReader)[] = [this.prometheusExporter];

      const otlpEnabled = configManager.getProperty('ngdpbase.telemetry.otlp.enabled', false) as boolean;
      const otlpEndpoint = configManager.getProperty('ngdpbase.telemetry.otlp.endpoint', '') as string;

      if (otlpEnabled && otlpEndpoint) {
        const otlpHeaders = configManager.getProperty('ngdpbase.telemetry.otlp.headers', {}) as Record<string, string>;
        const otlpInterval = configManager.getProperty('ngdpbase.telemetry.otlp.interval', 15000) as number;
        const otlpTimeout = configManager.getProperty('ngdpbase.telemetry.otlp.timeout', 30000) as number;

        const otlpExporter = new OTLPMetricExporter({
          url: otlpEndpoint,
          headers: otlpHeaders,
          timeoutMillis: otlpTimeout
        });

        this.otlpReader = new PeriodicExportingMetricReader({
          exporter: otlpExporter,
          exportIntervalMillis: otlpInterval,
          exportTimeoutMillis: otlpTimeout
        });

        readers.push(this.otlpReader);
        logger.info(`[MetricsManager] OTLP metric export enabled → ${otlpEndpoint} (interval: ${otlpInterval}ms)`);
      }

      const serviceName = configManager.getProperty('ngdpbase.telemetry.service-name', this.prefix) as string;

      this.meterProvider = new MeterProvider({
        resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: serviceName }),
        readers
      });

      metrics.setGlobalMeterProvider(this.meterProvider);
      this.meter = this.meterProvider.getMeter(this.prefix, '1.0.0');

      this.createInstruments();

      logger.info(`[MetricsManager] Prometheus metrics available at http://${host}:${port}${metricsPath} (interval: ${interval}ms)`);
    } catch (err) {
      logger.error('[MetricsManager] Failed to initialize metrics:', err);
      this.enabled = false;
    }
  }

  private createInstruments(): void {
    if (!this.meter) return;

    // Counters
    this.pageViewsTotal = this.meter.createCounter(`${this.prefix}_page_views_total`, {
      description: 'Total number of page views'
    });
    this.pageSavesTotal = this.meter.createCounter(`${this.prefix}_page_saves_total`, {
      description: 'Total number of page saves'
    });
    this.pageDeletesTotal = this.meter.createCounter(`${this.prefix}_page_deletes_total`, {
      description: 'Total number of page deletes'
    });
    this.searchRebuildsTotal = this.meter.createCounter(`${this.prefix}_search_rebuilds_total`, {
      description: 'Total number of search index rebuilds'
    });
    this.pageIndexSavesTotal = this.meter.createCounter(`${this.prefix}_page_index_saves_total`, {
      description: 'Total number of page index saves'
    });
    this.loginAttemptsTotal = this.meter.createCounter(`${this.prefix}_login_attempts_total`, {
      description: 'Total number of login attempts'
    });
    this.httpRequestsTotal = this.meter.createCounter(`${this.prefix}_http_requests_total`, {
      description: 'Total number of HTTP requests'
    });
    // #620: identity-cache hit/miss telemetry. Attributes:
    //   manager — RoleManager | PersonManager | OrganizationManager
    //   cache   — short cache key name (memberCache, byIdentifier, ...)
    //   result  — 'hit' | 'miss'
    this.cacheLookupsTotal = this.meter.createCounter(`${this.prefix}_cache_lookups_total`, {
      description: 'Identity-manager cache lookups (hit/miss) — see #620'
    });

    // Histograms
    this.pageViewDuration = this.meter.createHistogram(`${this.prefix}_page_view_duration_ms`, {
      description: 'Page view duration in milliseconds',
      unit: 'ms'
    });
    this.pageSaveDuration = this.meter.createHistogram(`${this.prefix}_page_save_duration_ms`, {
      description: 'Page save duration in milliseconds',
      unit: 'ms'
    });
    this.pageDeleteDuration = this.meter.createHistogram(`${this.prefix}_page_delete_duration_ms`, {
      description: 'Page delete duration in milliseconds',
      unit: 'ms'
    });
    this.searchRebuildDuration = this.meter.createHistogram(`${this.prefix}_search_rebuild_duration_ms`, {
      description: 'Search index rebuild duration in milliseconds',
      unit: 'ms'
    });
    this.pageIndexSaveDuration = this.meter.createHistogram(`${this.prefix}_page_index_save_duration_ms`, {
      description: 'Page index save duration in milliseconds',
      unit: 'ms'
    });
    this.engineInitDuration = this.meter.createHistogram(`${this.prefix}_engine_init_duration_ms`, {
      description: 'Engine initialization duration in milliseconds',
      unit: 'ms'
    });
    this.httpRequestDuration = this.meter.createHistogram(`${this.prefix}_http_request_duration_ms`, {
      description: 'HTTP request duration in milliseconds',
      unit: 'ms'
    });

    // Observable gauges for process memory (#610). Five separate gauges
    // observed via a single batch callback so process.memoryUsage() is only
    // called once per scrape interval.
    this.processResidentMemory = this.meter.createObservableGauge(`${this.prefix}_process_resident_memory_bytes`, {
      description: 'Resident set size (RSS) of the Node.js process in bytes',
      unit: 'bytes'
    });
    this.processHeapTotal = this.meter.createObservableGauge(`${this.prefix}_process_heap_total_bytes`, {
      description: 'Total V8 heap size in bytes',
      unit: 'bytes'
    });
    this.processHeapUsed = this.meter.createObservableGauge(`${this.prefix}_process_heap_used_bytes`, {
      description: 'Used V8 heap size in bytes',
      unit: 'bytes'
    });
    this.processExternalMemory = this.meter.createObservableGauge(`${this.prefix}_process_external_memory_bytes`, {
      description: 'Memory used by C++ objects bound to JavaScript objects, in bytes',
      unit: 'bytes'
    });
    this.processArrayBuffers = this.meter.createObservableGauge(`${this.prefix}_process_array_buffers_bytes`, {
      description: 'Memory allocated for ArrayBuffers and SharedArrayBuffers, in bytes',
      unit: 'bytes'
    });

    this.meter.addBatchObservableCallback(
      (result) => {
        const mem = process.memoryUsage();
        if (this.processResidentMemory) result.observe(this.processResidentMemory, mem.rss);
        if (this.processHeapTotal) result.observe(this.processHeapTotal, mem.heapTotal);
        if (this.processHeapUsed) result.observe(this.processHeapUsed, mem.heapUsed);
        if (this.processExternalMemory) result.observe(this.processExternalMemory, mem.external);
        if (this.processArrayBuffers) result.observe(this.processArrayBuffers, mem.arrayBuffers);
      },
      [
        this.processResidentMemory,
        this.processHeapTotal,
        this.processHeapUsed,
        this.processExternalMemory,
        this.processArrayBuffers
      ]
    );
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  recordPageView(durationMs: number): void {
    this.pageViewsTotal?.add(1);
    this.pageViewDuration?.record(durationMs);
  }

  recordPageSave(durationMs: number): void {
    this.pageSavesTotal?.add(1);
    this.pageSaveDuration?.record(durationMs);
  }

  recordPageDelete(durationMs: number): void {
    this.pageDeletesTotal?.add(1);
    this.pageDeleteDuration?.record(durationMs);
  }

  recordSearchRebuild(durationMs: number): void {
    this.searchRebuildsTotal?.add(1);
    this.searchRebuildDuration?.record(durationMs);
  }

  recordPageIndexSave(durationMs: number): void {
    this.pageIndexSavesTotal?.add(1);
    this.pageIndexSaveDuration?.record(durationMs);
  }

  recordLoginAttempt(): void {
    this.loginAttemptsTotal?.add(1);
  }

  recordEngineInit(durationMs: number): void {
    this.engineInitDuration?.record(durationMs);
  }

  recordHttpRequest(durationMs: number, attributes: { method: string; route: string; status: string }): void {
    this.httpRequestsTotal?.add(1, attributes);
    this.httpRequestDuration?.record(durationMs, attributes);
  }

  /**
   * Record an identity-manager cache lookup (#620). Cardinality is bounded —
   * 7 caches × 2 results = 14 series — so attributes are safe.
   */
  recordCacheLookup(attributes: { manager: string; cache: string; result: 'hit' | 'miss' }): void {
    this.cacheLookupsTotal?.add(1, attributes);
  }

  /**
   * Returns a handler that serves Prometheus metrics on the main Express app.
   * The PrometheusExporter runs its own HTTP server on a separate port,
   * but this handler allows serving metrics through the main app as well.
   */
  getMetricsHandler(): RequestHandler | null {
    if (!this.prometheusExporter) return null;

    // Delegate to PrometheusExporter's built-in request handler
    const exporter = this.prometheusExporter;
    return (req: Request, res: Response) => {
      exporter.getMetricsRequestHandler(req, res);
    };
  }

  async shutdown(): Promise<void> {
    if (this.otlpReader) {
      try {
        await this.otlpReader.shutdown();
        logger.info('[MetricsManager] OTLP reader shut down');
      } catch (err) {
        logger.error('[MetricsManager] Error shutting down OTLP reader:', err);
      }
      this.otlpReader = null;
    }
    if (this.meterProvider) {
      try {
        await this.meterProvider.shutdown();
        logger.info('[MetricsManager] Meter provider shut down');
      } catch (err) {
        logger.error('[MetricsManager] Error shutting down meter provider:', err);
      }
      this.meterProvider = null;
      this.prometheusExporter = null;
      this.meter = null;
    }
    // Reset global meter provider
    metrics.disable();
    await super.shutdown();
  }
}

export default MetricsManager;

