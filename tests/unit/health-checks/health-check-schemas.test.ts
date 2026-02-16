import { describe, it, expect } from 'vitest';
import {
  HealthCheckStatusSchema,
  HealthCheckTierSchema,
  HealthCheckTriggerSchema,
  CreateCredentialCheckInputSchema,
  HealthCheckResponseSchema,
  TriggerHealthCheckInputSchema,
  getHealthStatusFromCredential,
  calculateOverallHealthStatus,
} from '@/lib/modules/health-checks/health-check.schemas';

describe('Health Check Schemas', () => {
  describe('HealthCheckStatusSchema', () => {
    it('should accept valid health statuses', () => {
      expect(HealthCheckStatusSchema.safeParse('healthy').success).toBe(true);
      expect(HealthCheckStatusSchema.safeParse('degraded').success).toBe(true);
      expect(HealthCheckStatusSchema.safeParse('unhealthy').success).toBe(true);
    });

    it('should reject invalid health statuses', () => {
      expect(HealthCheckStatusSchema.safeParse('invalid').success).toBe(false);
      expect(HealthCheckStatusSchema.safeParse('ok').success).toBe(false);
      expect(HealthCheckStatusSchema.safeParse('').success).toBe(false);
    });
  });

  describe('HealthCheckTierSchema', () => {
    it('should accept valid tiers', () => {
      expect(HealthCheckTierSchema.safeParse('credential').success).toBe(true);
      expect(HealthCheckTierSchema.safeParse('connectivity').success).toBe(true);
      expect(HealthCheckTierSchema.safeParse('full_scan').success).toBe(true);
    });

    it('should reject invalid tiers', () => {
      expect(HealthCheckTierSchema.safeParse('basic').success).toBe(false);
      expect(HealthCheckTierSchema.safeParse('full').success).toBe(false);
    });
  });

  describe('HealthCheckTriggerSchema', () => {
    it('should accept valid triggers', () => {
      expect(HealthCheckTriggerSchema.safeParse('scheduled').success).toBe(true);
      expect(HealthCheckTriggerSchema.safeParse('manual').success).toBe(true);
    });

    it('should reject invalid triggers', () => {
      expect(HealthCheckTriggerSchema.safeParse('automatic').success).toBe(false);
      expect(HealthCheckTriggerSchema.safeParse('cron').success).toBe(false);
      expect(HealthCheckTriggerSchema.safeParse('on_demand').success).toBe(false);
    });
  });

  describe('TriggerHealthCheckInputSchema', () => {
    it('should accept valid input', () => {
      const input = {
        connectionId: '123e4567-e89b-12d3-a456-426614174000',
        tier: 'connectivity',
      };
      const result = TriggerHealthCheckInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should default tier to connectivity', () => {
      const input = {
        connectionId: '123e4567-e89b-12d3-a456-426614174000',
      };
      const result = TriggerHealthCheckInputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tier).toBe('connectivity');
      }
    });

    it('should reject invalid UUID', () => {
      const input = {
        connectionId: 'not-a-uuid',
        tier: 'connectivity',
      };
      const result = TriggerHealthCheckInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('CreateCredentialCheckInputSchema', () => {
    it('should accept valid credential check input', () => {
      const input = {
        connectionId: '123e4567-e89b-12d3-a456-426614174000',
        tenantId: '123e4567-e89b-12d3-a456-426614174001',
        status: 'healthy',
        checkTier: 'credential',
        checkTrigger: 'manual',
        durationMs: 100,
        credentialStatus: 'active',
        credentialExpiresAt: new Date(),
      };
      const result = CreateCredentialCheckInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject input missing required fields', () => {
      const input = {
        connectionId: '123e4567-e89b-12d3-a456-426614174000',
      };
      const result = CreateCredentialCheckInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('HealthCheckResponseSchema', () => {
    it('should accept valid health check response', () => {
      const response = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        connectionId: '123e4567-e89b-12d3-a456-426614174001',
        tenantId: '123e4567-e89b-12d3-a456-426614174002',
        status: 'healthy',
        checkTier: 'connectivity',
        checkTrigger: 'manual',
        credentialStatus: 'active',
        credentialExpiresAt: '2026-02-01T00:00:00.000Z',
        testActionId: '123e4567-e89b-12d3-a456-426614174003',
        testActionSuccess: true,
        testActionLatencyMs: 150,
        testActionStatusCode: 200,
        testActionError: null,
        actionsScanned: null,
        actionsPassed: null,
        actionsFailed: null,
        scanResults: null,
        circuitBreakerStatus: 'closed',
        userCredentialHealth: null,
        durationMs: 200,
        error: null,
        createdAt: '2026-01-25T00:00:00.000Z',
      };
      const result = HealthCheckResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should accept response with null optional fields', () => {
      const response = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        connectionId: '123e4567-e89b-12d3-a456-426614174001',
        tenantId: '123e4567-e89b-12d3-a456-426614174002',
        status: 'unhealthy',
        checkTier: 'credential',
        checkTrigger: 'scheduled',
        credentialStatus: 'expired',
        credentialExpiresAt: null,
        testActionId: null,
        testActionSuccess: null,
        testActionLatencyMs: null,
        testActionStatusCode: null,
        testActionError: null,
        actionsScanned: null,
        actionsPassed: null,
        actionsFailed: null,
        scanResults: null,
        userCredentialHealth: null,
        circuitBreakerStatus: null,
        durationMs: 50,
        error: { code: 'TOKEN_EXPIRED', message: 'Token expired' },
        createdAt: '2026-01-25T00:00:00.000Z',
      };
      const result = HealthCheckResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });
  });

  describe('getHealthStatusFromCredential', () => {
    it('should return healthy for active credentials', () => {
      expect(getHealthStatusFromCredential('active')).toBe('healthy');
    });

    it('should return degraded for expiring credentials', () => {
      expect(getHealthStatusFromCredential('expiring')).toBe('degraded');
    });

    it('should return unhealthy for expired credentials', () => {
      expect(getHealthStatusFromCredential('expired')).toBe('unhealthy');
    });

    it('should return unhealthy for missing credentials', () => {
      expect(getHealthStatusFromCredential('missing')).toBe('unhealthy');
    });
  });

  describe('calculateOverallHealthStatus', () => {
    it('should return unhealthy for expired credentials', () => {
      expect(calculateOverallHealthStatus({ credentialStatus: 'expired' })).toBe('unhealthy');
    });

    it('should return unhealthy for missing credentials', () => {
      expect(calculateOverallHealthStatus({ credentialStatus: 'missing' })).toBe('unhealthy');
    });

    it('should return unhealthy for failed test action', () => {
      expect(calculateOverallHealthStatus({ testActionSuccess: false })).toBe('unhealthy');
    });

    it('should return degraded for expiring credentials', () => {
      expect(calculateOverallHealthStatus({ credentialStatus: 'expiring' })).toBe('degraded');
    });

    it('should return degraded for failed actions in scan', () => {
      expect(calculateOverallHealthStatus({ actionsFailed: 2 })).toBe('degraded');
    });

    it('should return healthy when all checks pass', () => {
      expect(
        calculateOverallHealthStatus({
          credentialStatus: 'active',
          testActionSuccess: true,
          actionsFailed: 0,
        })
      ).toBe('healthy');
    });
  });
});
