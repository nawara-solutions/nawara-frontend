// Repository checks for nawara-frontend (docs/ARCHITECTURE.md §5, §6). Every function here is pure: it receives already-read
// data and returns a list of problems (strings). File-system access lives in scripts/check-repo.mjs.
import { builtinModules } from 'node:module';
import { posix } from 'node:path';

/** The package scope. GitHub Packages requires an npm scope equal to the owning organization (docs/CONSUMPTION.md). */
export const SCOPE = '@nawara-solutions';

/**
 * UI frameworks and application runtimes, by family. A package may use a family only if its layer lists it. Tauri is an
 * application runtime, not a UI layer: no layer lists it, so shared web code never imports it (docs/ARCHITECTURE.md §8, §10).
 */
const FRAMEWORKS = {
  angular: [/^@angular\//, /^@angular-eslint\//, /^zone\.js$/, /^ng-packagr$/],
  react: [/^react$/, /^react-dom$/, /^@types\/react(-dom)?$/, /^next$/],
  'react-native': [/^react-native$/, /^@react-native\//, /^expo($|-)/, /^@expo\//],
  vue: [/^vue$/, /^@vue\//, /^nuxt$/],
  svelte: [/^svelte$/, /^@sveltejs\//],
  solid: [/^solid-js$/],
  lit: [/^lit$/, /^@lit\//],
  preact: [/^preact$/],
  stencil: [/^@stencil\//],
  qwik: [/^@builder\.io\/qwik/],
  tauri: [/^@tauri-apps\//],
};

/**
 * Package layers: `packages/<layer>/<dir>`. A layer lists the layers it may depend on, the framework families it may use,
 * and the name prefix its packages carry, so a package's framework is visible in its name. A new framework layer (for
 * example `vue`) is added here deliberately, by ADR: `{ mayDependOn: ['foundation', 'vue'], frameworks: ['vue'] }`.
 */
export const LAYERS = {
  foundation: { mayDependOn: ['foundation'], frameworks: [], namePrefix: '' },
  angular: {
    mayDependOn: ['foundation', 'angular'],
    frameworks: ['angular'],
    namePrefix: 'angular-',
  },
};

/** Framework prefixes a foundation package name must not carry (it would claim a framework it must not have). */
const FRAMEWORK_NAME_PREFIX = /^(angular|vue|react|react-native|flutter|tauri|svelte|solid)-/;

/** Product repositories and their workspace scopes: they are applications, never libraries of this repository. */
const PRODUCT_DEPENDENCY = [
  /^nawara-(admin|drive|school)$/,
  /^@nawara-(admin|drive|school)\//,
  /^@school\//,
  /^@drive\//,
];
const PRODUCT_PATH_SPEC = /(^|[/:])nawara-(admin|drive|school)($|[/#.@])/;

/**
 * A dependency spec that is not a registry version range (`file:`, `link:`, `git+…`, `github:`, URLs, `user/repo`, npm
 * aliases). Semver ranges and dist-tags never contain `:` or `/`.
 */
const NON_REGISTRY_SPEC = /[:/]/;

/** npm lifecycle scripts that run on the consumer's machine at install time. Shared packages never define them. */
const INSTALL_SCRIPTS = ['preinstall', 'install', 'postinstall', 'prepublish'];

/** Package managers a published package must not impose on its consumers (School uses pnpm; Admin and Drive use npm). */
const PACKAGE_MANAGER_ENGINES = ['npm', 'pnpm', 'yarn'];

export const GITHUB_PACKAGES_REGISTRY = 'https://npm.pkg.github.com';

const RUNTIME_FIELDS = ['dependencies', 'peerDependencies', 'optionalDependencies'];
const DEPENDENCY_FIELDS = [...RUNTIME_FIELDS, 'devDependencies'];

/** The framework family of a package name, or null. */
export function frameworkOf(name) {
  for (const [family, patterns] of Object.entries(FRAMEWORKS)) {
    if (patterns.some((re) => re.test(name))) return family;
  }
  return null;
}

const frameworkProblem = (layer) =>
  layer === 'foundation'
    ? 'foundation packages are framework-independent'
    : `${layer} packages may use only ${LAYERS[layer].frameworks.join(', ')} (no other framework, no Tauri)`;

/** The root manifest is a private workspace root, never a publishable package. */
export function checkRootManifest(manifest) {
  return manifest.private === true
    ? []
    : ['package.json: the workspace root must be "private": true'];
}

/**
 * One workspace package manifest. `layer` and `dir` come from its path, `packages/<layer>/<dir>/package.json`.
 * `workspaceLayers` maps every workspace package name to its layer.
 */
export function checkPackageManifest({ layer, dir, manifest }, workspaceLayers) {
  const where = `packages/${layer}/${dir}/package.json`;
  const problems = [];
  const rule = LAYERS[layer];
  if (!rule) {
    return [
      `${where}: unknown layer "${layer}" (known: ${Object.keys(LAYERS).join(', ')}); add a layer deliberately in scripts/lib/checks.mjs and docs/ARCHITECTURE.md`,
    ];
  }

  const expectedName = `${SCOPE}/${rule.namePrefix}${dir}`;
  if (manifest.name !== expectedName)
    problems.push(`${where}: name must be "${expectedName}" (found "${manifest.name}")`);
  if (layer === 'foundation' && FRAMEWORK_NAME_PREFIX.test(dir)) {
    problems.push(`${where}: a foundation package must not carry a framework prefix ("${dir}")`);
  }

  // Publication boundary: never public npm by accident. Either unpublished, or bound to GitHub Packages.
  if (manifest.private !== true && manifest.publishConfig?.registry !== GITHUB_PACKAGES_REGISTRY) {
    problems.push(
      `${where}: must be "private": true or set publishConfig.registry to ${GITHUB_PACKAGES_REGISTRY}`,
    );
  }

  for (const script of INSTALL_SCRIPTS) {
    if (manifest.scripts?.[script] !== undefined) {
      problems.push(
        `${where}: the "${script}" install-time script is forbidden in shared packages`,
      );
    }
  }

  // Package-manager neutrality: consumers choose their own package manager.
  if (manifest.packageManager !== undefined) {
    problems.push(
      `${where}: "packageManager" belongs to the workspace root, never to a shared package`,
    );
  }
  for (const pm of PACKAGE_MANAGER_ENGINES) {
    if (manifest.engines?.[pm] !== undefined) {
      problems.push(`${where}: engines.${pm} would impose a package manager on consumers`);
    }
  }

  for (const field of DEPENDENCY_FIELDS) {
    for (const [dep, spec] of Object.entries(manifest[field] ?? {})) {
      if (PRODUCT_DEPENDENCY.some((re) => re.test(dep)) || PRODUCT_PATH_SPEC.test(String(spec))) {
        problems.push(
          `${where}: ${field} "${dep}" is a product repository; products consume this platform, never the reverse`,
        );
        continue;
      }
      if (NON_REGISTRY_SPEC.test(String(spec))) {
        problems.push(
          `${where}: ${field} "${dep}": "${spec}" is not a registry version range; shared packages depend on published versions only`,
        );
      }
      const family = frameworkOf(dep);
      if (family !== null && !rule.frameworks.includes(family)) {
        problems.push(`${where}: ${field} "${dep}" is ${family}; ${frameworkProblem(layer)}`);
      } else if (family !== null && field === 'dependencies') {
        // One framework instance per application: the consuming product provides it.
        problems.push(`${where}: "${dep}" must be a peerDependency, not a dependency`);
      }
      const depLayer = workspaceLayers[dep];
      if (depLayer !== undefined && !rule.mayDependOn.includes(depLayer)) {
        problems.push(
          `${where}: ${field} "${dep}" is a ${depLayer} package; ${layer} may depend only on ${rule.mayDependOn.join(', ')}`,
        );
      }
    }
  }
  return problems;
}

/** Dependency cycles between workspace packages. `graph` maps a package name to the workspace names it depends on. */
export function checkCycles(graph) {
  const problems = [];
  const state = new Map(); // name → 'visiting' | 'done'
  const reported = new Set();
  const visit = (name, path) => {
    if (state.get(name) === 'done') return;
    if (state.get(name) === 'visiting') {
      const cycle = [...path.slice(path.indexOf(name)), name];
      const key = [...cycle].sort().join('|');
      if (!reported.has(key)) {
        reported.add(key);
        problems.push(`dependency cycle: ${cycle.join(' → ')}`);
      }
      return;
    }
    state.set(name, 'visiting');
    for (const dep of graph[name] ?? []) visit(dep, [...path, name]);
    state.set(name, 'done');
  };
  for (const name of Object.keys(graph)) visit(name, []);
  return problems;
}

/** Source files the checker scans inside packages. */
export const SOURCE_FILE = /\.(ts|mts|cts|tsx|js|mjs|cjs|jsx|vue|svelte|html|scss|css|json)$/;
const DATA_FILE = /\.json$/;
const STYLE_FILE = /\.(scss|css)$/;
const TEST_FILE = /\.(spec|test)\.[cm]?[jt]sx?$/;

// Script imports apply to code and component files; Sass/CSS at-rule imports to stylesheets and component files. A Sass
// `@use` inside a JavaScript string (a generator writing Sass, a test probe) is text, not an import.
const SCRIPT_IMPORT =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)['"]([^'"]+)['"]/g;
const STYLE_IMPORT = /(?:@use\s+|@forward\s+|@import\s+)['"]([^'"]+)['"]/g;
const SCRIPT_FILE = /\.(ts|mts|cts|tsx|js|mjs|cjs|jsx|vue|svelte|html)$/;
const STYLE_IMPORT_FILE = /\.(scss|css|vue|svelte|html)$/;

/** The bare package name of an import specifier (`@angular/core/testing` → `@angular/core`), or null for a relative one. */
export function packageOf(specifier) {
  if (specifier.startsWith('.') || specifier.startsWith('/')) return null;
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

const NODE_BUILTINS = new Set(builtinModules);
const isBuiltin = (pkg) => pkg.startsWith('node:') || NODE_BUILTINS.has(pkg);

/**
 * The package a stylesheet specifier names, or null. Sass resolves a bare `@use 'tokens'` relative to the file first, so
 * only scoped (`@scope/…`) and `pkg:` specifiers are packages; `sass:` modules are built in.
 */
function stylePackageOf(specifier) {
  if (specifier.startsWith('sass:')) return null;
  const bare = specifier.startsWith('pkg:') ? specifier.slice(4) : specifier;
  return bare.startsWith('@') ? packageOf(bare) : null;
}

/**
 * Words that belong to a product domain (Drive, School). They never appear in shared source: such code belongs to the
 * product repository. Matched as whole words after splitting camelCase, so `StudentCard` matches and `example` does not.
 */
const PRODUCT_TERMS =
  /\b(students?|instructors?|lessons?|vehicles?|driving|exams?|gradebooks?|classrooms?|attendances?|teachers?|pupils?|daycares?)\b/i;

const splitIdentifiers = (text) =>
  text.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');

/**
 * One source file inside `packages/<layer>/<dir>/…`; `manifest` is its package's manifest. Every package import must be
 * declared in the manifest: npm workspaces hoist undeclared packages and hide the mistake, but a pnpm consumer (School)
 * has a strict `node_modules` and breaks on it.
 */
export function checkSourceFile({ path, layer, text, manifest = {} }, workspaceLayers) {
  const problems = [];
  const rule = LAYERS[layer];
  const packageDir = path.split('/').slice(0, 3).join('/');
  const isStyle = STYLE_FILE.test(path);
  const declared = new Set(
    [...RUNTIME_FIELDS, ...(TEST_FILE.test(path) ? ['devDependencies'] : [])].flatMap((f) =>
      Object.keys(manifest[f] ?? {}),
    ),
  );
  // Data files (token sources, package.json) are scanned for product vocabulary only, never for imports.
  const imports = DATA_FILE.test(path)
    ? []
    : [
        ...(SCRIPT_FILE.test(path) ? text.matchAll(SCRIPT_IMPORT) : []),
        ...(STYLE_IMPORT_FILE.test(path) ? text.matchAll(STYLE_IMPORT) : []),
      ];
  for (const match of imports) {
    const specifier = match[1];
    if (PRODUCT_PATH_SPEC.test(specifier) || /^(\.\.\/)+nawara-/.test(specifier)) {
      problems.push(`${path}: imports "${specifier}" from a product repository`);
      continue;
    }
    if (specifier.startsWith('.') || specifier.startsWith('/')) {
      const target = posix.normalize(posix.join(posix.dirname(path), specifier));
      if (!target.startsWith(`${packageDir}/`)) {
        problems.push(
          `${path}: relative import "${specifier}" leaves its package; import another package by its name`,
        );
      }
      continue;
    }
    const pkg = isStyle ? stylePackageOf(specifier) : packageOf(specifier);
    if (pkg === null || isBuiltin(pkg)) continue;
    const family = frameworkOf(pkg);
    if (rule && family !== null && !rule.frameworks.includes(family)) {
      problems.push(`${path}: imports "${specifier}" (${family}); ${frameworkProblem(layer)}`);
    }
    const depLayer = workspaceLayers[pkg];
    if (rule && depLayer !== undefined && !rule.mayDependOn.includes(depLayer)) {
      problems.push(
        `${path}: imports the ${depLayer} package "${pkg}"; ${layer} may depend only on ${rule.mayDependOn.join(', ')}`,
      );
    }
    if (pkg !== manifest.name && !declared.has(pkg)) {
      problems.push(
        `${path}: imports "${pkg}", which ${packageDir}/package.json does not declare (hoisting hides this under npm; pnpm consumers break)`,
      );
    }
  }
  splitIdentifiers(text)
    .split('\n')
    .forEach((line, index) => {
      const term = line.match(PRODUCT_TERMS);
      if (term)
        problems.push(
          `${path}:${index + 1}: product-domain term "${term[0]}"; product logic belongs to its product repository`,
        );
    });
  return problems;
}

/** Generated package output (`packages/<layer>/<name>/dist/`) is build output and never tracked by git (ADR-0003 §1). */
export function checkTrackedGenerated(trackedPaths) {
  return trackedPaths
    .filter((path) => /^packages\/[^/]+\/[^/]+\/dist\//.test(path))
    .map((path) => `${path}: generated output is tracked by git; dist/ is built, never committed`);
}

/**
 * A token source (a package with `src/**​/*.tokens.json`) holds no hand-written stylesheet: CSS and Sass are generated
 * into dist/ from the token data (ADR-0003 §1). `files` are the package's repository-relative paths.
 */
export function checkTokenSourceStyles(files) {
  if (!files.some((f) => /^packages\/[^/]+\/[^/]+\/src\/.*\.tokens\.json$/.test(f))) return [];
  return files
    .filter((f) => /^packages\/[^/]+\/[^/]+\/src\/.*\.(css|scss|sass|less)$/.test(f))
    .map(
      (f) =>
        `${f}: hand-written stylesheet in a token source; stylesheets are generated into dist/`,
    );
}

/** Every GitHub Actions `uses:` is pinned to a full commit SHA with its release as a comment (the Nawara Core rule). */
export function checkActionPins(fileName, text) {
  const problems = [];
  text.split('\n').forEach((line, index) => {
    const match = line.match(/^\s*(?:-\s*)?uses:\s*(\S+)(.*)$/);
    if (!match) return;
    const [, ref, rest] = match;
    if (ref.startsWith('./')) return;
    const where = `${fileName}:${index + 1}`;
    if (!/^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/.test(ref)) {
      problems.push(
        `${where}: ${ref} must be pinned to a full 40-hex commit SHA (no tag, branch or short SHA)`,
      );
    } else if (!/^\s+#\s*v\d+\.\d+\.\d+\s*$/.test(rest)) {
      problems.push(`${where}: ${ref} must carry its exact release as a comment (# vX.Y.Z)`);
    }
  });
  return problems;
}

/**
 * The ai-standard integration (../ai-standard/README.md). Symlinks: path → exact relative target. Copies: path → the
 * ai-standard file it must equal.
 */
export const SHARED_STANDARD = {
  symlinks: {
    'CONTRIBUTING.md': '../ai-standard/CONTRIBUTING.md',
    'docs/README.md': '../../ai-standard/docs/README.md',
    '.husky/commit-msg': '../../ai-standard/husky/commit-msg',
    '.claude/hooks/design-doc-conformance-trigger.sh':
      '../../../ai-standard/hooks/design-doc-conformance-trigger.sh',
    ...Object.fromEntries(
      ['branch', 'commit', 'pr', 'design-doc'].map((c) => [
        `.claude/commands/${c}.md`,
        `../../../ai-standard/commands/${c}.md`,
      ]),
    ),
    ...Object.fromEntries(
      ['design-conformance', 'docs-writer', 'tech-lead'].map((a) => [
        `.claude/agents/${a}.md`,
        `../../../ai-standard/agents/${a}.md`,
      ]),
    ),
    ...Object.fromEntries(
      ['adr', 'add', 'sdd', 'tdd'].map((t) => [
        `docs/${t}/template.md`,
        `../../../ai-standard/docs/${t}/template.md`,
      ]),
    ),
  },
  copies: {
    'commitlint.config.cjs': 'commitlint.config.cjs',
    '.github/PULL_REQUEST_TEMPLATE.md': 'PULL_REQUEST_TEMPLATE.md',
    '.mcp.json': '.mcp.json',
  },
};

/**
 * `links` maps each expected symlink path to `{ target, resolves }` (target null when the path is missing or not a link).
 * `copies` maps each expected copy path to `{ local, standard }` texts (`standard` undefined without ../ai-standard, as in
 * CI, where the sibling layout does not exist and only the link targets can be checked).
 */
export function checkSharedStandard({ links, copies, standardPresent }) {
  const problems = [];
  for (const [path, expected] of Object.entries(SHARED_STANDARD.symlinks)) {
    const link = links[path];
    if (!link || link.target === null)
      problems.push(`${path}: must be a symlink to ${expected} (ai-standard)`);
    else if (link.target !== expected)
      problems.push(`${path}: symlink points to ${link.target}, expected ${expected}`);
    else if (standardPresent && !link.resolves)
      problems.push(`${path}: symlink to ${expected} does not resolve`);
  }
  for (const [path, source] of Object.entries(SHARED_STANDARD.copies)) {
    const copy = copies[path];
    if (copy?.local === undefined)
      problems.push(`${path}: missing (a real copy of ai-standard/${source})`);
    else if (standardPresent && copy.standard !== undefined && copy.local !== copy.standard) {
      problems.push(
        `${path}: differs from ai-standard/${source}; re-copy it (ai-standard/README.md)`,
      );
    }
  }
  return problems;
}

/** The two Claude Code hooks this repository relies on stay registered in `.claude/settings.json`. */
export const CLAUDE_HOOKS = {
  PreToolUse: 'bash .claude/hooks/guard-sibling-writes.sh',
  PostToolUse: 'bash .claude/hooks/design-doc-conformance-trigger.sh',
};

export function checkClaudeSettings(text) {
  let settings;
  try {
    settings = JSON.parse(text ?? '');
  } catch {
    return ['.claude/settings.json: missing or not valid JSON'];
  }
  const problems = [];
  for (const [event, command] of Object.entries(CLAUDE_HOOKS)) {
    const registered = (settings.hooks?.[event] ?? []).some((entry) =>
      (entry.hooks ?? []).some((h) => h.command === command),
    );
    if (!registered) problems.push(`.claude/settings.json: hooks.${event} must run "${command}"`);
  }
  return problems;
}

/** The cross-repository policy agents must be able to find: it exists, and CLAUDE.md (what agents read) links to it. */
export const CONTRIBUTION_POLICY = 'docs/SHARED-CONTRIBUTION-POLICY.md';

export function checkPolicyDiscoverable({ policyText, claudeText }) {
  const problems = [];
  if (policyText === undefined)
    problems.push(`${CONTRIBUTION_POLICY}: missing (the shared contribution policy)`);
  if (!(claudeText ?? '').includes(`(${CONTRIBUTION_POLICY})`)) {
    problems.push(`CLAUDE.md: must link to ${CONTRIBUTION_POLICY} so agents can find the policy`);
  }
  return problems;
}
