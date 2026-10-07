// Opt-in live probe: synthetic text only; uses the same runtime as the plugin.
// node scripts/probe-native-plan.mjs [sonnet|opus] [plain|structured|diagnose]
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dir = mkdtempSync(join(tmpdir(), 'notepack-probe-'));
globalThis.window ??= globalThis;
try {
  const outfile = join(dir, 'runtime.cjs');
  await build({ entryPoints: ['src/ai/native/runtime.ts'], outfile, bundle: true, platform: 'node', format: 'cjs' });
  const { NativeRuntimeService, createDesktopNativeRuntimeDeps } = createRequire(import.meta.url)(outfile);
  const runtime = new NativeRuntimeService(createDesktopNativeRuntimeDeps());
  const snapshot = await runtime.diagnose('claude');
  console.log(JSON.stringify({ phase: 'diagnose', status: snapshot.status, version: snapshot.version, decision: snapshot.decision?.code, error: snapshot.error }));
  if (process.argv[3] !== 'diagnose' && snapshot.status === 'ready') {
    const model = process.argv[2] ?? 'sonnet';
    const started = Date.now();
    try {
      const content = await runtime.completeWithClaude({ model, effort: 'low', systemPrompt: 'Return only the requested verification marker.', prompt: 'Return NP_OK.',
        ...(process.argv[3] === 'structured' ? { jsonSchema: { type: 'object', properties: { marker: { type: 'string', const: 'NP_OK' } }, required: ['marker'], additionalProperties: false } } : {}) });
      console.log(JSON.stringify({ phase: 'request', model, elapsedMs: Date.now() - started, content }));
    } catch (error) {
      console.log(JSON.stringify({ phase: 'request', model, elapsedMs: Date.now() - started, error: error.message, statusAfter: runtime.getSnapshot('claude').status }));
      process.exitCode = 1;
    }
  }
} finally { rmSync(dir, { recursive: true, force: true }); }
