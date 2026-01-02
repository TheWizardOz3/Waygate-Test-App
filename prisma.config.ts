// Load environment variables before config evaluation
// Priority: .env.local (secrets) > .env (defaults)
import dotenv from 'dotenv';
import path from 'node:path';

// Load .env first (defaults), then .env.local (secrets) to override
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, '.env.local'), override: true });

import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: path.join(__dirname, 'prisma', 'schema.prisma'),

  // Database connection for Prisma CLI operations (migrate, db pull, etc.)
  datasource: {
    url: env('DATABASE_URL'),
  },

  // Seed script for development data
  migrations: {
    seed: 'npx tsx prisma/seed.ts',
  },
});
