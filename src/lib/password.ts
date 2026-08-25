/**
 * Password hashing with Node's built-in scrypt — no native dependency, and
 * memory-hard, which bcrypt at default cost is not.
 *
 * Stored format:  scrypt$N$r$p$<saltHex>$<hashHex>
 *
 * When the project is pointed at Supabase Auth instead (see README), this
 * module is unused: Supabase owns the credential and `users.password_hash`
 * stays null.
 */
import "server-only";
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(_scrypt) as (
  password: string | Buffer, salt: string | Buffer, keylen: number, options: object,
) => Promise<Buffer>;

const N = 16384, r = 8, p = 1, KEYLEN = 32;

export async function hashPassword(plain: string): Promise<string> {
  if (plain.length < 8) throw new Error("Password must be at least 8 characters.");
  const salt = randomBytes(16);
  const key = await scrypt(plain.normalize("NFKC"), salt, KEYLEN, { N, r, p, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${r}$${p}$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(plain: string, stored: string | null): Promise<boolean> {
  // Always do the work, even when the account has no hash, so that a missing
  // user and a wrong password take indistinguishable time.
  const fallback = `scrypt$${N}$${r}$${p}$${"0".repeat(32)}$${"0".repeat(64)}`;
  const parts = (stored ?? fallback).split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, n, rr, pp, saltHex, hashHex] = parts;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scrypt(plain.normalize("NFKC"), salt, expected.length, {
    N: Number(n), r: Number(rr), p: Number(pp), maxmem: 64 * 1024 * 1024,
  });
  const match = actual.length === expected.length && timingSafeEqual(actual, expected);
  return stored ? match : false;
}
