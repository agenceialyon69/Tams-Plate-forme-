#!/usr/bin/env node

/**
 * 🤖 TAMS Auto-Sync
 * Surveillance automatique des dossiers + commit auto sur GitHub
 * ZÉRO configuration - ça marche out of the box
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration auto-détectée
const REPO_DIR = process.cwd();
const TAMS_REPO = 'agenceialyon69/Tams-Plate-forme-';

// Détecte l'outil depuis le répertoire
function detectTool() {
  const toolNames = ['bolt', 'lovable', 'replit', 'base44'];
  for (const tool of toolNames) {
    if (REPO_DIR.toLowerCase().includes(tool)) {
      const branchMap = {
        'bolt': 'bolt-ai',
        'lovable': 'lovable-ui',
        'replit': 'replit-backend',
        'base44': 'base44-data'
      };
      return branchMap[tool];
    }
  }
  return 'auto-update';
}

// Hash fichier pour détecter les changements
function getFileHash(filePath) {
  try {
    return require('crypto')
      .createHash('md5')
      .update(fs.readFileSync(filePath, 'utf8'))
      .digest('hex');
  } catch {
    return null;
  }
}

// Synchronise avec GitHub
function syncToGithub() {
  const branch = detectTool();
  
  try {
    console.log(`🔄 [${new Date().toLocaleTimeString()}] Synchronisation ${branch}...`);
    
    // Config git
    execSync('git config user.email "auto@tams.local"');
    execSync('git config user.name "TAMS Auto"');
    
    // Ajoute tous les changements
    execSync('git add .');
    
    // Check s'il y a des changements
    const status = execSync('git status --porcelain', { encoding: 'utf8' });
    if (!status.trim()) {
      console.log('✅ Aucun changement');
      return;
    }
    
    // Commit
    const timestamp = new Date().toISOString();
    execSync(`git commit -m "Auto: ${branch} update - ${timestamp}"`);
    
    // Push sur la branche dédiée
    execSync(`git push origin ${branch} 2>/dev/null || git push origin HEAD:${branch}`);
    
    // Merge auto vers main
    try {
      execSync('git checkout main');
      execSync(`git merge ${branch} --no-ff -m "Auto-merge: ${branch} → main"`);
      execSync('git push origin main');
      console.log(`✅ Mergé sur main`);
    } catch {
      console.log('⚠️ Merge déjà à jour');
    }
    
  } catch (error) {
    console.error('❌ Erreur sync:', error.message);
  }
}

// Surveillance fichiers
function watchFiles() {
  const hashes = {};
  
  console.log('🚀 TAMS Auto-Sync démarré');
  console.log(`📁 Dossier: ${REPO_DIR}`);
  console.log(`🔀 Branche: ${detectTool()}\n`);
  
  // Scan initial
  fs.readdirSync(REPO_DIR).forEach(file => {
    const filePath = path.join(REPO_DIR, file);
    if (fs.statSync(filePath).isFile()) {
      hashes[file] = getFileHash(filePath);
    }
  });
  
  // Écoute les changements
  fs.watch(REPO_DIR, { recursive: true }, (eventType, filename) => {
    if (!filename || filename.includes('.git') || filename.includes('node_modules')) {
      return;
    }
    
    const filePath = path.join(REPO_DIR, filename);
    const newHash = getFileHash(filePath);
    
    if (newHash && hashes[filename] !== newHash) {
      hashes[filename] = newHash;
      console.log(`📝 Changement détecté: ${filename}`);
      
      // Sync après 2 secondes (group les changements rapides)
      setTimeout(syncToGithub, 2000);
    }
  });
}

// Démarre
if (require.main === module) {
  watchFiles();
  
  // Permet l'arrêt gracieux
  process.on('SIGINT', () => {
    console.log('\n👋 TAMS Auto-Sync arrêté');
    process.exit(0);
  });
}

module.exports = { syncToGithub, detectTool };
