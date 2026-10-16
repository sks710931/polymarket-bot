import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { builtinModules } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const policy = {
  'packages/domain': [],
  'packages/application': ['@desk/domain'],
  'packages/polymarket-adapter': ['@desk/domain', '@polymarket/client'],
  'packages/market-data': ['@desk/domain'],
  'packages/persistence': ['@desk/domain'],
  'packages/shared-contracts': [],
  'apps/server': [
    '@desk/domain',
    '@desk/application',
    '@desk/polymarket-adapter',
    '@desk/market-data',
    '@desk/persistence',
    '@desk/shared-contracts',
    'fastify',
  ],
  'apps/web': ['@desk/shared-contracts', 'react', 'react-dom'],
};
const tooling = {
  'apps/web': ['vite', '@types/react', '@types/react-dom'],
};
const builtins = new Set(
  builtinModules.map((name) => name.replace(/^node:/, '')),
);
const writerNames = new Set([
  'placeOrder',
  'postOrder',
  'cancelOrder',
  'cancelOrders',
  'signOrder',
  'PaperTradingExchange',
  'LiveTradingExchange',
]);
const normalize = (value) => value.replaceAll('\\', '/');
const inside = (file, directory) =>
  file === directory || file.startsWith(directory + '/');
const packageName = (specifier) =>
  specifier.startsWith('@')
    ? specifier.split('/').slice(0, 2).join('/')
    : specifier.split('/')[0];

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (['node_modules', 'dist'].includes(entry.name)) return [];
    const file = path.join(directory, entry.name);
    return entry.isDirectory()
      ? sourceFiles(file)
      : /\.(?:[cm]?[jt]s|[jt]sx)$/.test(file)
        ? [file]
        : [];
  });
}

