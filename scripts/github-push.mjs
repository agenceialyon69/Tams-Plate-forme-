#!/usr/bin/env node
/**
 * Push workspace to GitHub via REST API (no git push needed).
 * Reads all tracked files, creates blobs, tree, commit, then force-updates main.
 */
import { execSync } from 'child_process';
import { readFileSync, statSync } from 'fs';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';

const WORKSPACE = resolve(fileURLToPath(import.meta.url), '..', '..');
const TOKEN = process.env.GITHUB_TOKEN;
const OWNER = 'agenceialyon69';
const REPO = 'Tams-Plate-forme-';
const BRANCH = 'main';
const BASE = 'https://api.github.com';

if (!TOKEN) { console.error('❌ GITHUB_TOKEN not set'); process.exit(1); }

async function api(method, path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`GitHub ${r.status} ${method} ${path}: ${text.slice(0, 400)}`);
  return JSON.parse(text);
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function createBlob(content, encoding = 'base64') {
  return api('POST', `/repos/${OWNER}/${REPO}/git/blobs`, { content, encoding });
}

// Get tracked files
const fileList = execSync('git ls-files', { cwd: WORKSPACE })
  .toString().trim().split('\n').filter(Boolean);

console.log(`📁 Fichiers trackés : ${fileList.length}`);

// Create blobs for each file (batched with small delays to avoid rate limiting)
const treeItems = [];
let done = 0;
const errors = [];

for (const filePath of fileList) {
  try {
    const full = join(WORKSPACE, filePath);
    const raw = readFileSync(full);
    const b64 = raw.toString('base64');
    const stat = statSync(full);
    const mode = (stat.mode & 0o111) ? '100755' : '100644';

    const blob = await createBlob(b64, 'base64');
    treeItems.push({ path: filePath, mode, type: 'blob', sha: blob.sha });
    done++;

    if (done % 25 === 0) {
      console.log(`  → ${done}/${fileList.length} blobs créés...`);
      await sleep(500); // avoid rate limiting
    }
  } catch (e) {
    errors.push({ file: filePath, error: e.message });
    console.warn(`  ⚠️  Skip ${filePath}: ${e.message.slice(0, 80)}`);
  }
}

console.log(`✅ ${done} blobs créés, ${errors.length} erreurs`);

// Create the tree
console.log('🌲 Création du tree...');
const tree = await api('POST', `/repos/${OWNER}/${REPO}/git/trees`, { tree: treeItems });
console.log(`✅ Tree SHA: ${tree.sha}`);

// Create commit
console.log('💾 Création du commit...');
const now = new Date().toISOString();
const commit = await api('POST', `/repos/${OWNER}/${REPO}/git/commits`, {
  message: `feat: TAMS AI OS — Railway deployment ready (${now.slice(0,10)})

- Notifications module avec badge temps réel
- Studio vidéo/audio avec embed YouTube + SoundCloud + génération IA
- railway.toml + nixpacks.toml pour déploiement automatique
- Express sert le frontend Vite en production (service unique)
- Suppression config Render
- API: /notifications + /studio/generate-script`,
  tree: tree.sha,
  parents: [],
  author: { name: 'TAMS Agent', email: 'tams@replit.com', date: now },
  committer: { name: 'TAMS Agent', email: 'tams@replit.com', date: now },
});
console.log(`✅ Commit SHA: ${commit.sha}`);

// Force update main branch
console.log(`🚀 Force update de ${BRANCH}...`);
const ref = await api('PATCH', `/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, {
  sha: commit.sha,
  force: true,
});
console.log(`✅ GitHub main → ${ref.object.sha}`);
console.log(`\n🎉 Push terminé : https://github.com/${OWNER}/${REPO}/tree/${BRANCH}`);
