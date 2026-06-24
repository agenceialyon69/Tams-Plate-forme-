const fetch = require('node-fetch');

// Configuration
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO = 'agenceialyon69/Tams-Plate-forme-';
const MAIN_BRANCH = 'main';

// Détecte l'outil depuis le header User-Agent
function detectTool(userAgent) {
  if (userAgent?.includes('bolt')) return 'bolt-ai';
  if (userAgent?.includes('lovable')) return 'lovable-ui';
  if (userAgent?.includes('replit')) return 'replit-backend';
  if (userAgent?.includes('base44')) return 'base44-data';
  return 'auto-update';
}

// Push sur GitHub
async function pushToGitHub(branch, content, message) {
  try {
    const headers = {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
    };

    // Récupère la branche
    const branchRes = await fetch(
      `https://api.github.com/repos/${REPO}/git/refs/heads/${branch}`,
      { headers }
    );

    if (!branchRes.ok) {
      // Crée la branche si elle n'existe pas
      const mainRes = await fetch(
        `https://api.github.com/repos/${REPO}/git/refs/heads/${MAIN_BRANCH}`,
        { headers }
      );
      const mainData = await mainRes.json();
      
      await fetch(`https://api.github.com/repos/${REPO}/git/refs`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ref: `refs/heads/${branch}`,
          sha: mainData.object.sha,
        }),
      });
    }

    // Push le code
    const treeRes = await fetch(
      `https://api.github.com/repos/${REPO}/git/trees`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          tree: [
            {
              path: 'AUTO_UPDATE_CONTENT.txt',
              mode: '100644',
              type: 'blob',
              content: content,
            },
          ],
          base_tree: (await (await fetch(
            `https://api.github.com/repos/${REPO}/git/refs/heads/${branch}`,
            { headers }
          )).json()).object.sha,
        }),
      }
    );

    const treeData = await treeRes.json();

    // Crée un commit
    const commitRes = await fetch(
      `https://api.github.com/repos/${REPO}/git/commits`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: message || `Auto: ${branch} update`,
          tree: treeData.sha,
          parents: [(await (await fetch(
            `https://api.github.com/repos/${REPO}/git/refs/heads/${branch}`,
            { headers }
          )).json()).object.sha],
        }),
      }
    );

    const commitData = await commitRes.json();

    // Update la branche
    await fetch(`https://api.github.com/repos/${REPO}/git/refs/heads/${branch}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ sha: commitData.sha }),
    });

    return true;
  } catch (error) {
    console.error('GitHub push error:', error);
    return false;
  }
}

// Merge vers main
async function mergeToMain(branch) {
  try {
    const headers = {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
    };

    await fetch(`https://api.github.com/repos/${REPO}/merges`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        base: MAIN_BRANCH,
        head: branch,
        commit_message: `Auto-merge: ${branch} → main`,
      }),
    });

    return true;
  } catch (error) {
    console.error('Merge error:', error);
    return false;
  }
}

// Handler principal
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { code, message } = req.body;
    const userAgent = req.headers['user-agent'];
    const branch = detectTool(userAgent);

    // Push sur la branche dédiée
    await pushToGitHub(branch, code, message);

    // Merge auto vers main
    await mergeToMain(branch);

    res.status(200).json({
      success: true,
      branch,
      message: 'Code pushed and merged automatically',
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
