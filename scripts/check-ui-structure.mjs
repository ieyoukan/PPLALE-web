import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import postcss from 'postcss';

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(file) : /\.(tsx?|css)$/.test(file) ? [file] : [];
  }));
  return nested.flat();
}

/** Check CSS module bindings and the shared UI boundary without treating dynamic class names as unused. */
export async function auditUiStructure(root = process.cwd()) {
  const source = path.join(root, 'src'), files = await sourceFiles(source), known = new Set(files);
  const issues = [], modules = new Map();
  const relative = file => path.relative(root, file).split(path.sep).join('/');
  const resolve = (specifier, from) => {
    const base = specifier.startsWith('@/') ? path.join(source, specifier.slice(2)) : specifier.startsWith('.') ? path.resolve(path.dirname(from), specifier) : null;
    return base && [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')].find(file => known.has(file));
  };
  for (const file of files.filter(file => file.endsWith('.module.css'))) {
    const classes = new Set();
    postcss.parse(await readFile(file, 'utf8')).walkRules(rule => {
      if (!rule.selector.includes(':global')) for (const match of rule.selector.matchAll(/\.([A-Z_a-z][\w-]*)/g)) classes.add(match[1]);
    });
    modules.set(file, { classes, used: new Set(), dynamic: false, imported: false });
  }
  for (const file of files.filter(file => /\.tsx?$/.test(file))) {
    const tree = ts.createSourceFile(file, await readFile(file, 'utf8'), ts.ScriptTarget.Latest, true), aliases = new Map();
    const isShared = relative(file).startsWith('src/components/shared/');
    for (const node of tree.statements) {
      if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) continue;
      const specifier = node.moduleSpecifier.text, target = resolve(specifier, file);
      if (specifier.endsWith('.module.css') && !target) issues.push(`${relative(file)}: missing CSS module ${specifier}`);
      if (target && modules.has(target) && node.importClause?.name) {
        const stylesheet = modules.get(target); stylesheet.imported = true; aliases.set(node.importClause.name.text, { stylesheet, target });
      }
    }
    const visit = node => {
      if (isShared && ts.isStringLiteral(node)) {
        const target = resolve(node.text, file);
        if (target && relative(target).startsWith('src/components/') && !relative(target).startsWith('src/components/shared/')) issues.push(`${relative(file)}: shared UI imports feature UI ${relative(target)}`);
      }
      if ((ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) && ts.isIdentifier(node.expression) && aliases.has(node.expression.text)) {
        const { stylesheet, target } = aliases.get(node.expression.text);
        const name = ts.isPropertyAccessExpression(node) ? node.name.text : ts.isStringLiteral(node.argumentExpression) ? node.argumentExpression.text : null;
        if (name === null) stylesheet.dynamic = true;
        else {
          stylesheet.used.add(name);
          if (!stylesheet.classes.has(name)) issues.push(`${relative(file)}: unknown CSS class ${name} in ${relative(target)}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(tree);
  }
  for (const [file, stylesheet] of modules) {
    if (!stylesheet.imported) issues.push(`${relative(file)}: CSS module is not imported`);
    else if (!stylesheet.dynamic) for (const name of stylesheet.classes) if (!stylesheet.used.has(name)) issues.push(`${relative(file)}: unused CSS class ${name}`);
  }
  return [...new Set(issues)].sort();
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const issues = await auditUiStructure();
  if (issues.length) { console.error(issues.join('\n')); process.exitCode = 1; }
  else console.log('UI structure: CSS bindings and shared component boundaries are clean.');
}
