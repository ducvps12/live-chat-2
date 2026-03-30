#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";

const storePath = path.join(os.homedir(), ".claude", "project-workspace.json");

function ensureStore() {
  const dir = path.dirname(storePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(storePath)) {
    fs.writeFileSync(storePath, JSON.stringify({ projects: {} }, null, 2));
  }
}

function loadStore() {
  ensureStore();
  try {
    return JSON.parse(fs.readFileSync(storePath, "utf8"));
  } catch {
    return { projects: {} };
  }
}

function saveStore(store) {
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
}

function usage() {
  console.log(`\nClaude Workspace Manager\n\nUsage:\n  npm run workspace:add -- <name> [project_path]\n  npm run workspace:list\n  npm run workspace:open -- <name>\n  npm run workspace:remove -- <name>\n\nExamples:\n  npm run workspace:add -- crm C:/Users/Admin/Desktop/crm\n  npm run workspace:add -- livechat\n  npm run workspace:list\n  npm run workspace:open -- livechat\n  npm run workspace:remove -- crm\n`);
}

const [command, ...rest] = process.argv.slice(2);

if (!command) {
  usage();
  process.exit(1);
}

const store = loadStore();
store.projects ||= {};

if (command === "add") {
  const [name, projectPathArg] = rest;
  if (!name) {
    console.error("Missing project name.");
    usage();
    process.exit(1);
  }

  const projectPath = path.resolve(projectPathArg || process.cwd());
  if (!fs.existsSync(projectPath)) {
    console.error(`Path does not exist: ${projectPath}`);
    process.exit(1);
  }

  store.projects[name] = { path: projectPath, updatedAt: new Date().toISOString() };
  saveStore(store);
  console.log(`Added '${name}' -> ${projectPath}`);
  process.exit(0);
}

if (command === "list") {
  const entries = Object.entries(store.projects);
  if (entries.length === 0) {
    console.log("No projects yet. Add one with: npm run workspace:add -- <name> [project_path]");
    process.exit(0);
  }

  console.log("Registered projects:\n");
  for (const [name, meta] of entries.sort(([a], [b]) => a.localeCompare(b))) {
    const exists = fs.existsSync(meta.path) ? "ok" : "missing";
    console.log(`- ${name} (${exists})`);
    console.log(`  ${meta.path}`);
  }
  process.exit(0);
}

if (command === "open") {
  const [name] = rest;
  if (!name) {
    console.error("Missing project name.");
    usage();
    process.exit(1);
  }

  const project = store.projects[name];
  if (!project) {
    console.error(`Unknown project '${name}'. Run workspace:list first.`);
    process.exit(1);
  }

  if (!fs.existsSync(project.path)) {
    console.error(`Path no longer exists: ${project.path}`);
    process.exit(1);
  }

  console.log(`Opening Claude in: ${project.path}`);
  const child = spawn("claude", { cwd: project.path, stdio: "inherit", shell: true });
  child.on("exit", (code) => process.exit(code ?? 0));
  process.exitCode = 0;
}

if (command === "remove") {
  const [name] = rest;
  if (!name) {
    console.error("Missing project name.");
    usage();
    process.exit(1);
  }

  if (!store.projects[name]) {
    console.error(`Project '${name}' not found.`);
    process.exit(1);
  }

  delete store.projects[name];
  saveStore(store);
  console.log(`Removed '${name}'.`);
  process.exit(0);
}

console.error(`Unknown command: ${command}`);
usage();
process.exit(1);
