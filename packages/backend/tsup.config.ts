import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  // Bundle all npm deps into one file for Vercel serverless.
  // Node built-ins (fs, path, zlib, crypto, etc.) stay external.
  noExternal: [/.*/],
  platform: 'node',
});
