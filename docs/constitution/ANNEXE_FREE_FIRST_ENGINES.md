# ANNEXE À LA CONSTITUTION — ARCHITECTURE FREE-FIRST DES MOTEURS IA

> Règle fondamentale de TAMS. **100 % gratuit ou auto-hébergeable.** Aucune
> fonctionnalité critique ne dépend d'un fournisseur payant. Le système doit
> pouvoir remplacer automatiquement un fournisseur par un autre **sans modifier
> l'architecture**.

État d'implémentation : ✅ fait · 🟡 partiel · ⬜ à faire.

---

## 1. AI ROUTER (CERVEAU) — ✅
Le AI Router choisit automatiquement le meilleur moteur. **L'utilisateur ne choisit jamais le modèle.**
Critères : qualité · vitesse · coût · disponibilité · confidentialité · contexte.

Ordre de priorité (free-first) — implémenté dans `lib/ai.ts`, chaque fournisseur
s'active si sa clé d'env est présente, fallback en chaîne :
1. **Ollama** (local) — `OLLAMA_BASE_URL`
2. **Groq** — `GROQ_API_KEY`
3. **Gemini** (quota gratuit) — `GEMINI_API_KEY`
4. **DeepSeek** — `DEEPSEEK_API_KEY`
5. **Qwen** (DashScope) — `DASHSCOPE_API_KEY`
6. **Mistral** — `MISTRAL_API_KEY`
7. **Hugging Face Inference** (router) — `HF_TOKEN`
8. **OpenRouter** (modèles `:free` uniquement) — `OPENROUTER_API_KEY`

**Aucune dépendance à OpenAI** (le SDK `openai` est interdit ; tout passe par `fetch` OpenAI-compatible). Invariant CI.

## 2. CODAGE — 🟡 (Qwen Coder · DeepSeek Coder · CodeGemma · StarCoder2)
## 3. RAISONNEMENT — ✅ (DeepSeek `deepseek-reasoner` · Gemini · Qwen)
## 4. RÉDACTION — ✅ (Gemini · Qwen · Mistral)
## 5. RÉSUMÉS — ✅ (Gemini Flash · Groq · DeepSeek)
## 6. TRADUCTION — ⬜ (NLLB · Argos Translate · LibreTranslate)

## 7. RECHERCHE DOCUMENTAIRE — 🟡 (LlamaIndex · LangChain · ChromaDB · Qdrant · FAISS)
Toutes les recherches mémoire doivent passer par cette couche.

## 8. MÉMOIRE — 🟡
Memory Graph : **pgvector** si dispo → sinon Qdrant → ChromaDB → FAISS.
Recherche hybride : vectorielle + full-text + graphe.

## 9. STUDIO IMAGE — ✅ (Pollinations actif · ComfyUI/SD/Diffusers en option auto-hébergée)
Toutes les générations passent par le Tool Orchestrator.

## 10. STUDIO VIDÉO — 🟡
Générer · monter · assembler · sous-titrer · optimiser · publier.
Outils : **FFmpeg** (actif ✅) · AnimateDiff · Deforum · SadTalker · Wav2Lip.
Le Chat pilote ces outils.

## 11. MONTAGE VIDÉO (≈ CapCut) — 🟡
Découpage · transitions · sous-titres auto · zoom intelligent · suppression des
silences · musique · voix · effets · export TikTok/Reels/Shorts.
**Moteur principal : FFmpeg** (✅ slideshow 9:16). Les IA pilotent les décisions.

## 12. AUDIO — 🟡
Reconnaissance : **Whisper**. Voix : Piper · Coqui TTS · Edge-TTS.
Musique : **MusicGen** (✅ via HF).

## 13. OCR — ⬜ (Tesseract · EasyOCR)
## 14. VISION — ⬜ (OpenCV · YOLO · MediaPipe · SAM)

## 15. AUTOMATISATION — 🟡 (n8n · LangChain · LlamaIndex) — Workflow Engine

## 16. AGENTS — 🟡
Communication **exclusive** via Event Bus · Agent Runtime · Tool Orchestrator. Jamais d'appels directs.

## 17. OUTILS — 🟡
Tous enregistrés dans le **Tool Registry**. Aucun appel manuel.
Chaque outil : validation · permissions · timeout · retry · rollback · observabilité.

## 18. CHAT — ✅ point d'entrée unique
Le Chat décide automatiquement : quel agent · quel modèle · quel workflow · quels
outils · quoi mémoriser · quoi apprendre · quoi planifier. Les autres pages affichent le résultat.

## 19. PRINCIPES
Chaque outil : gratuit/auto-hébergeable · remplaçable · modulaire · connecté au AI
Router · au Tool Orchestrator · au Memory Graph · au Reflection Engine · à l'Observability.

## 20. OBJECTIF FINAL
TAMS n'est pas une collection d'outils mais un **AI Operating System** où tous les
moteurs collaborent automatiquement sous le contrôle du Chief of Staff.

> Le Chat pilote la plateforme · le Chief of Staff pilote le Chat · le AI Router
> choisit les modèles · le Planner choisit les actions · le Tool Orchestrator
> exécute · le Runtime coordonne · le Reflection Engine apprend · le Memory Graph
> mémorise · le Decision OS améliore les décisions futures.
> **L'utilisateur ne voit qu'une seule intelligence cohérente.**
