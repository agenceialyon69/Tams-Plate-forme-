import { Router } from "express";
import { createClient } from "@supabase/supabase-js";

const router = Router();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

/**
 * POST /api/auth/signup
 * Register a new user with email and password
 */
router.post("/auth/signup", async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: "Service d'authentification non configure" });
  }

  const { email, password, fullName } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email et mot de passe requis" });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: "Le mot de passe doit contenir au moins 8 caracteres" });
  }

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: undefined, // Disable email confirmation
      },
    });

    if (error) {
      if (error.message.includes("already registered")) {
        return res.status(409).json({ error: "Un compte existe deja avec cet email" });
      }
      return res.status(400).json({ error: error.message });
    }

    if (!data.user) {
      return res.status(500).json({ error: "Echec de la creation du compte" });
    }

    return res.status(201).json({
      user: { id: data.user.id, email: data.user.email },
      session: data.session,
    });
  } catch (err) {
    req.log?.error?.({ err }, "Signup error");
    return res.status(500).json({ error: "Erreur lors de l'inscription" });
  }
});

/**
 * POST /api/auth/login
 * Sign in with email and password
 */
router.post("/auth/login", async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: "Service d'authentification non configure" });
  }

  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email et mot de passe requis" });
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      if (error.message.includes("Invalid login credentials")) {
        return res.status(401).json({ error: "Email ou mot de passe incorrect" });
      }
      return res.status(401).json({ error: error.message });
    }

    return res.json({
      user: { id: data.user.id, email: data.user.email },
      session: {
        access_token: data.session?.access_token,
        refresh_token: data.session?.refresh_token,
        expires_at: data.session?.expires_at,
      },
    });
  } catch (err) {
    req.log?.error?.({ err }, "Login error");
    return res.status(500).json({ error: "Erreur lors de la connexion" });
  }
});

/**
 * POST /api/auth/logout
 * Sign out the current user
 */
router.post("/auth/logout", async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: "Service d'authentification non configure" });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(400).json({ error: "Token manquant" });
  }

  const token = authHeader.slice(7);

  try {
    const userClient = createClient(supabaseUrl!, supabaseAnonKey!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { error } = await userClient.auth.signOut();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    return res.json({ success: true, message: "Deconnexion reussie" });
  } catch (err) {
    req.log?.error?.({ err }, "Logout error");
    return res.status(500).json({ error: "Erreur lors de la deconnexion" });
  }
});

/**
 * POST /api/auth/refresh
 * Refresh the access token
 */
router.post("/auth/refresh", async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: "Service d'authentification non configure" });
  }

  const { refresh_token } = req.body;

  if (!refresh_token) {
    return res.status(400).json({ error: "Refresh token requis" });
  }

  try {
    const { data, error } = await supabase.auth.refreshSession({
      refresh_token,
    });

    if (error) {
      return res.status(401).json({ error: "Refresh token invalide ou expire" });
    }

    return res.json({
      session: {
        access_token: data.session?.access_token,
        refresh_token: data.session?.refresh_token,
        expires_at: data.session?.expires_at,
      },
    });
  } catch (err) {
    req.log?.error?.({ err }, "Refresh token error");
    return res.status(500).json({ error: "Erreur lors du rafraichissement" });
  }
});

/**
 * GET /api/auth/me
 * Get current user info
 */
router.get("/auth/me", async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: "Service d'authentification non configure" });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentification requise" });
  }

  const token = authHeader.slice(7);

  try {
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      return res.status(401).json({ error: "Token invalide ou expire" });
    }

    return res.json({
      user: {
        id: data.user.id,
        email: data.user.email,
        fullName: data.user.user_metadata?.full_name,
        createdAt: data.user.created_at,
      },
    });
  } catch (err) {
    req.log?.error?.({ err }, "Get user error");
    return res.status(500).json({ error: "Erreur lors de la recuperation du profil" });
  }
});

/**
 * POST /api/auth/change-password
 * Change password for authenticated user
 */
router.post("/auth/change-password", async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: "Service d'authentification non configure" });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentification requise" });
  }

  const token = authHeader.slice(7);
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: "Le mot de passe doit contenir au moins 8 caracteres" });
  }

  try {
    const userClient = createClient(supabaseUrl!, supabaseAnonKey!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { error } = await userClient.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    return res.json({ success: true, message: "Mot de passe mis a jour" });
  } catch (err) {
    req.log?.error?.({ err }, "Change password error");
    return res.status(500).json({ error: "Erreur lors du changement de mot de passe" });
  }
});

export default router;
