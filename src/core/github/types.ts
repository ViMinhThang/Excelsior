export interface PullRequestData {
  owner: string;
  repo: string;
  pull_number: number;
  title: string;
  body: string;
  diff: string;
}

export interface PullRequest {
  number: number;
  title: string;
  author: string;
  status: string;
}

export interface RepoInfo {
  owner: string;
  repo: string;
}
