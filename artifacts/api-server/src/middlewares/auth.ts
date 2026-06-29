import type { Request, Response, NextFunction } from "express";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("[auth] Supabase env vars not configured - auth middleware will reject all requests");
}

const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export interface AuthUser {
  id: string;
  email?: string;
  role?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Auth middleware - validates Supabase JWT token
 * Attaches user info to req.user if authenticated
 * Returns 401 if no/invalid token
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentification requise" });
    return;
  }

  const token = authHeader.slice(7);

  if (!supabase) {
    res.status(500).json({ error: "Service d'authentification non configure" });
    return;
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      res.status(401).json({ error: "Token invalide ou expire" });
      return;
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.user_metadata?.role,
    };

    next();
  } catch (err) {
    req.log?.error?.({ err }, "Auth middleware error");
    res.status(401).json({ error: "Echec de l'authentification" });
  }
}

/**
 * Optional auth - attaches user if token present, but doesn't require it
 */
export async function optionalAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    next();
    return;
  }

  const token = authHeader.slice(7);

  if (!supabase) {
    next();
    return;
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (!error && user) {
      req.user = {
        id: user.id,
        email: user.email,
        role: user.user_metadata?.role,
      };
    }
  } catch {
    // Silent fail for optional auth
  }

  next();
}

/**
 * Admin guard - requires authenticated user with admin role
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: "Authentification requise" });
    return;
  }

  if (req.user.role !== "admin") {
    res.status(403).json({ error: "Acces refuse - droits administrateur requis" });
    return;
  }

  next();
}

/**
 * Self-or-admin guard - user can access their own data or admin can access any
 */
export function requireSelfOrAdmin(userIdParam = "userId") {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Authentification requise" });
      return;
    }

    const targetUserId = req.params[userIdParam] || req.body[userIdParam];

    if (req.user.role === "admin" || req.user.id === targetUserId) {
      next();
      return;
    }

    res.status(403).json({ error: "Acces refuse - vous ne pouvez acceder qu'a vos propres donnees" });
  };
}

export default { requireAuth, optionalAuth, requireAdmin, requireSelfOrAdmin };
