// test/dev_server_test.mjs
//
// What the dev server (tools/dev-server.mjs) serves for a URL path.
//
// Run from the repo root, with the Node version in .nvmrc:
//   node --test test/dev_server_test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { resolvePath, contentType } = await import('../tools/dev-server.mjs');

test('the root and directories serve their index page', () => {
    assert.equal(resolvePath('/'), 'index.html');
    assert.equal(resolvePath('/?x=1'), 'index.html');
});

test('files resolve inside public/', () => {
    assert.equal(resolvePath('/main.js'), 'main.js');
    assert.equal(contentType('main.js'), 'text/javascript; charset=utf-8');
});

test('paths that leave public/ are refused', () => {
    assert.equal(resolvePath('/../package.json'), null);
    assert.equal(resolvePath('/%2e%2e/package.json'), null);
    assert.equal(resolvePath('/%E0%A4%A'), null);
});
