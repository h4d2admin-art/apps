import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { verifyExistingArtifact, uploadExistingRelease } from '../scripts/release-existing-windows.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'hamdars-release-'));
  const bytes = Buffer.alloc(512); bytes.write('MZ'); bytes.writeUInt32LE(128, 0x3c); bytes.write('PE\0\0', 128); bytes.writeUInt16LE(0x14c, 132); bytes.writeUInt16LE(0x10b, 152);
  const fileName = 'Hamdars-test-Windows-x64.exe';
  const manifest = { schemaVersion: 1, architecture: 'x64', format: 'portable', version: 'test', tag: 'vtest', fileName, bytes: bytes.length, sha256: digest(bytes) };
  const paths = { manifestFile: join(dir, 'manifest.json'), artifactFile: join(dir, fileName), checksumsFile: join(dir, 'SHA256SUMS.txt') };
  await writeFile(paths.manifestFile, JSON.stringify(manifest)); await writeFile(paths.artifactFile, bytes); await writeFile(paths.checksumsFile, `${manifest.sha256}  ${fileName}\n`);
  return { dir, bytes, paths, manifest, verified: await verifyExistingArtifact(paths), cleanup: () => rm(dir, { recursive: true, force: true }) };
}
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
function transport({ release, noCommits = false, uploadHost = 'uploads.github.com' } = {}) {
  const calls = [];
  const fakeFetch = async (url, init) => {
    const address = new URL(url), method = init.method || 'GET';
    calls.push({ url: address.href, method, json: typeof init.body === 'string' ? JSON.parse(init.body) : undefined });
    if (address.hostname === 'uploads.github.com' && method === 'POST') {
      const chunks = []; for await (const chunk of init.body) chunks.push(chunk);
      const bytes = Buffer.concat(chunks), name = address.searchParams.get('name');
      return json({ name, size: bytes.length, digest: `sha256:${digest(bytes)}`, browser_download_url: `https://github.com/owner/repo/releases/download/vtest/${name}` }, 201);
    }
    if (address.pathname.endsWith('/commits')) return noCommits ? json({ message: 'Git Repository is empty.' }, 409) : json([{ sha: 'a'.repeat(40) }]);
    if (address.pathname.endsWith('/contents/HAMDARS-RELEASE.md') && method === 'PUT') return json({ commit: { sha: 'b'.repeat(40) } }, 201);
    if (address.pathname.includes('/releases/tags/')) return release ? json(release) : json({ message: 'Not Found' }, 404);
    if (address.pathname.endsWith('/releases') && method === 'GET') return json([]);
    if (address.pathname.endsWith('/releases') && method === 'POST') return json({ id: 123, draft: true, upload_url: `https://${uploadHost}/repos/owner/repo/releases/123/assets{?name,label}`, html_url: 'https://github.com/owner/repo/releases/123', assets: [] }, 201);
    if (address.pathname.endsWith('/releases/123') && method === 'PATCH') return json({ id: 123, draft: false, html_url: 'https://github.com/owner/repo/releases/tag/vtest' });
    if (address.pathname === '/repos/owner/repo') return json({ default_branch: 'main', private: true });
    throw new Error(`Unexpected mocked request: ${method} ${address.href}`);
  };
  return { calls, fakeFetch };
}
const args = (f, t, extra = {}) => ({ verified: f.verified, repo: 'owner/repo', tag: 'vtest', token: 'synthetic-test-token', fetchImpl: t.fakeFetch, ...extra });

