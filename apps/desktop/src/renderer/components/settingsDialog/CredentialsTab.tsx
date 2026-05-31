type CredentialsTabProps = {
  apiKeyInput: string;
  githubTokenInput: string;
  onApiKeyChange: (value: string) => void;
  onGithubTokenChange: (value: string) => void;
};

export function CredentialsTab({
  apiKeyInput,
  githubTokenInput,
  onApiKeyChange,
  onGithubTokenChange,
}: CredentialsTabProps) {
  return (
    <div className="settings-form">
      <label className="settings-field">
        <span className="settings-label">DeepSeek API Key</span>
        <input
          type="password"
          value={apiKeyInput}
          onChange={(event) => onApiKeyChange(event.target.value)}
          placeholder="sk-..."
          className="settings-control transition-snappy-colors"
        />
      </label>

      <label className="settings-field">
        <span className="settings-label">GitHub Token</span>
        <input
          type="password"
          value={githubTokenInput}
          onChange={(event) => onGithubTokenChange(event.target.value)}
          placeholder="ghp_..."
          className="settings-control transition-snappy-colors"
        />
      </label>
    </div>
  );
}
