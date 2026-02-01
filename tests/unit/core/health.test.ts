/**
 * Tests for core/health.ts
 */

import { describe, test, expect, vi } from 'vitest';
import { HealthCheckerImpl } from '../../../src/core/health';
import type { ConfigManager, StorageAdapter } from '../../../src/types';

describe('HealthCheckerImpl', () => {
  const createMockServices = (overrides: {
    configOk?: boolean;
    storageOk?: boolean;
    hasLlm?: boolean;
    hasEmbedding?: boolean;
  } = {}) => {
    const mockConfig: ConfigManager | undefined = overrides.configOk === false ? undefined : {
      get: vi.fn().mockReturnValue('value'),
      set: vi.fn(),
      getModuleConfig: vi.fn().mockReturnValue({}),
      isModuleEnabled: vi.fn().mockReturnValue(true),
    };

    const mockStorage: StorageAdapter | undefined = overrides.storageOk === false ? undefined : {
      get: vi.fn().mockResolvedValue(undefined),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      exists: vi.fn().mockResolvedValue(false),
    };

    const mockLlm = overrides.hasLlm !== false ? {
      scoring: vi.fn().mockResolvedValue('response'),
      extraction: vi.fn().mockResolvedValue('response'),
      powerful: vi.fn().mockResolvedValue('response'),
    } : undefined;

    const mockEmbedding = overrides.hasEmbedding !== false ? {
      embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
      embedBatch: vi.fn().mockResolvedValue([[0.1, 0.2]]),
      cosineSimilarity: vi.fn().mockReturnValue(0.8),
    } : undefined;

    return { config: mockConfig, storage: mockStorage, llm: mockLlm, embedding: mockEmbedding };
  };

  test('returns healthy when config and storage ok', async () => {
    const services = createMockServices();
    const health = new HealthCheckerImpl(services);

    const status = await health.check();

    expect(status.healthy).toBe(true);
    expect(status.checks.config.ok).toBe(true);
    expect(status.checks.storage.ok).toBe(true);
    expect(status.checks.llm.ok).toBe(true);
    expect(status.checks.embedding.ok).toBe(true);
  });

  test('returns unhealthy when config missing', async () => {
    const services = createMockServices({ configOk: false });
    const health = new HealthCheckerImpl(services);

    const status = await health.check();

    expect(status.healthy).toBe(false);
    expect(status.checks.config.ok).toBe(false);
    expect(status.checks.config.message).toContain('not initialized');
  });

  test('returns unhealthy when storage missing', async () => {
    const services = createMockServices({ storageOk: false });
    const health = new HealthCheckerImpl(services);

    const status = await health.check();

    expect(status.healthy).toBe(false);
    expect(status.checks.storage.ok).toBe(false);
    expect(status.checks.storage.message).toContain('not initialized');
  });

  test('still healthy when llm missing (optional)', async () => {
    const services = createMockServices({ hasLlm: false });
    const health = new HealthCheckerImpl(services);

    const status = await health.check();

    expect(status.healthy).toBe(true);
    expect(status.checks.llm.ok).toBe(true);
    expect(status.checks.llm.message).toContain('optional');
  });

  test('still healthy when embedding missing (optional)', async () => {
    const services = createMockServices({ hasEmbedding: false });
    const health = new HealthCheckerImpl(services);

    const status = await health.check();

    expect(status.healthy).toBe(true);
    expect(status.checks.embedding.ok).toBe(true);
    expect(status.checks.embedding.message).toContain('optional');
  });

  test('handles storage exists throwing error', async () => {
    const services = createMockServices();
    (services.storage!.exists as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Database connection failed')
    );
    const health = new HealthCheckerImpl(services);

    const status = await health.check();

    expect(status.healthy).toBe(false);
    expect(status.checks.storage.ok).toBe(false);
    expect(status.checks.storage.message).toContain('Database connection failed');
  });

  test('handles config get throwing error', async () => {
    const services = createMockServices();
    (services.config!.get as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('Config error');
    });
    const health = new HealthCheckerImpl(services);

    const status = await health.check();

    expect(status.healthy).toBe(false);
    expect(status.checks.config.ok).toBe(false);
  });
});
