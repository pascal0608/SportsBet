import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const map = JSON.parse(/<script type="importmap">([\s\S]*?)<\/script>/.exec(html)[1]).imports;
const modules = dir => readdirSync(new URL(`../${dir}/`, import.meta.url), { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? modules(`${dir}/${e.name}`) : e.name.endsWith('.js') ? [`${dir}/${e.name}`] : []);

test('chaque module JS est versionné dans l\'import map, avec la même version', () => {
  const version = /main\.js\?v=([^"]+)"/.exec(html)[1];
  for (const m of modules('assets/js')) assert.equal(map[`./${m}`], `./${m}?v=${version}`, m);
  assert.equal(Object.keys(map).length, modules('assets/js').length, 'entrée orpheline dans l\'import map');
  for (const [, v] of html.matchAll(/href="assets\/css\/[a-z-]+\.css\?v=([^"]+)"/g)) assert.equal(v, version, 'CSS');
  assert.equal([...html.matchAll(/href="assets\/css\/[a-z-]+\.css"/g)].length, 0, 'CSS non versionnée');
});
