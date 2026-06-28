/**
 * Seed des playlists légales pour un utilisateur existant ou un compte démo.
 *
 * Usage :
 *   npm run seed:playlists
 *   npm run seed:playlists -- --email=user@example.com
 *   npm run seed:playlists -- --sync   # attend la fin des scans (test)
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const DEMO_EMAIL = "demo@streamtv.local";
const DEMO_PASSWORD = "demo123456";
const DEMO_NAME = "Démo StreamTV";

function loadEnvFile() {
  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  let email: string | undefined;
  let sync = false;
  for (const arg of args) {
    if (arg === "--sync") sync = true;
    else if (arg.startsWith("--email=")) email = arg.slice("--email=".length);
    else if (arg === "--help" || arg === "-h") {
      console.log(`
StreamTV — seed playlists légales

  npm run seed:playlists
  npm run seed:playlists -- --email=user@example.com
  npm run seed:playlists -- --sync

Crée le compte démo (${DEMO_EMAIL}) si aucun email fourni et que le compte n'existe pas.
`);
      process.exit(0);
    }
  }
  return { email, sync };
}

async function main() {
  loadEnvFile();

  const { email: emailArg, sync } = parseArgs();
  const prisma = new PrismaClient();

  try {
    let user = emailArg
      ? await prisma.user.findUnique({ where: { email: emailArg } })
      : await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });

    if (!user) {
      const email = emailArg ?? DEMO_EMAIL;
      console.log(`Création du compte : ${email}`);
      user = await prisma.user.create({
        data: {
          email,
          name: emailArg ? null : DEMO_NAME,
          passwordHash: await bcrypt.hash(DEMO_PASSWORD, 12),
        },
      });
      if (!emailArg) {
        console.log(`Mot de passe démo : ${DEMO_PASSWORD}`);
      }
    } else {
      console.log(`Utilisateur : ${user.email} (${user.id})`);
    }

    // Import via chemin relatif (script CLI, hors Next.js)
    const { playlistService } = await import("../src/lib/services/playlist.service");

    console.log(`Import des playlists légales (sync=${sync})…`);
    const result = await playlistService.importDemoPlaylists(user.id, { awaitScan: sync });

    console.log(`Importé : ${result.imported.length} playlist(s)`);
    for (const pl of result.imported) {
      console.log(`  • ${pl.name} — ${pl.url}`);
    }
    if (result.skipped > 0) {
      console.log(`Ignoré (déjà présent) : ${result.skipped}`);
    }

    if (sync && result.imported.length > 0) {
      const counts = await prisma.channel.groupBy({
        by: ["playlistId"],
        where: { playlistId: { in: result.imported.map((p) => p.id) } },
        _count: { _all: true },
      });
      for (const row of counts) {
        const pl = result.imported.find((p) => p.id === row.playlistId);
        console.log(`  Chaînes en BDD : ${pl?.name ?? row.playlistId} → ${row._count._all}`);
      }
    } else if (result.imported.length > 0) {
      console.log("Scans en arrière-plan — ouvrez l'app ou relancez avec --sync pour attendre.");
    }

    console.log("Terminé.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
