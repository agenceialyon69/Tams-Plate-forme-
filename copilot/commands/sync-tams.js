/**
 * 🚀 TAMS Copilot Command
 * 
 * Utilisation dans GitHub Copilot Chat :
 * @copilot /sync-tams
 * 
 * Déclenche automatiquement :
 * - Détecte les changements
 * - Commit auto
 * - Push auto
 * - Merge vers main
 */

const { execSync } = require('child_process');

class TAMSCommand {
  static name = 'sync-tams';
  static description = '🤖 Synchronise automatiquement tous les changements vers GitHub';

  static async execute(args) {
    console.log('🚀 TAMS Auto-Sync lancé...\n');

    try {
      // 1. Check status
      const status = execSync('git status --porcelain', { encoding: 'utf8' });
      
      if (!status.trim()) {
        return '✅ Aucun changement à synchroniser';
      }

      console.log('📝 Changements détectés:\n', status);

      // 2. Configure Git
      execSync('git config user.email "auto@tams.local"');
      execSync('git config user.name "TAMS Auto"');

      // 3. Add all
      execSync('git add .');
      console.log('✅ Fichiers ajoutés');

      // 4. Détecte la branche courante
      const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', {
        encoding: 'utf8'
      }).trim();
      
      console.log(`🔀 Branche courante: ${currentBranch}`);

      // 5. Commit
      const timestamp = new Date().toISOString();
      execSync(`git commit -m "Auto: ${currentBranch} update - ${timestamp}"`);
      console.log('✅ Commit créé');

      // 6. Push
      execSync(`git push origin ${currentBranch}`);
      console.log(`✅ Push vers ${currentBranch}`);

      // 7. Merge vers main (si pas déjà sur main)
      if (currentBranch !== 'main') {
        execSync('git checkout main');
        execSync(`git merge ${currentBranch} --no-ff -m "Auto-merge: ${currentBranch} → main"`);
        execSync('git push origin main');
        console.log('✅ Mergé vers main');
        execSync(`git checkout ${currentBranch}`);
      }

      return `
✅ **TAMS Auto-Sync Complété !**

📊 Résumé :
- Branche: ${currentBranch}
- Commit: $(git rev-parse --short HEAD)
- Timestamp: ${timestamp}
- Status: ✅ Synchronized

Tes changements sont maintenant sur GitHub et Railway déploie automatiquement !
      `;

    } catch (error) {
      return `
❌ **Erreur lors de la synchronisation**

${error.message}

💡 Essaie :
\`\`\`bash
git status
\`\`\`
      `;
    }
  }
}

module.exports = TAMSCommand;
