import assert from 'node:assert/strict';
import test from 'node:test';
import { checkWorkspace } from '../scripts/check-boundaries.mjs';

test('the checked-in workspace obeys the I1 boundary policy', () => {
  assert.deepEqual(checkWorkspace(), []);
});

const denied = [
  [
    'browser SDK import',
    'apps/web/src/App.tsx',
    "import '@polymarket/client';",
  ],
  [
    'browser server relative import',
    'apps/web/src/App.tsx',
    "import '../../server/src/index.js';",
  ],
  [
    'browser persistence relative import',
    'apps/web/src/App.tsx',
    "import '../../../packages/persistence/src/index.js';",
  ],
  [
    'browser SDK dynamic import',
    'apps/web/src/App.tsx',
    "await import('@polymarket/client');",
  ],
  [
    'uncheckable dynamic import',
    'apps/web/src/App.tsx',
    'const x = "module"; await import(x);',
  ],
  [
    'domain Node infrastructure',
    'packages/domain/src/index.ts',
    "import 'node:fs';",
  ],
  [
    'domain framework import',
    'packages/domain/src/index.ts',
    "export * from 'fastify';",
  ],
  [
    'application persistence shortcut',
    'packages/application/src/index.ts',
    "import '../../persistence/src/index.js';",
  ],
  [
    'server bypass of SDK adapter',
    'apps/server/src/index.ts',
    "import '@polymarket/client';",
  ],
  [
    'private workspace subpath',
    'apps/server/src/index.ts',
    "import '@desk/persistence/dist/index.js';",
  ],
  [
    'writer capability',
    'apps/server/src/index.ts',
    'export function placeOrder() {}',
  ],
  [
    'paper capability',
    'apps/server/src/index.ts',
    'export class PaperTradingExchange {}',
  ],
  [
    'browser server environment',
    'apps/web/src/App.tsx',
    'export const x = process.env;',
  ],
  [
    'credential name in browser',
    'apps/web/src/App.tsx',
    "export const x = 'POLYMARKET_API_SECRET';",
  ],
];
for (const [name, file, source] of denied) {
  test('rejects ' + name, () => {
    assert.notEqual(checkWorkspace({ sources: { [file]: source } }).length, 0);
  });
}

test('rejects a forbidden dependency even if no source imports it', () => {
  const manifest = {
    name: '@desk/web',
    private: true,
    type: 'module',
    dependencies: { '@desk/persistence': 'workspace:*' },
  };
  assert.match(
    checkWorkspace({ manifests: { 'apps/web': manifest } }).join('\n'),
    /Forbidden dependencies/,
  );
});

test('rejects dependency aliases that hide SDK code behind an allowed name', () => {
  const manifest = {
    name: '@desk/web',
    private: true,
    type: 'module',
    dependencies: { react: 'npm:@polymarket/client@0.13.0' },
  };
  assert.match(
    checkWorkspace({ manifests: { 'apps/web': manifest } }).join('\n'),
    /exact version/,
  );
});
