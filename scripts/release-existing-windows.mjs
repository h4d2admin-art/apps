import { createReadStream } from 'node:fs';
import { open, readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifestPath = resolve(root, 'distribution/windows-existing.json');
const releaseDirectory = resolve(root, 'release');
const apiOrigin = 'https://api.github.com';

export async function sha256(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

/** No build, install, package or source mutation is performed by this module. */
export async function verifyExistingArtifact({ manifestFile = manifestPath, artifactFile, checksumsFile } = {}) {
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
  if (manifest.schemaVersion !== 1 || manifest.architecture !== 'x64' || manifest.format !== 'portable' || !/^[a-f0-9]{64}$/.test(manifest.sha256) || basename(manifest.fileName) !== manifest.fileName) throw new Error('Invalid Windows artifact manifest.');
  const path = artifactFile || resolve(releaseDirectory, manifest.fileName);
  const checksums = checksumsFile || resolve(releaseDirectory, 'SHA256SUMS.txt');
  const info = await stat(path);
  if (!info.isFile() || info.size !== manifest.bytes) throw new Error('The existing EXE is missing, incomplete, or has an unexpected size. Do not upload it.');
  const handle = await open(path, 'r');
  let wrapperMachine;
  try {
    const dos = Buffer.alloc(64);
    await handle.read(dos, 0, dos.length, 0);
    if (dos.toString('ascii', 0, 2) !== 'MZ') throw new Error('The existing file is not a Windows executable.');
    const offset = dos.readUInt32LE(0x3c);
    if (offset + 26 > info.size) throw new Error('Invalid Windows PE offset.');
    const pe = Buffer.alloc(26);
    await handle.read(pe, 0, pe.length, offset);
    if (pe.toString('hex', 0, 4) !== '50450000') throw new Error('Invalid Windows PE signature.');
    wrapperMachine = pe.readUInt16LE(4);
    if (![0x14c, 0x8664].includes(wrapperMachine) || ![0x10b, 0x20b].includes(pe.readUInt16LE(24))) throw new Error('Unsupported Windows PE format.');
  } finally { await handle.close(); }
  const digest = await sha256(path);
  if (digest !== manifest.sha256) throw new Error('Existing EXE SHA256 does not match the verified manifest. No upload was attempted.');
  const checksumText = await readFile(checksums, 'utf8');
  const line = checksumText.split(/\r?\n/).find(line => line.trim().endsWith(manifest.fileName));
  if (!line || line.trim().split(/\s+/)[0].toLowerCase() !== digest) throw new Error('SHA256SUMS.txt does not match the existing EXE.');
  return { manifest, artifactFile: path, checksumsFile: checksums, wrapperMachine, bytes: info.size, sha256: digest };
}

export async function uploadExistingRelease({ verified, repo, tag, token, publish = false, initializeEmptyRepo = false, fetchImpl = fetch }) {
  if (!/^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/.test(repo) || ['.', '..'].includes(repo.split('/')[1])) throw new Error('Use an owner/repository GitHub name.');
  if (!tag || tag.length > 128 || /[\x00-\x20]/.test(tag)) throw new Error('Invalid release tag.');
  if (!token) throw new Error('Use an existing GH_TOKEN or GITHUB_TOKEN binding; never put a token in source code or chat.');
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Hamdars-existing-artifact-publisher' };
  async function request(url, options = {}, allowed = []) {
    const response = await fetchImpl(url, { ...options, headers: { ...headers, ...options.headers }, signal: AbortSignal.timeout(600000) });
    let body;
    try { body = await response.json(); } catch { body = {}; }
    if (!response.ok && !allowed.includes(response.status)) throw new Error(`GitHub HTTP ${response.status}: ${body.message || 'Request failed'}`);
    return { status: response.status, body };
  }
  const repositoryUrl = `${apiOrigin}/repos/${repo}`;
  const { body: repository } = await request(repositoryUrl);
  let { status, body: commits } = await request(`${repositoryUrl}/commits?per_page=1`, {}, [409]);
  let target = status === 409 ? undefined : commits[0]?.sha;
  if (!target) {
    if (!initializeEmptyRepo) throw new Error('The GitHub repository has no commits. Add its first commit, or explicitly pass --initialize-empty-repo to add only HAMDARS-RELEASE.md.');
    const text = `# Hamdars Windows release\n\nExisting verified portable Windows x64 build ${verified.manifest.version}.\n\nSHA256: ${verified.sha256}\n\nNo application rebuild is performed by the release upload.\n`;
    const { body: initialized } = await request(`${repositoryUrl}/contents/HAMDARS-RELEASE.md`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'docs: initialize existing Hamdars Windows distribution', content: Buffer.from(text).toString('base64') }) });
    target = initialized.commit?.sha;
    if (!target) throw new Error('GitHub did not confirm the initial commit; no release was created.');
  }
  let { body: release, status: releaseStatus } = await request(`${repositoryUrl}/releases/tags/${encodeURIComponent(tag)}`, {}, [404]);
  if (releaseStatus === 404) {
    const { body: releases } = await request(`${repositoryUrl}/releases?per_page=100`);
    release = releases.find(item => item.tag_name === tag);
  }
  if (release && !release.draft && !publish) throw new Error('That release is already public. Default mode only uploads to drafts; use --publish explicitly if you intend a public update.');
  if (!release) {
    const notes = `نسخه قابل‌حمل هم‌درس برای Windows 10/11 x64.\n\nفایل موجود بدون بازسازی بارگذاری شده است. نصب Node.js و اتصال اینترنت برای استفاده لازم نیست.\n\nSize: ${verified.bytes} bytes\nSHA256: ${verified.sha256}\n\nThis is a portable app, not a setup wizard. No native Windows execution is claimed by the local structural verification.\n`;
    ({ body: release } = await request(`${repositoryUrl}/releases`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tag_name: tag, target_commitish: target || repository.default_branch, name: `Hamdars ${verified.manifest.version} — Windows x64`, body: notes, draft: true, prerelease: false }) }));
  }
  const uploadUrl = new URL(release.upload_url.replace(/\{.*$/, ''));
  if (uploadUrl.protocol !== 'https:' || uploadUrl.hostname !== 'uploads.github.com' || uploadUrl.port || uploadUrl.username || uploadUrl.password) throw new Error('GitHub returned an unexpected asset upload destination.');
  const assets = [
    { path: verified.artifactFile, name: verified.manifest.fileName, bytes: verified.bytes, sha256: verified.sha256, contentType: 'application/octet-stream' },
    { path: verified.checksumsFile, name: 'SHA256SUMS.txt', bytes: (await stat(verified.checksumsFile)).size, sha256: await sha256(verified.checksumsFile), contentType: 'text/plain' },
  ];
  const confirmedAssets = [];
  for (const asset of assets) {
    const existing = (release.assets || []).find(item => item.name === asset.name);
    if (existing) {
      if (existing.size !== asset.bytes || existing.digest !== `sha256:${asset.sha256}`) throw new Error(`Asset ${asset.name} already exists and cannot be verified as identical. It was not overwritten; review it in GitHub.`);
      confirmedAssets.push(existing); continue;
    }
    const destination = new URL(uploadUrl); destination.searchParams.set('name', asset.name);
    const stream = createReadStream(asset.path);
    let uploaded;
    try {
      ({ body: uploaded } = await request(destination.href, { method: 'POST', headers: { 'Content-Type': asset.contentType, 'Content-Length': String(asset.bytes) }, body: stream, duplex: 'half' }));
    } finally { stream.destroy(); }
    if (uploaded.size !== asset.bytes || (uploaded.digest && uploaded.digest !== `sha256:${asset.sha256}`)) throw new Error(`GitHub did not confirm ${asset.name}'s size/digest. The draft was retained for review.`);
    confirmedAssets.push(uploaded);
  }
  if (publish && release.draft) ({ body: release } = await request(`${repositoryUrl}/releases/${release.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draft: false }) }));
  return { draft: release.draft, htmlUrl: release.html_url, assets: confirmedAssets.map(asset => ({ name: asset.name, bytes: asset.size, downloadUrl: release.draft ? undefined : asset.browser_download_url })) };
}

async function main() {
  const { values } = parseArgs({ options: {
    repo: { type: 'string', default: 'h4d2admin-art/apps' }, tag: { type: 'string' },
    'dry-run': { type: 'boolean', default: false }, publish: { type: 'boolean', default: false },
    'initialize-empty-repo': { type: 'boolean', default: false },
    file: { type: 'string' }, checksums: { type: 'string' }, manifest: { type: 'string' },
  } });
  const verified = await verifyExistingArtifact({ artifactFile: values.file, checksumsFile: values.checksums, manifestFile: values.manifest });
  console.log(JSON.stringify({ verified: true, file: verified.manifest.fileName, bytes: verified.bytes, sha256: verified.sha256, format: verified.manifest.format, payloadArchitecture: 'x64', rebuilt: false }, null, 2));
  if (values['dry-run']) return;
  const result = await uploadExistingRelease({ verified, repo: values.repo, tag: values.tag || verified.manifest.tag, token: process.env.GH_TOKEN || process.env.GITHUB_TOKEN, publish: values.publish, initializeEmptyRepo: values['initialize-empty-repo'] });
  console.log(JSON.stringify(result, null, 2));
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main().catch(error => { console.error(error.message); process.exitCode = 1; });
