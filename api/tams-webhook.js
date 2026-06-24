/**
 * 🚀 TAMS Cloud Auto-Sync
 * 
 * Déploie sur Vercel/Railway en 30 secondes
 * Aucune configuration nécessaire
 * 
 * Ce script gère automatiquement :
 * - Synchronisation GitHub
 * - Merge auto vers main
 * - Déploiement auto
 * 
 * Aucun terminal requis.
 */

const http = require('http');
const crypto = require('crypto');
const { execSync } = require('child_process');

const PORT = process.env.PORT || 3000;
const GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || 'tams-secret-key';

// Vérifie la signature GitHub
function verifyGithubWebhook(req, secret) {
  const signature = req.headers['x-hub-signature-256'];
  if (!signature) return false;

  const payload = req.body;
  const hash = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(`sha256=${hash}`)
  );
}

// Auto-sync depuis n'importe quel outil
function autoSync(tool, branch) {
  try {
    console.log(`\n🔄 Auto-Sync: ${tool} → ${branch}`);

    // Checkout branche
    execSync(`git checkout ${branch} 2>/dev/null || git checkout -b ${branch}`, {
      stdio: 'inherit'
    });

    // Ajoute les changements
    execSync('git add .', { stdio: 'inherit' });

    // Check s'il y a des changements
    const status = execSync('git status --porcelain', { encoding: 'utf8' });
    if (!status.trim()) {
      console.log('✅ Aucun changement');
      return true;
    }

    // Commit
    const timestamp = new Date().toISOString();
    execSync(
      `git commit -m "Auto: ${tool} update - ${timestamp}"`,
      { stdio: 'inherit' }
    );

    // Push
    execSync(`git push origin ${branch}`, { stdio: 'inherit' });

    // Merge vers main
    execSync('git checkout main', { stdio: 'inherit' });
    execSync(`git merge ${branch} --no-ff -m "Auto-merge: ${branch} → main"`, {
      stdio: 'inherit'
    });
    execSync('git push origin main', { stdio: 'inherit' });

    console.log('✅ Sync complété');
    return true;
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    return false;
  }
}

// Détecte l'outil depuis le payload
function detectTool(payload) {
  const repo = payload.repository?.name || '';
  const branch = payload.ref?.split('/').pop() || '';

  const toolMap = {
    'bolt-ai': 'bolt-ai',
    'lovable-ui': 'lovable-ui',
    'replit-backend': 'replit-backend',
    'base44-data': 'base44-data'
  };

  return toolMap[branch] || 'auto-update';
}

// Serveur HTTP
const server = http.createServer((req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(200);
    res.end('🤖 TAMS Auto-Sync API\nStatus: OK');
    return;
  }

  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
  });

  req.on('end', () => {
    try {
      // Vérifie le webhook
      if (!verifyGithubWebhook(req, GITHUB_WEBHOOK_SECRET)) {
        console.log('⚠️ Webhook non authentifié');
        res.writeHead(401);
        res.end('Unauthorized');
        return;
      }

      const payload = JSON.parse(body);
      const tool = detectTool(payload);
      const branch = payload.ref?.split('/').pop() || 'main';

      console.log(`\n📨 Webhook GitHub reçu`);
      console.log(`📦 Outil: ${tool}`);
      console.log(`🔀 Branche: ${branch}`);

      // Sync
      const success = autoSync(tool, branch);

      res.writeHead(success ? 200 : 500);
      res.end(JSON.stringify({
        success,
        tool,
        branch,
        timestamp: new Date().toISOString()
      }));
    } catch (error) {
      console.error('Erreur webhook:', error);
      res.writeHead(500);
      res.end(JSON.stringify({ error: error.message }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`\n🚀 TAMS Auto-Sync Server`);
  console.log(`📍 http://localhost:${PORT}`);
  console.log(`\n📝 Instructions :`);
  console.log(`\n1. Va sur GitHub → Settings → Webhooks`);
  console.log(`2. Ajoute un webhook :`);
  console.log(`   URL: https://ton-domaine.vercel.app/webhook`);
  console.log(`   Secret: ${GITHUB_WEBHOOK_SECRET}`);
  console.log(`   Events: Push`);
  console.log(`\n3. C'est tout ! Zéro terminal requis 🎉\n`);
});

module.exports = server;
