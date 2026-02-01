/**
 * Tests for HookManagerImpl
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { HookManagerImpl } from '../../../src/core/hooks';
import type { HookContext, HookHandler } from '../../../src/types';

describe('HookManagerImpl', () => {
  let hooks: HookManagerImpl;

  beforeEach(() => {
    hooks = new HookManagerImpl();
  });

  describe('on/off', () => {
    test('should register handler', () => {
      const handler: HookHandler = vi.fn(async () => ({}));
      hooks.on('message_received', handler);
      expect(hooks.getHookCount('message_received')).toBe(1);
    });

    test('should register multiple handlers', () => {
      const handler1: HookHandler = vi.fn(async () => ({}));
      const handler2: HookHandler = vi.fn(async () => ({}));

      hooks.on('message_received', handler1);
      hooks.on('message_received', handler2);

      expect(hooks.getHookCount('message_received')).toBe(2);
    });

    test('should remove handler', () => {
      const handler: HookHandler = vi.fn(async () => ({}));
      hooks.on('message_received', handler);
      hooks.off('message_received', handler);
      expect(hooks.getHookCount('message_received')).toBe(0);
    });

    test('should only remove specified handler', () => {
      const handler1: HookHandler = vi.fn(async () => ({}));
      const handler2: HookHandler = vi.fn(async () => ({}));

      hooks.on('message_received', handler1);
      hooks.on('message_received', handler2);
      hooks.off('message_received', handler1);

      expect(hooks.getHookCount('message_received')).toBe(1);
    });

    test('should not throw when removing non-existent handler', () => {
      const handler: HookHandler = vi.fn(async () => ({}));
      expect(() => hooks.off('message_received', handler)).not.toThrow();
    });

    test('should not throw when removing from non-existent event', () => {
      const handler: HookHandler = vi.fn(async () => ({}));
      expect(() => hooks.off('message_received', handler)).not.toThrow();
    });

    test('should use default priority of 50', async () => {
      const order: number[] = [];
      const handler1: HookHandler = async () => {
        order.push(50);
        return {};
      };
      const handler2: HookHandler = async () => {
        order.push(10);
        return {};
      };

      hooks.on('message_received', handler1); // Default priority 50
      hooks.on('message_received', handler2, 10);

      await hooks.emit('message_received', {});
      expect(order).toEqual([10, 50]); // 10 runs first
    });
  });

  describe('register', () => {
    test('should register hook with full configuration', () => {
      const handler: HookHandler = vi.fn(async () => ({}));
      hooks.register({
        event: 'message_received',
        priority: 10,
        handler,
        mutatesContext: true,
      });

      expect(hooks.getHookCount('message_received')).toBe(1);
    });

    test('should respect mutatesContext flag', async () => {
      const handler: HookHandler = async (_ctx: HookContext) => ({
        modified: { sanitized: true },
      });

      hooks.register({
        event: 'message_received',
        priority: 10,
        handler,
        mutatesContext: true,
      });

      const result = await hooks.emit('message_received', { original: true });
      expect(result.modified).toEqual({ sanitized: true });
    });

    test('should not pass modifications if mutatesContext is false', async () => {
      const handler: HookHandler = async (_ctx: HookContext) => ({
        modified: { shouldNotPropagate: true },
      });

      hooks.register({
        event: 'message_received',
        priority: 10,
        handler,
        mutatesContext: false,
      });

      const result = await hooks.emit('message_received', { original: true });
      // Should return original data, not modified
      expect(result.modified).toEqual({ original: true });
    });
  });

  describe('emit', () => {
    test('should call handlers in priority order', async () => {
      const order: number[] = [];

      const handler1: HookHandler = async () => {
        order.push(20);
        return {};
      };
      const handler2: HookHandler = async () => {
        order.push(10);
        return {};
      };
      const handler3: HookHandler = async () => {
        order.push(30);
        return {};
      };

      hooks.on('message_received', handler1, 20);
      hooks.on('message_received', handler2, 10);
      hooks.on('message_received', handler3, 30);

      await hooks.emit('message_received', {});
      expect(order).toEqual([10, 20, 30]); // Lower priority number runs first
    });

    test('should pass context to handlers', async () => {
      const handler: HookHandler = vi.fn(async () => ({}));
      const data = { test: 'data' };
      const metadata = { userId: '123' };

      await hooks.emit('message_received', data, metadata);

      expect(handler).not.toHaveBeenCalled(); // No handler registered

      hooks.on('message_received', handler);
      await hooks.emit('message_received', data, metadata);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'message_received',
          data,
          metadata,
          timestamp: expect.any(Date),
        })
      );
    });

    test('should stop processing when hook returns blocked=true', async () => {
      const handler1: HookHandler = async () => ({
        blocked: true,
        reason: 'Security violation',
      });
      const handler2: HookHandler = vi.fn(async () => ({}));

      hooks.on('message_received', handler1, 10);
      hooks.on('message_received', handler2, 20);

      const result = await hooks.emit('message_received', {});

      expect(result.blocked).toBe(true);
      expect(result.reason).toBe('Security violation');
      expect(handler2).not.toHaveBeenCalled(); // Should not reach second handler
    });

    test('should return modified data from final hook', async () => {
      const handler: HookHandler = async () => ({
        modified: { transformed: true },
      });

      hooks.register({
        event: 'message_received',
        priority: 10,
        handler,
        mutatesContext: true,
      });

      const result = await hooks.emit('message_received', { original: true });
      expect(result.modified).toEqual({ transformed: true });
    });

    test('should pass modified data through hook chain', async () => {
      const handler1: HookHandler = async (ctx: HookContext) => ({
        modified: { ...(ctx.data as object), step1: true },
      });
      const handler2: HookHandler = async (ctx: HookContext) => ({
        modified: { ...(ctx.data as object), step2: true },
      });

      hooks.register({
        event: 'message_received',
        priority: 10,
        handler: handler1,
        mutatesContext: true,
      });
      hooks.register({
        event: 'message_received',
        priority: 20,
        handler: handler2,
        mutatesContext: true,
      });

      const result = await hooks.emit('message_received', { original: true });
      expect(result.modified).toEqual({
        original: true,
        step1: true,
        step2: true,
      });
    });

    test('should isolate errors and continue processing', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const handler1: HookHandler = async () => {
        throw new Error('Hook error');
      };
      const handler2: HookHandler = vi.fn(async () => ({}));
      const handler3: HookHandler = vi.fn(async () => ({}));

      hooks.on('message_received', handler1, 10);
      hooks.on('message_received', handler2, 20);
      hooks.on('message_received', handler3, 30);

      await hooks.emit('message_received', {});

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Hook error on message_received:',
        expect.any(Error)
      );
      expect(handler2).toHaveBeenCalled(); // Should continue despite error
      expect(handler3).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    test('should handle errors in multiple hooks', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const handler1: HookHandler = async () => {
        throw new Error('Error 1');
      };
      const handler2: HookHandler = async () => {
        throw new Error('Error 2');
      };
      const handler3: HookHandler = vi.fn(async () => ({}));

      hooks.on('message_received', handler1, 10);
      hooks.on('message_received', handler2, 20);
      hooks.on('message_received', handler3, 30);

      await hooks.emit('message_received', {});

      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
      expect(handler3).toHaveBeenCalled(); // Should still call the last handler

      consoleErrorSpy.mockRestore();
    });

    test('should return original data if no hooks registered', async () => {
      const data = { test: 'data' };
      const result = await hooks.emit('message_received', data);
      expect(result.modified).toEqual(data);
    });

    test('should use empty metadata if not provided', async () => {
      const handler: HookHandler = vi.fn(async () => ({}));
      hooks.on('message_received', handler);

      await hooks.emit('message_received', {});

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: {},
        })
      );
    });
  });

  describe('clear', () => {
    test('should clear hooks for specific event', () => {
      const handler: HookHandler = vi.fn(async () => ({}));
      hooks.on('message_received', handler);
      hooks.on('message_sent', handler);

      hooks.clear('message_received');

      expect(hooks.getHookCount('message_received')).toBe(0);
      expect(hooks.getHookCount('message_sent')).toBe(1);
    });

    test('should clear all hooks when no event specified', () => {
      const handler: HookHandler = vi.fn(async () => ({}));
      hooks.on('message_received', handler);
      hooks.on('message_sent', handler);
      hooks.on('session_start', handler);

      hooks.clear();

      expect(hooks.getHookCount('message_received')).toBe(0);
      expect(hooks.getHookCount('message_sent')).toBe(0);
      expect(hooks.getHookCount('session_start')).toBe(0);
    });
  });

  describe('priority ordering edge cases', () => {
    test('should handle hooks with same priority', async () => {
      const order: string[] = [];

      const handler1: HookHandler = async () => {
        order.push('handler1');
        return {};
      };
      const handler2: HookHandler = async () => {
        order.push('handler2');
        return {};
      };

      hooks.on('message_received', handler1, 10);
      hooks.on('message_received', handler2, 10);

      await hooks.emit('message_received', {});

      // Both should be called (order between same priority is based on registration order)
      expect(order).toEqual(['handler1', 'handler2']);
    });

    test('should handle negative priorities', async () => {
      const order: number[] = [];

      hooks.on('message_received', async () => {
        order.push(0);
        return {};
      }, 0);
      hooks.on('message_received', async () => {
        order.push(-10);
        return {};
      }, -10);
      hooks.on('message_received', async () => {
        order.push(10);
        return {};
      }, 10);

      await hooks.emit('message_received', {});

      expect(order).toEqual([-10, 0, 10]);
    });
  });

  describe('real-world scenarios', () => {
    test('should support ClawShield → ClawMem priority pattern', async () => {
      const executionOrder: string[] = [];

      // ClawShield (priority 10) - mutates context (sanitizes)
      const clawShieldHandler: HookHandler = async (ctx: HookContext) => {
        executionOrder.push('ClawShield');
        const data = ctx.data as { content: string };
        return {
          modified: {
            content: data.content.replace('SECRET_KEY', '[REDACTED]'),
            sanitized: true,
          },
        };
      };

      // ClawMem (priority 20) - sees sanitized content
      const clawMemHandler: HookHandler = async (ctx: HookContext) => {
        executionOrder.push('ClawMem');
        const data = ctx.data as { content: string; sanitized?: boolean };
        expect(data.sanitized).toBe(true);
        expect(data.content).not.toContain('SECRET_KEY');
        return {};
      };

      hooks.register({
        event: 'message_received',
        priority: 10,
        handler: clawShieldHandler,
        mutatesContext: true,
      });

      hooks.register({
        event: 'message_received',
        priority: 20,
        handler: clawMemHandler,
        mutatesContext: false,
      });

      await hooks.emit('message_received', {
        content: 'User message with SECRET_KEY=abc123',
      });

      expect(executionOrder).toEqual(['ClawShield', 'ClawMem']);
    });

    test('should block message when ClawShield detects threat', async () => {
      const clawMemHandler: HookHandler = vi.fn(async () => ({}));

      const clawShieldHandler: HookHandler = async (ctx: HookContext) => {
        const data = ctx.data as { content: string };
        if (data.content.includes('malicious')) {
          return {
            blocked: true,
            reason: 'Malicious content detected',
          };
        }
        return {};
      };

      hooks.register({
        event: 'message_received',
        priority: 10,
        handler: clawShieldHandler,
        mutatesContext: false,
      });

      hooks.register({
        event: 'message_received',
        priority: 20,
        handler: clawMemHandler,
        mutatesContext: false,
      });

      const result = await hooks.emit('message_received', {
        content: 'This is malicious content',
      });

      expect(result.blocked).toBe(true);
      expect(result.reason).toBe('Malicious content detected');
      expect(clawMemHandler).not.toHaveBeenCalled();
    });
  });

  describe('getHookCount', () => {
    test('should return 0 for event with no hooks', () => {
      expect(hooks.getHookCount('message_received')).toBe(0);
    });

    test('should return correct count', () => {
      const handler1: HookHandler = vi.fn(async () => ({}));
      const handler2: HookHandler = vi.fn(async () => ({}));

      hooks.on('message_received', handler1);
      hooks.on('message_received', handler2);

      expect(hooks.getHookCount('message_received')).toBe(2);
    });

    test('should update after removal', () => {
      const handler: HookHandler = vi.fn(async () => ({}));
      hooks.on('message_received', handler);
      expect(hooks.getHookCount('message_received')).toBe(1);

      hooks.off('message_received', handler);
      expect(hooks.getHookCount('message_received')).toBe(0);
    });
  });
});
