#!/usr/bin/env node
/**
 * Génère un hash scrypt pour TAMS_ADMIN_PASSWORD_HASH (Personal Admin Access Gate).
 *
 * Usage :
 *   node scripts/hash-admin-password.mjs 'mon-mot-de-passe-fort'
 *   PW='mon-mot-de-passe-fort' node scripts/hash-admin-password.mjs
 *
 * Sortie : une ligne "scrypt$<saltHex>$<keyHex>" à coller dans Railway
 * (variable TAMS_ADMIN_PASSWORD_HASH). Le mot de passe en clair n'est jamais
 * stocké ni loggé ailleurs que dans ton terminal.
 */
import { randomBytes, scryptSync } from "node:crypto";

const pw = process.argv[2] ?? process.env.PW;
if (!pw) {
  console.error("Usage: node scripts/hash-admin-password.mjs '<mot-de-passe>'");
  process.exit(1);
}

const salt = randomBytes(16);
const key = scryptSync(pw, salt, 64);
process.stdout.write(`scrypt$${salt.toString("hex")}$${key.toString("hex")}\n`);
