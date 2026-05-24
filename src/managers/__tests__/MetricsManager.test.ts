
// Mock logger before requiring MetricsManager
vi.mock('../../utils/logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

// Mock OpenTelemetry modules to avoid port conflicts and real metric collection
const mockCounter = { add: vi.fn() };
const mockHistogram = { record: vi.fn() };
const mockObservableGauge = { addCallback: vi.fn(), removeCallback: vi.fn() };
const mockBatchObservableCallback = vi.fn();
const mockMeter = {
  createCounter: vi.fn(() => mockCounter),
  createHistogram: vi.fn(() => mockHistogram),
  createObservableGauge: vi.fn(() => mockObservableGauge),
  addBatchObservableCallback: mockBatchObservableCallback
};
const mockMeterProvider = {
  getMeter: vi.fn(() => mockMeter),
  shutdown: vi.fn().mockResolvedValue(undefined)
};
const mockGetMetricsRequestHandler = vi.fn();
const mockPrometheusExporter = {
  getMetricsRequestHandler: mockGetMetricsRequestHandler
};
const mockOtlpReaderShutdown = vi.fn().mockResolvedValue(undefined);
const mockOtlpReader = {
  shutdown: mockOtlpReaderShutdown
};
const mockOtlpExporter = {};

vi.mock('@opentelemetry/sdk-metrics', () => ({
  MeterProvider: vi.fn(function () { return mockMeterProvider; }),
  PeriodicExportingMetricReader: vi.fn(function () { return mockOtlpReader; })
}));

vi.mock('@opentelemetry/exporter-prometheus', () => ({
  PrometheusExporter: vi.fn(function () { return mockPrometheusExporter; })
}));

vi.mock('@opentelemetry/exporter-metrics-otlp-http', () => ({
  OTLPMetricExporter: vi.fn(function () { return mockOtlpExporter; })
}));

vi.mock('@opentelemetry/resources', () => ({
  resourceFromAttributes: vi.fn((attrs) => ({ attributes: attrs }))
}));

vi.mock('@opentelemetry/semantic-conventions', () => ({
  ATTR_SERVICE_NAME: 'service.name'
}));

vi.mock('@opentelemetry/api', () => ({
  metrics: {
    setGlobalMeterProvider: vi.fn(),
    disable: vi.fn()
  }
}));

import MetricsManager from '../MetricsManager';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';

describe('MetricsManager', () => {
  let manager;
  let mockEngine;
  let mockConfigManager;

  beforeEach(() => {
    vi.clearAllMocks();

    mockConfigManager = {
      getProperty: vi.fn((key, defaultValue) => {
        const config = {
          'ngdpbase.telemetry.enabled': false,
          'ngdpbase.telemetry.metrics.port': 9464,
          'ngdpbase.telemetry.metrics.host': '0.0.0.0',
          'ngdpbase.telemetry.metrics.path': '/metrics',
          'ngdpbase.telemetry.metrics.interval': 15000
        };
        return key in config ? config[key] : defaultValue;
      })
    };

    mockEngine = {
      getManager: vi.fn((name) => {
        if (name === 'ConfigurationManager') return mockConfigManager;
        return undefined;
      })
    };

    manager = new MetricsManager(mockEngine);
  });

  afterEach(async () => {
    if (manager.isInitialized()) {
      await manager.shutdown();
    }
  });

  describe('disabled mode', () => {
    test('should initialize successfully when disabled', async () => {
      await manager.initialize();
      expect(manager.isInitialized()).toBe(true);
      expect(manager.isEnabled()).toBe(false);
    });

    test('should have all record methods as safe no-ops when disabled', async () => {
      await manager.initialize();

      // None of these should throw
      expect(() => manager.recordPageView(100)).not.toThrow();
      expect(() => manager.recordPageSave(200)).not.toThrow();
      expect(() => manager.recordPageDelete(50)).not.toThrow();
      expect(() => manager.recordSearchRebuild(5000)).not.toThrow();
      expect(() => manager.recordPageIndexSave(30)).not.toThrow();
      expect(() => manager.recordLoginAttempt()).not.toThrow();
      expect(() => manager.recordEngineInit(90000)).not.toThrow();
      expect(() => manager.recordHttpRequest(15, {
        method: 'GET', route: '/view/:page', status: '200'
      })).not.toThrow();
    });

    test('should return null from getMetricsHandler when disabled', async () => {
      await manager.initialize();
      expect(manager.getMetricsHandler()).toBeNull();
    });
  });

  describe('enabled mode', () => {
    beforeEach(() => {
      mockConfigManager.getProperty = vi.fn((key, defaultValue) => {
        const config = {
          'ngdpbase.telemetry.enabled': true,
          'ngdpbase.telemetry.metrics.port': 9464,
          'ngdpbase.telemetry.metrics.host': '0.0.0.0',
          'ngdpbase.telemetry.metrics.path': '/metrics',
          'ngdpbase.telemetry.metrics.interval': 15000
        };
        return key in config ? config[key] : defaultValue;
      });
    });

    test('should initialize and create metric instruments when enabled', async () => {
      await manager.initialize();
      expect(manager.isEnabled()).toBe(true);

      // Should create counters and histograms. Counter #8 is cache_lookups_total (#620);
      // counter #9 is import_conversions_total (#738).
      expect(mockMeter.createCounter).toHaveBeenCalledTimes(9);
      expect(mockMeter.createHistogram).toHaveBeenCalledTimes(7);
    });

    test('should create counters with correct names', async () => {
      await manager.initialize();

      const counterNames = (mockMeter.createCounter.mock.calls as Array<[string, ...unknown[]]>).map(c => c[0]);
      expect(counterNames).toContain('ngdpbase_page_views_total');
      expect(counterNames).toContain('ngdpbase_page_saves_total');
      expect(counterNames).toContain('ngdpbase_page_deletes_total');
      expect(counterNames).toContain('ngdpbase_search_rebuilds_total');
      expect(counterNames).toContain('ngdpbase_page_index_saves_total');
      expect(counterNames).toContain('ngdpbase_login_attempts_total');
      expect(counterNames).toContain('ngdpbase_http_requests_total');
      expect(counterNames).toContain('ngdpbase_cache_lookups_total');
    });

    test('should create histograms with correct names', async () => {
      await manager.initialize();

      const histogramNames = (mockMeter.createHistogram.mock.calls as Array<[string, ...unknown[]]>).map(c => c[0]);
      expect(histogramNames).toContain('ngdpbase_page_view_duration_ms');
      expect(histogramNames).toContain('ngdpbase_page_save_duration_ms');
      expect(histogramNames).toContain('ngdpbase_page_delete_duration_ms');
      expect(histogramNames).toContain('ngdpbase_search_rebuild_duration_ms');
      expect(histogramNames).toContain('ngdpbase_page_index_save_duration_ms');
      expect(histogramNames).toContain('ngdpbase_engine_init_duration_ms');
      expect(histogramNames).toContain('ngdpbase_http_request_duration_ms');
    });

    test('should create process memory observable gauges (#610)', async () => {
      await manager.initialize();

      expect(mockMeter.createObservableGauge).toHaveBeenCalledTimes(5);
      const gaugeNames = (mockMeter.createObservableGauge.mock.calls as Array<[string, ...unknown[]]>).map(c => c[0]);
      expect(gaugeNames).toContain('ngdpbase_process_resident_memory_bytes');
      expect(gaugeNames).toContain('ngdpbase_process_heap_total_bytes');
      expect(gaugeNames).toContain('ngdpbase_process_heap_used_bytes');
      expect(gaugeNames).toContain('ngdpbase_process_external_memory_bytes');
      expect(gaugeNames).toContain('ngdpbase_process_array_buffers_bytes');
    });

    test('batch observable callback observes all 5 gauges from a single process.memoryUsage() call (#610)', async () => {
      await manager.initialize();

      expect(mockBatchObservableCallback).toHaveBeenCalledTimes(1);
      const [callback, observedInstruments] = mockBatchObservableCallback.mock.calls[0] as [
        (result: { observe: (gauge: unknown, value: number) => void }) => void,
        unknown[]
      ];

      // Stub process.memoryUsage to a known shape
      const fakeMem = {
        rss: 1234567890,
        heapTotal: 100000000,
        heapUsed: 50000000,
        external: 1000000,
        arrayBuffers: 500000
      };
      const memUsageSpy = vi.spyOn(process, 'memoryUsage').mockReturnValue(fakeMem as ReturnType<typeof process.memoryUsage>);

      const observe = vi.fn();
      callback({ observe });

      // One process.memoryUsage() call per scrape, regardless of gauge count
      expect(memUsageSpy).toHaveBeenCalledTimes(1);
      expect(observe).toHaveBeenCalledTimes(5);
      expect(observedInstruments).toHaveLength(5);

      // Each gauge gets its corresponding metric value
      const observedValues = observe.mock.calls.map(c => c[1]);
      expect(observedValues).toEqual(
        expect.arrayContaining([1234567890, 100000000, 50000000, 1000000, 500000])
      );

      memUsageSpy.mockRestore();
    });

    test('should derive metric prefix from applicationName', async () => {
      mockConfigManager.getProperty = vi.fn((key, defaultValue) => {
        const config = {
          'ngdpbase.telemetry.enabled': true,
          'ngdpbase.application-name': 'jimstest',
          'ngdpbase.telemetry.metrics.port': 9464,
          'ngdpbase.telemetry.metrics.host': '0.0.0.0',
          'ngdpbase.telemetry.metrics.path': '/metrics',
          'ngdpbase.telemetry.metrics.interval': 15000
        };
        return key in config ? config[key] : defaultValue;
      });

      await manager.initialize();

      const counterNames = mockMeter.createCounter.mock.calls.map(c => c[0]);
      expect(counterNames).toContain('jimstest_page_views_total');
      expect(counterNames).toContain('jimstest_http_requests_total');

      const histogramNames = (mockMeter.createHistogram.mock.calls as Array<[string, ...unknown[]]>).map(c => c[0]);
      expect(histogramNames).toContain('jimstest_page_view_duration_ms');

      expect(mockMeterProvider.getMeter).toHaveBeenCalledWith('jimstest', '1.0.0');
    });

    test('should record page view metrics', async () => {
      await manager.initialize();
      manager.recordPageView(150);

      expect(mockCounter.add).toHaveBeenCalledWith(1);
      expect(mockHistogram.record).toHaveBeenCalledWith(150);
    });

    test('should record HTTP request metrics with attributes', async () => {
      await manager.initialize();
      const attrs = { method: 'GET', route: '/view/:page', status: '200' };
      manager.recordHttpRequest(25, attrs);

      expect(mockCounter.add).toHaveBeenCalledWith(1, attrs);
      expect(mockHistogram.record).toHaveBeenCalledWith(25, attrs);
    });

    test('should set service.name resource from telemetry.serviceName config', async () => {

      mockConfigManager.getProperty = vi.fn((key, defaultValue) => {
        const config = {
          'ngdpbase.telemetry.enabled': true,
          'ngdpbase.application-name': 'jimstest',
          'ngdpbase.telemetry.service-name': 'jimstest-wiki',
          'ngdpbase.telemetry.metrics.port': 9464,
          'ngdpbase.telemetry.metrics.host': '0.0.0.0',
          'ngdpbase.telemetry.metrics.path': '/metrics',
          'ngdpbase.telemetry.metrics.interval': 15000
        };
        return key in config ? config[key] : defaultValue;
      });

      await manager.initialize();

      expect(resourceFromAttributes).toHaveBeenCalledWith({ 'service.name': 'jimstest-wiki' });
      expect(MeterProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          resource: expect.objectContaining({ attributes: { 'service.name': 'jimstest-wiki' } })
        })
      );
    });

    test('should fall back to prefix for service.name when serviceName not configured', async () => {

      // Default config has no serviceName — falls back to prefix
      await manager.initialize();

      expect(resourceFromAttributes).toHaveBeenCalledWith({ 'service.name': 'ngdpbase' });
    });

    test('should return a metrics handler when enabled', async () => {
      await manager.initialize();
      const handler = manager.getMetricsHandler();
      expect(handler).not.toBeNull();
      expect(typeof handler).toBe('function');
    });
  });

  describe('shutdown', () => {
    test('should clean up meter provider on shutdown', async () => {
      mockConfigManager.getProperty = vi.fn((key, defaultValue) => {
        if (key === 'ngdpbase.telemetry.enabled') return true;
        const config = {
          'ngdpbase.telemetry.metrics.port': 9464,
          'ngdpbase.telemetry.metrics.host': '0.0.0.0',
          'ngdpbase.telemetry.metrics.path': '/metrics',
          'ngdpbase.telemetry.metrics.interval': 15000
        };
        return key in config ? config[key] : defaultValue;
      });

      await manager.initialize();
      expect(manager.isEnabled()).toBe(true);

      await manager.shutdown();
      expect(mockMeterProvider.shutdown).toHaveBeenCalled();
      expect(manager.isInitialized()).toBe(false);
    });

    test('should handle shutdown gracefully when disabled', async () => {
      await manager.initialize();
      await expect(manager.shutdown()).resolves.not.toThrow();
    });
  });

  describe('OTLP export', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    test('should create OTLP reader when otlp.enabled=true and endpoint is set', async () => {
      mockConfigManager.getProperty = vi.fn((key, defaultValue) => {
        const config = {
          'ngdpbase.telemetry.enabled': true,
          'ngdpbase.telemetry.metrics.port': 9464,
          'ngdpbase.telemetry.metrics.host': '0.0.0.0',
          'ngdpbase.telemetry.metrics.path': '/metrics',
          'ngdpbase.telemetry.metrics.interval': 15000,
          'ngdpbase.telemetry.otlp.enabled': true,
          'ngdpbase.telemetry.otlp.endpoint': 'https://otel.example.com/v1/metrics',
          'ngdpbase.telemetry.otlp.headers': {},
          'ngdpbase.telemetry.otlp.interval': 15000,
          'ngdpbase.telemetry.otlp.timeout': 30000
        };
        return key in config ? config[key] : defaultValue;
      });

      await manager.initialize();

      expect(OTLPMetricExporter).toHaveBeenCalledWith({
        url: 'https://otel.example.com/v1/metrics',
        headers: {},
        timeoutMillis: 30000
      });
      expect(PeriodicExportingMetricReader).toHaveBeenCalledWith({
        exporter: mockOtlpExporter,
        exportIntervalMillis: 15000,
        exportTimeoutMillis: 30000
      });
    });

    test('should NOT create OTLP reader when otlp.enabled=false', async () => {
      mockConfigManager.getProperty = vi.fn((key, defaultValue) => {
        const config = {
          'ngdpbase.telemetry.enabled': true,
          'ngdpbase.telemetry.metrics.port': 9464,
          'ngdpbase.telemetry.metrics.host': '0.0.0.0',
          'ngdpbase.telemetry.metrics.path': '/metrics',
          'ngdpbase.telemetry.metrics.interval': 15000,
          'ngdpbase.telemetry.otlp.enabled': false,
          'ngdpbase.telemetry.otlp.endpoint': 'https://otel.example.com/v1/metrics'
        };
        return key in config ? config[key] : defaultValue;
      });

      await manager.initialize();

      expect(OTLPMetricExporter).not.toHaveBeenCalled();
      expect(PeriodicExportingMetricReader).not.toHaveBeenCalled();
    });

    test('should NOT create OTLP reader when endpoint is empty', async () => {
      mockConfigManager.getProperty = vi.fn((key, defaultValue) => {
        const config = {
          'ngdpbase.telemetry.enabled': true,
          'ngdpbase.telemetry.metrics.port': 9464,
          'ngdpbase.telemetry.metrics.host': '0.0.0.0',
          'ngdpbase.telemetry.metrics.path': '/metrics',
          'ngdpbase.telemetry.metrics.interval': 15000,
          'ngdpbase.telemetry.otlp.enabled': true,
          'ngdpbase.telemetry.otlp.endpoint': ''
        };
        return key in config ? config[key] : defaultValue;
      });

      await manager.initialize();

      expect(OTLPMetricExporter).not.toHaveBeenCalled();
      expect(PeriodicExportingMetricReader).not.toHaveBeenCalled();
    });

    test('should shut down OTLP reader on shutdown', async () => {
      mockConfigManager.getProperty = vi.fn((key, defaultValue) => {
        const config = {
          'ngdpbase.telemetry.enabled': true,
          'ngdpbase.telemetry.metrics.port': 9464,
          'ngdpbase.telemetry.metrics.host': '0.0.0.0',
          'ngdpbase.telemetry.metrics.path': '/metrics',
          'ngdpbase.telemetry.metrics.interval': 15000,
          'ngdpbase.telemetry.otlp.enabled': true,
          'ngdpbase.telemetry.otlp.endpoint': 'https://otel.example.com/v1/metrics',
          'ngdpbase.telemetry.otlp.headers': {},
          'ngdpbase.telemetry.otlp.interval': 15000,
          'ngdpbase.telemetry.otlp.timeout': 30000
        };
        return key in config ? config[key] : defaultValue;
      });

      await manager.initialize();
      await manager.shutdown();

      expect(mockOtlpReaderShutdown).toHaveBeenCalled();
      expect(mockMeterProvider.shutdown).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    test('should disable metrics and log warning when ConfigurationManager unavailable', async () => {
      mockEngine.getManager = vi.fn(() => undefined);
      manager = new MetricsManager(mockEngine);

      await manager.initialize();
      expect(manager.isEnabled()).toBe(false);
    });
  });
});
