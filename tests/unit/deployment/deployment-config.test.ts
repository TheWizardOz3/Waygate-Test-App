import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import yaml from 'yaml';

const ROOT = path.resolve(__dirname, '../../..');

describe('Deployment Configuration', () => {
  describe('next.config.mjs', () => {
    let configContent: string;

    beforeAll(() => {
      configContent = fs.readFileSync(path.join(ROOT, 'next.config.mjs'), 'utf-8');
    });

    it('has standalone output mode for Vercel optimization', () => {
      expect(configContent).toContain("output: 'standalone'");
    });

    it('externalizes bcrypt and pg for serverless', () => {
      expect(configContent).toContain('bcrypt');
      expect(configContent).toContain('pg');
      expect(configContent).toContain('serverExternalPackages');
    });

    it('configures security headers', () => {
      const requiredHeaders = [
        'X-Frame-Options',
        'X-Content-Type-Options',
        'Referrer-Policy',
        'Permissions-Policy',
        'Strict-Transport-Security',
        'Content-Security-Policy',
      ];
      for (const header of requiredHeaders) {
        expect(configContent).toContain(header);
      }
    });

    it('sets X-Frame-Options to DENY', () => {
      expect(configContent).toContain("value: 'DENY'");
    });

    it('sets X-Content-Type-Options to nosniff', () => {
      expect(configContent).toContain("value: 'nosniff'");
    });

    it('includes HSTS with long max-age and preload', () => {
      expect(configContent).toContain('max-age=63072000');
      expect(configContent).toContain('includeSubDomains');
      expect(configContent).toContain('preload');
    });

    it('configures CSP with frame-ancestors none', () => {
      expect(configContent).toContain("frame-ancestors 'none'");
    });

    it('configures remote image patterns', () => {
      expect(configContent).toContain('remotePatterns');
    });
  });

  describe('vercel.json', () => {
    let config: Record<string, unknown>;

    beforeAll(() => {
      const raw = fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf-8');
      config = JSON.parse(raw);
    });

    it('sets framework to nextjs', () => {
      expect(config.framework).toBe('nextjs');
    });

    it('uses pnpm for install', () => {
      expect(config.installCommand).toBe('pnpm install');
    });

    it('build command generates Prisma client', () => {
      expect(config.buildCommand).toContain('prisma generate');
    });

    it('build command runs migrations', () => {
      expect(config.buildCommand).toContain('prisma migrate deploy');
    });

    it('build command runs next build', () => {
      expect(config.buildCommand).toContain('next build');
    });

    it('build command runs in correct order: generate → migrate → build', () => {
      const cmd = config.buildCommand as string;
      const generateIdx = cmd.indexOf('prisma generate');
      const migrateIdx = cmd.indexOf('prisma migrate deploy');
      const buildIdx = cmd.indexOf('next build');
      expect(generateIdx).toBeLessThan(migrateIdx);
      expect(migrateIdx).toBeLessThan(buildIdx);
    });

    it('has cron jobs configured', () => {
      expect(config.crons).toBeDefined();
      expect(Array.isArray(config.crons)).toBe(true);
    });

    it('all expected cron endpoints are present', () => {
      const expectedPaths = [
        '/api/v1/internal/token-refresh',
        '/api/v1/internal/health-checks/credential',
        '/api/v1/internal/health-checks/connectivity',
        '/api/v1/internal/reference-sync',
        '/api/v1/internal/drift-analyzer',
        '/api/v1/internal/job-worker',
      ];
      const cronPaths = (config.crons as Array<{ path: string }>).map((c) => c.path);
      for (const p of expectedPaths) {
        expect(cronPaths).toContain(p);
      }
    });

    it('each cron job has a schedule', () => {
      for (const cron of config.crons as Array<{ path: string; schedule: string }>) {
        expect(cron.schedule).toBeDefined();
        expect(cron.schedule.length).toBeGreaterThan(0);
      }
    });
  });

  describe('package.json', () => {
    let pkg: Record<string, unknown>;

    beforeAll(() => {
      const raw = fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8');
      pkg = JSON.parse(raw);
    });

    it('has postinstall script that generates Prisma client', () => {
      const scripts = pkg.scripts as Record<string, string>;
      expect(scripts.postinstall).toBe('prisma generate');
    });

    it('requires Node.js >= 20', () => {
      const engines = pkg.engines as Record<string, string>;
      expect(engines.node).toBe('>=20.0.0');
    });

    it('has all required CI scripts', () => {
      const scripts = pkg.scripts as Record<string, string>;
      expect(scripts.lint).toBeDefined();
      expect(scripts['type-check']).toBeDefined();
      expect(scripts.test).toBeDefined();
      expect(scripts.build).toBeDefined();
    });

    it('has db migration scripts', () => {
      const scripts = pkg.scripts as Record<string, string>;
      expect(scripts['db:migrate:deploy']).toBe('prisma migrate deploy');
      expect(scripts['db:generate']).toBe('prisma generate');
    });
  });

  describe('GitHub Actions CI workflow', () => {
    let workflow: Record<string, unknown>;

    beforeAll(() => {
      const raw = fs.readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf-8');
      workflow = yaml.parse(raw);
    });

    it('triggers on push to main', () => {
      const on = workflow.on as Record<string, unknown>;
      expect(on.push).toBeDefined();
      const push = on.push as { branches: string[] };
      expect(push.branches).toContain('main');
    });

    it('triggers on pull requests to main', () => {
      const on = workflow.on as Record<string, unknown>;
      expect(on.pull_request).toBeDefined();
      const pr = on.pull_request as { branches: string[] };
      expect(pr.branches).toContain('main');
    });

    it('cancels in-progress runs for the same PR', () => {
      expect(workflow.concurrency).toBeDefined();
      const concurrency = workflow.concurrency as Record<string, unknown>;
      expect(concurrency['cancel-in-progress']).toBe(true);
    });

    it('uses Node.js 20', () => {
      const jobs = workflow.jobs as Record<string, Record<string, unknown>>;
      const ci = jobs.ci;
      const steps = ci.steps as Array<Record<string, unknown>>;
      const nodeStep = steps.find(
        (s) => s.uses && (s.uses as string).startsWith('actions/setup-node')
      );
      expect(nodeStep).toBeDefined();
      const nodeWith = nodeStep!.with as Record<string, unknown>;
      expect(nodeWith['node-version']).toBe(20);
    });

    it('uses pnpm with caching', () => {
      const jobs = workflow.jobs as Record<string, Record<string, unknown>>;
      const ci = jobs.ci;
      const steps = ci.steps as Array<Record<string, unknown>>;
      const pnpmStep = steps.find(
        (s) => s.uses && (s.uses as string).startsWith('pnpm/action-setup')
      );
      expect(pnpmStep).toBeDefined();
      const nodeStep = steps.find(
        (s) => s.uses && (s.uses as string).startsWith('actions/setup-node')
      );
      const nodeWith = nodeStep!.with as Record<string, unknown>;
      expect(nodeWith.cache).toBe('pnpm');
    });

    it('installs with frozen lockfile', () => {
      const jobs = workflow.jobs as Record<string, Record<string, unknown>>;
      const steps = (jobs.ci as Record<string, unknown>).steps as Array<Record<string, unknown>>;
      const installStep = steps.find((s) => s.name === 'Install dependencies');
      expect(installStep).toBeDefined();
      expect(installStep!.run).toContain('--frozen-lockfile');
    });

    it('generates Prisma client before lint/type-check', () => {
      const jobs = workflow.jobs as Record<string, Record<string, unknown>>;
      const steps = (jobs.ci as Record<string, unknown>).steps as Array<Record<string, unknown>>;
      const stepNames = steps.map((s) => s.name).filter(Boolean);
      const prismaIdx = stepNames.indexOf('Generate Prisma client');
      const lintIdx = stepNames.indexOf('Lint');
      const typeCheckIdx = stepNames.indexOf('Type-check');
      expect(prismaIdx).toBeGreaterThan(-1);
      expect(prismaIdx).toBeLessThan(lintIdx);
      expect(prismaIdx).toBeLessThan(typeCheckIdx);
    });

    it('runs lint, type-check, and test steps', () => {
      const jobs = workflow.jobs as Record<string, Record<string, unknown>>;
      const steps = (jobs.ci as Record<string, unknown>).steps as Array<Record<string, unknown>>;
      const stepNames = steps.map((s) => s.name).filter(Boolean);
      expect(stepNames).toContain('Lint');
      expect(stepNames).toContain('Type-check');
      expect(stepNames).toContain('Test');
    });

    it('sets a dummy DATABASE_URL for CI', () => {
      const jobs = workflow.jobs as Record<string, Record<string, unknown>>;
      const ci = jobs.ci as Record<string, unknown>;
      const env = ci.env as Record<string, string>;
      expect(env.DATABASE_URL).toBeDefined();
      expect(env.DATABASE_URL.length).toBeGreaterThan(0);
    });
  });

  describe('.env.example', () => {
    let envContent: string;

    beforeAll(() => {
      envContent = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf-8');
    });

    it('documents CRON_SECRET', () => {
      expect(envContent).toContain('CRON_SECRET');
    });

    it('documents DATABASE_URL', () => {
      expect(envContent).toContain('DATABASE_URL');
    });

    it('documents NEXT_PUBLIC_APP_URL', () => {
      expect(envContent).toContain('NEXT_PUBLIC_APP_URL');
    });

    it('documents build-time vs runtime distinction', () => {
      expect(envContent).toContain('Build-time');
      expect(envContent).toContain('Runtime');
    });

    it('documents migration workflow', () => {
      expect(envContent).toContain('prisma db push');
      expect(envContent).toContain('prisma migrate deploy');
    });
  });
});
