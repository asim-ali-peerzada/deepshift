import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// Bundles the OpenCode Desktop GUI half into one CommonJS file without a
// bundler dependency. The host loads gui.cjs directly from disk, so the file
// must be self-contained: `../src/schedule` and `../src/view-model` are
// inlined. Only the two modules provided by the OpenCode Desktop runtime stay
// external.
//
// The shared modules are already CommonJS-compiled from the same TypeScript
// dependency the extension uses; this script just wraps each module in a tiny
// CommonJS registry and rewrites the relative requires to registry ids.

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const entry = join(root, 'opencode/gui.cts');
const outfile = join(root, 'opencode/gui.cjs');
const externals = new Set(['@opencode/plugin/gui', 'solid-js']);

const id = (file) => relative(root, file).replace(/\\/g, '/');
const modules = new Map();

function resolveImport(from, spec) {
	const base = resolve(dirname(from), spec);
	const candidates = [base, `${base}.ts`, `${base}.cts`, `${base}.tsx`, `${base}.js`, join(base, 'index.ts')];
	for (const candidate of candidates) {
		if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
	}
	throw new Error(`Cannot resolve "${spec}" from ${id(from)}`);
}

function add(file) {
	if (modules.has(file)) return;

	const result = ts.transpileModule(readFileSync(file, 'utf8'), {
		compilerOptions: {
			module: ts.ModuleKind.CommonJS,
			target: ts.ScriptTarget.ES2020,
			esModuleInterop: true,
			removeComments: true,
			sourceMap: false,
		},
		fileName: file,
		reportDiagnostics: true,
	});

	const errors = (result.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
	if (errors.length > 0) {
		throw new Error(
			errors
				.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
				.join('\n')
		);
	}

	const dependencies = [];
	const code = result.outputText.replace(/require\((["'])([^"']+)\1\)/g, (match, _quote, spec) => {
		if (!spec.startsWith('.')) {
			if (!externals.has(spec)) throw new Error(`Unexpected import "${spec}" in ${id(file)}`);
			return match;
		}
		const dependency = resolveImport(file, spec);
		dependencies.push(dependency);
		return `__require(${JSON.stringify(id(dependency))})`;
	});

	modules.set(file, { id: id(file), code });
	for (const dependency of dependencies) add(dependency);
}

add(entry);

const bundle = [
	'"use strict";',
	'var __modules = {',
	[...modules.values()]
		.map((module) => `${JSON.stringify(module.id)}: function (module, exports, require) {\n${module.code}\n}`)
		.join(',\n'),
	'};',
	'var __cache = Object.create(null);',
	'function __require(id) {',
	'	var cached = __cache[id];',
	'	if (cached) return cached.exports;',
	'	var module = (__cache[id] = { exports: {} });',
	'	__modules[id](module, module.exports, require);',
	'	return module.exports;',
	'}',
	`module.exports = __require(${JSON.stringify(id(entry))});`,
	'',
].join('\n');

writeFileSync(outfile, bundle);
console.log(`${id(outfile)}  ${(bundle.length / 1024).toFixed(1)}kb`);