test('existing production artifact remains byte-identical and no rebuild occurs during verification', async () => {
  const path = new URL('../release/Hamdars-1.0.0-Windows-x64.exe', import.meta.url);
  const before = await stat(path);
  const result = await verifyExistingArtifact();
  assert.equal(result.bytes, 99944429);
  assert.equal(result.sha256, 'b0d2826c0d488bc5326d8af729c97da90796977d0fa7690f163bb7b176117d19');
  assert.equal(result.wrapperMachine, 0x14c);
  assert.equal((await stat(path)).mtimeMs, before.mtimeMs);
});
test('corrupt, truncated and mismatched checksum files are rejected before upload', async () => {
  const f = await fixture();
  try {
    const changed = Buffer.from(f.bytes); changed[300] = 1;
    await writeFile(f.paths.artifactFile, changed);
    await assert.rejects(verifyExistingArtifact(f.paths), /SHA256/);
    await writeFile(f.paths.artifactFile, f.bytes.subarray(0, 200));
    await assert.rejects(verifyExistingArtifact(f.paths), /size/);
    await writeFile(f.paths.artifactFile, f.bytes);
    await writeFile(f.paths.checksumsFile, `${'0'.repeat(64)}  ${f.manifest.fileName}\n`);
    await assert.rejects(verifyExistingArtifact(f.paths), /SHA256SUMS/);
  } finally { await f.cleanup(); }
});
test('default release mode uploads the exact existing bytes to a draft and never publishes', async () => {
  const f = await fixture(), t = transport();
  try {
    const result = await uploadExistingRelease(args(f, t));
    assert.equal(result.draft, true); assert.equal(result.assets.length, 2);
    assert.equal(result.assets[0].downloadUrl, undefined, 'draft URLs must not be advertised as public downloads');
    const created = t.calls.find(c => c.method === 'POST' && c.url.endsWith('/releases'));
    assert.equal(created.json.draft, true);
    assert.equal(t.calls.filter(c => c.method === 'PATCH').length, 0);
    assert.equal(t.calls.filter(c => c.method === 'POST' && c.url.startsWith('https://uploads.github.com/')).length, 2);
  } finally { await f.cleanup(); }
});
test('explicit publication happens only after both unchanged files are confirmed uploaded', async () => {
  const f = await fixture(), t = transport();
  try {
    const result = await uploadExistingRelease(args(f, t, { publish: true }));
    assert.equal(result.draft, false); assert.ok(result.assets.every(a => a.downloadUrl));
    assert.equal(t.calls.at(-1).method, 'PATCH'); assert.deepEqual(t.calls.at(-1).json, { draft: false });
    assert.equal(t.calls.slice(0, -1).filter(c => c.url.startsWith('https://uploads.github.com/')).length, 2);
  } finally { await f.cleanup(); }
});
test('asset collisions and unexpected upload destinations never overwrite or receive a token', async () => {
  const f = await fixture();
  try {
    const release = { id: 123, draft: true, upload_url: 'https://uploads.github.com/repos/owner/repo/releases/123/assets{?name}', html_url: 'https://github.com/owner/repo/releases/123', assets: [{ name: f.manifest.fileName, size: 512, digest: `sha256:${'0'.repeat(64)}` }] };
    let t = transport({ release });
    await assert.rejects(uploadExistingRelease(args(f, t)), /not overwritten/);
    assert.ok(t.calls.every(c => c.method === 'GET'));
    t = transport({ uploadHost: 'untrusted.example' });
    await assert.rejects(uploadExistingRelease(args(f, t)), /unexpected asset upload destination/);
    assert.ok(t.calls.every(c => !c.url.startsWith('https://untrusted.example')));
  } finally { await f.cleanup(); }
});
test('empty repository requires an explicit initialization option and preserves private repository settings', async () => {
  const f = await fixture();
  try {
    let t = transport({ noCommits: true });
    await assert.rejects(uploadExistingRelease(args(f, t)), /no commits/);
    assert.ok(t.calls.every(c => c.method === 'GET'));
    t = transport({ noCommits: true });
    const result = await uploadExistingRelease(args(f, t, { initializeEmptyRepo: true }));
    assert.equal(result.draft, true);
    assert.equal(t.calls.filter(c => c.method === 'PUT').length, 1);
    assert.ok(t.calls.every(c => c.method !== 'DELETE'));
    assert.ok(t.calls.every(c => !(c.method === 'PATCH' && c.url.endsWith('/repos/owner/repo'))));
  } finally { await f.cleanup(); }
});
test('published releases are not modified without explicit publication intent', async () => {
  const f = await fixture(), t = transport({ release: { id: 123, draft: false, assets: [] } });
  try { await assert.rejects(uploadExistingRelease(args(f, t)), /already public/); assert.ok(t.calls.every(c => c.method === 'GET')); }
  finally { await f.cleanup(); }
});