// Overrides let the negative tests validate the same checker without writing bad source.
export function checkWorkspace({ sources = {}, manifests = {} } = {}) {
  const errors = [];
  const fail = (file, reason) =>
    errors.push(normalize(path.relative(root, file)) + ': ' + reason);
  const records = Object.entries(policy).map(([directory, allowed]) => {
    const location = path.join(root, directory);
    const file = path.join(location, 'package.json');
    const manifest =
      manifests[directory] ?? JSON.parse(readFileSync(file, 'utf8'));
    const configPath = path.join(location, 'tsconfig.json');
    const config = ts.readConfigFile(configPath, ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(
      config.config,
      ts.sys,
      location,
    );
    return {
      directory,
      location: normalize(location),
      file,
      manifest,
      allowed,
      options: parsed.options,
    };
  });
  const byName = new Map(
    records.map((record) => [record.manifest.name, record]),
  );
  const owner = (file) =>
    records.find((record) => inside(normalize(file), record.location));
  for (const top of ['apps', 'packages']) {
    for (const entry of readdirSync(path.join(root, top), {
      withFileTypes: true,
    })) {
      if (entry.isDirectory() && !Object.hasOwn(policy, top + '/' + entry.name))
        fail(
          path.join(root, top, entry.name),
          'Workspace is outside the eight-package I1 inventory',
        );
    }
  }
  for (const record of records) {
    const { file, manifest, allowed, directory } = record;
    const expectedName = '@desk/' + path.basename(directory);
    if (manifest.name !== expectedName)
      fail(file, 'Expected package name ' + expectedName);
    if (!manifest.private || manifest.type !== 'module')
      fail(file, 'Workspaces must be private ESM packages');
    if (manifest.imports || record.options.paths)
      fail(
        file,
        'Import/path aliases are not permitted; use workspace package exports',
      );
    for (const key of [
      'dependencies',
      'optionalDependencies',
      'peerDependencies',
      'devDependencies',
    ]) {
      for (const [name, version] of Object.entries(manifest[key] ?? {})) {
        const permitted =
          key === 'devDependencies' ? (tooling[directory] ?? []) : allowed;
        if (!permitted.includes(name))
          fail(file, 'Forbidden ' + key + ' entry ' + name);
        if (name.startsWith('@desk/')) {
          if (version !== 'workspace:*')
            fail(file, 'Internal dependencies must use workspace:*');
        } else if (!/^\d+\.\d+\.\d+$/.test(version))
          fail(file, 'External dependency must have an exact version: ' + name);
      }
    }
    if (directory.startsWith('packages/')) {
      const exported = manifest.exports?.['.'];
      if (
        Object.keys(manifest.exports ?? {}).join() !== '.' ||
        exported?.types !== './dist/index.d.ts' ||
        exported?.import !== './dist/index.js'
      )
        fail(file, 'Expose only the typed dist/index package entry point');
    }
    for (const source of sourceFiles(record.location)) {
      const relative = normalize(path.relative(root, source));
      const text = sources[relative] ?? readFileSync(source, 'utf8');
      const ast = ts.createSourceFile(
        source,
        text,
        ts.ScriptTarget.Latest,
        true,
        source.endsWith('tsx') ? ts.ScriptKind.TSX : undefined,
      );
      const imports = [];
      const visit = (node) => {
        if (
          (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
          node.moduleSpecifier
        )
          imports.push(node.moduleSpecifier);
        if (
          ts.isImportEqualsDeclaration(node) &&
          ts.isExternalModuleReference(node.moduleReference) &&
          node.moduleReference.expression
        )
          imports.push(node.moduleReference.expression);
        if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
          imports.push(node.argument.literal);
        if (
          ts.isCallExpression(node) &&
          (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
            (ts.isIdentifier(node.expression) &&
              node.expression.text === 'require'))
        ) {
          if (node.arguments[0]) imports.push(node.arguments[0]);
          else fail(source, 'Import/require must name a static module');
        }
        if (ts.isIdentifier(node) && writerNames.has(node.text))
          fail(
            source,
            'Exchange writer/paper capability is outside I1: ' + node.text,
          );
        if (
          [
            'apps/web',
            'packages/domain',
            'packages/application',
            'packages/shared-contracts',
          ].includes(directory)
        ) {
          if (
            ts.isPropertyAccessExpression(node) &&
            ts.isIdentifier(node.expression) &&
            node.expression.text === 'process' &&
            node.name.text === 'env'
          )
            fail(
              source,
              'Server environment access is forbidden in this workspace',
            );
          if (
            (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) &&
            /^POLYMARKET_API_/.test(node.text)
          )
            fail(
              source,
              'Server credential reference is forbidden in this workspace',
            );
        }
        ts.forEachChild(node, visit);
      };
      visit(ast);
      for (const literal of imports) {
        if (!ts.isStringLiteralLike(literal)) {
          fail(source, 'Dynamic module specifier cannot be checked');
          continue;
        }
        const specifier = literal.text;
        const name = packageName(specifier);
        if (builtins.has(specifier.replace(/^node:/, ''))) {
          if (
            ![
              'apps/server',
              'packages/polymarket-adapter',
              'packages/market-data',
              'packages/persistence',
            ].includes(directory)
          )
            fail(
              source,
              'Node infrastructure import is forbidden: ' + specifier,
            );
          continue;
        }
        if (specifier.startsWith('node:')) {
          fail(source, 'Unknown Node module ' + specifier);
          continue;
        }
        const declared = Object.hasOwn(manifest.dependencies ?? {}, name);
        const devTool =
          !relative.includes('/src/') &&
          (tooling[directory] ?? []).includes(name) &&
          Object.hasOwn(manifest.devDependencies ?? {}, name);
        if (!specifier.startsWith('.') && !(declared || devTool)) {
          fail(source, 'Undeclared or forbidden import ' + specifier);
          continue;
        }
        const result = ts.resolveModuleName(
          specifier,
          source,
          record.options,
          ts.sys,
        ).resolvedModule;
        const resolved = result
          ? existsSync(result.resolvedFileName)
            ? realpathSync(result.resolvedFileName)
            : result.resolvedFileName
          : specifier.startsWith('.')
            ? path.resolve(path.dirname(source), specifier)
            : undefined;
        const target = resolved && owner(resolved);
        if (target && target !== record) {
          if (
            !allowed.includes(target.manifest.name) ||
            specifier !== target.manifest.name ||
            !declared
          )
            fail(
              source,
              'Forbidden cross-workspace edge/private path: ' + specifier,
            );
        } else if (specifier.startsWith('.')) {
          if (!resolved || !inside(normalize(resolved), record.location))
            fail(source, 'Relative import escapes its workspace: ' + specifier);
          else if (!result && !existsSync(resolved))
            fail(source, 'Unresolved local import ' + specifier);
        } else if (byName.has(name)) {
          if (!allowed.includes(name) || specifier !== name)
            fail(source, 'Forbidden workspace import ' + specifier);
          // Declarations may not exist before the first build.
        } else if (!result)
          fail(source, 'Unresolved external import ' + specifier);
      }
    }
  }
  return [...new Set(errors)];
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const errors = checkWorkspace();
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else
    console.log(
      'PASS: eight I1 workspaces; imports, manifests, exports, and read-only composition boundaries',
    );
}
