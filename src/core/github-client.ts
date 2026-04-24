export interface PullRequest {
  id: number;
  number: number;
  title: string;
  user: {
    login: string;
  };
  created_at: string;
}

export async function fetchPRs(owner: string, repo: string): Promise<PullRequest[]> {
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls?state=open`;
  
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Excelsior-Agent'
    }
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.statusText}`);
  }

  return await response.json() as PullRequest[];
}
