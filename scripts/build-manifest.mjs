#!/usr/bin/env node
/**
 * Build public/index.json — the machine-readable skills manifest.
 *
 * Agents that curl-installed a skill need a way to (a) detect updates and
 * (b) discover the files a single-URL install misses (scripts/, references/,
 * plugin/). The manifest lists every skill with its version (from SKILL.md
 * frontmatter) and every distributable file with a sha256, so installers can
 * fetch the complete set and verify integrity.
 *
 * Run: node scripts/build-manifest.mjs   (also wired as `npm run manifest`)
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const PUBLIC_DIR = join(ROOT, "public");
const OUT_FILE = join(PUBLIC_DIR, "index.json");

// Static site assets that are not skill content.
const EXCLUDED_FILES = new Set([
  "index.json", "robots.txt", "llms.txt", "AGENTS.md", "CLAUDE.md",
]);
const EXCLUDED_EXTENSIONS = new Set([
  ".png", ".ico", ".svg",
]);

/** Minimal frontmatter scanner: returns {version, name, description}. */
function parseFrontmatter(markdown) {
  const out = {};
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return out;
  const body = match[1];
  // top-level `version:` or nested `metadata:\n  ...\n  version:`
  const version = body.match(/^version:\s*["']?([\w.\-]+)["']?\s*$/m)
    ?? body.match(/^\s+version:\s*["']?([\w.\-]+)["']?\s*$/m);
  if (version) out.version = version[1];
  const name = body.match(/^name:\s*(.+)$/m);
  if (name) out.name = name[1].trim();
  return out;
}

const EXCLUDED_DIRS = new Set(["__pycache__", ".git", "node_modules"]);

function walkFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUDED_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(full));
    } else if (!entry.name.endsWith(".pyc")) {
      files.push(full);
    }
  }
  return files;
}

function fileRecord(absPath) {
  const data = readFileSync(absPath);
  return {
    path: "/" + relative(PUBLIC_DIR, absPath).split(sep).join("/"),
    sha256: createHash("sha256").update(data).digest("hex"),
    bytes: data.length,
  };
}

function isSkillDir(absPath) {
  try {
    return statSync(join(absPath, "SKILL.md")).isFile();
  } catch {
    return false;
  }
}

const skills = [];

for (const entry of readdirSync(PUBLIC_DIR, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
  if (!entry.isDirectory()) continue;
  const dir = join(PUBLIC_DIR, entry.name);
  if (!isSkillDir(dir)) continue;

  const skillMd = readFileSync(join(dir, "SKILL.md"), "utf8");
  const fm = parseFrontmatter(skillMd);
  const files = walkFiles(dir)
    .filter((f) => !EXCLUDED_EXTENSIONS.has(f.slice(f.lastIndexOf("."))))
    .sort()
    .map(fileRecord);

  // Nested sub-skills (builder/skill, builder/app) get their own entries too,
  // but their files stay listed under the parent for complete installs.
  const subSkills = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && isSkillDir(join(dir, d.name)))
    .map((d) => {
      const subMd = readFileSync(join(dir, d.name, "SKILL.md"), "utf8");
      const subFm = parseFrontmatter(subMd);
      return {
        slug: `${entry.name}/${d.name}`,
        version: subFm.version ?? null,
        entry: `/${entry.name}/${d.name}/SKILL.md`,
      };
    });

  skills.push({
    slug: entry.name,
    version: fm.version ?? null,
    entry: `/${entry.name}/SKILL.md`,
    files,
    ...(subSkills.length ? { sub_skills: subSkills } : {}),
  });
}

// The root skill (public/SKILL.md)
const rootMd = readFileSync(join(PUBLIC_DIR, "SKILL.md"), "utf8");
const rootFm = parseFrontmatter(rootMd);
const manifest = {
  $schema: "https://cortexskills.org/index.json",
  manifest_version: 1,
  root: {
    version: rootFm.version ?? null,
    entry: "/SKILL.md",
    ...fileRecord(join(PUBLIC_DIR, "SKILL.md")),
  },
  skills,
};

const missing = skills.filter((s) => !s.version).map((s) => s.slug);
if (missing.length) {
  console.warn(`WARNING: skills without a frontmatter version: ${missing.join(", ")}`);
}

writeFileSync(OUT_FILE, JSON.stringify(manifest, null, 2) + "\n");
console.log(`Wrote ${relative(ROOT, OUT_FILE)} — ${skills.length} skills, ` +
  `${skills.reduce((n, s) => n + s.files.length, 0)} files hashed.`);
