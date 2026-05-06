import { Octokit } from "@octokit/rest";
import { getSetting } from "../db/index.js";
import { execPromise } from "./execPromise.js";

let _octokit: Octokit | null = null;
let _owner: string | null = null;
let _repo: string | null = null;

function getToken(): string {
  const fromDb = getSetting("GITHUB_TOKEN");
  if (fromDb) return fromDb;
  const fromEnv = process.env.GITHUB_TOKEN;
  if (fromEnv) return fromEnv;
  throw new Error(
    "GITHUB_TOKEN is not set. Configure it in Settings (Ctrl+S) or set the GITHUB_TOKEN environment variable.",
  );
}

async function parseRepoFromRemote(): Promise<{ owner: string; repo: string }> {
  const { stdout } = await execPromise("git remote get-url origin");
  const url = stdout.trim();
  const match = url.match(/github\.com[/:](.+?)\/(.+?)(?:\.git)?$/);
  if (!match) {
    throw new Error(`Could not parse owner/repo from git remote: ${url}`);
  }
  return { owner: match[1], repo: match[2] };
}

export async function getOctokit(): Promise<Octokit> {
  if (!_octokit) {
    _octokit = new Octokit({ auth: getToken() });
  }
  return _octokit;
}

export async function getRepoInfo(): Promise<{ owner: string; repo: string }> {
  if (!_owner || !_repo) {
    const info = await parseRepoFromRemote();
    _owner = info.owner;
    _repo = info.repo;
  }
  return { owner: _owner!, repo: _repo! };
}
