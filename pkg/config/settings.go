package config

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// Settings persists user preferences like permission mode.
// Stored at <workspace>/.excelsior/settings.json and fallback to user config dir.
type Settings struct {
	Permission PermissionMode `json:"permission,omitempty"` // ask|allow|deny
	// AllowAll is a convenience alias: when true, Permission is treated as allow.
	// Kept for explicit UI toggle "Allow all commands without asking".
	AllowAll *bool `json:"allowAll,omitempty"`
}

// SettingsPath returns the primary path for workspace settings.
func SettingsPath(workspace string) string {
	if workspace != "" {
		return filepath.Join(workspace, ".excelsior", "settings.json")
	}
	// fallback to cwd
	return filepath.Join(".excelsior", "settings.json")
}

// UserSettingsPath returns the global user config path.
func UserSettingsPath() string {
	if dir, err := os.UserConfigDir(); err == nil && dir != "" {
		return filepath.Join(dir, "excelsior", "settings.json")
	}
	if home, err := os.UserHomeDir(); err == nil && home != "" {
		return filepath.Join(home, ".excelsior", "settings.json")
	}
	return ""
}

// LoadSettings reads settings from workspace path and user global path, merged
// with workspace taking precedence. Missing file returns empty settings.
func LoadSettings(workspace string) Settings {
	var merged Settings
	// user global first
	if p := UserSettingsPath(); p != "" {
		if s, err := loadSettingsFile(p); err == nil {
			merged = s
		}
	}
	// workspace overrides
	if p := SettingsPath(workspace); p != "" {
		if s, err := loadSettingsFile(p); err == nil {
			if s.Permission != "" {
				merged.Permission = s.Permission
			}
			if s.AllowAll != nil {
				merged.AllowAll = s.AllowAll
			}
		}
	}
	return merged
}

func loadSettingsFile(path string) (Settings, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return Settings{}, err
	}
	var s Settings
	if err := json.Unmarshal(b, &s); err != nil {
		return Settings{}, err
	}
	// normalize permission
	if s.Permission != "" {
		if pm, err := ParsePermissionMode(string(s.Permission)); err == nil {
			s.Permission = pm
		} else {
			s.Permission = ""
		}
	}
	return s, nil
}

// SaveSettings persists to workspace settings path atomically.
// If workspace is empty, falls back to user global path.
func SaveSettings(workspace string, s Settings) error {
	path := SettingsPath(workspace)
	if workspace == "" {
		if p := UserSettingsPath(); p != "" {
			path = p
		}
	}
	// normalize
	if s.AllowAll != nil {
		if *s.AllowAll {
			s.Permission = PermissionAllow
		} else if s.Permission == PermissionAllow {
			// keep as is, but allowAll false doesn't force ask if explicit permission was allow
		}
	}
	b, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	// use 0600
	return writeAtomic(path, b, 0o600)
}

func writeAtomic(path string, data []byte, perm os.FileMode) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dir, ".tmp-*")
	if err != nil {
		return err
	}
	name := tmp.Name()
	success := false
	defer func() {
		tmp.Close()
		if !success {
			_ = os.Remove(name)
		}
	}()
	if _, err := tmp.Write(data); err != nil {
		return err
	}
	if err := tmp.Sync(); err != nil {
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Chmod(name, perm); err != nil {
		return err
	}
	if err := os.Rename(name, path); err != nil {
		return err
	}
	success = true
	if d, err := os.Open(dir); err == nil {
		_ = d.Sync()
		_ = d.Close()
	}
	return nil
}

// EffectivePermission resolves final PermissionMode from settings and explicit allowAll.
func (s Settings) EffectivePermission(fallback PermissionMode) PermissionMode {
	if s.AllowAll != nil {
		if *s.AllowAll {
			return PermissionAllow
		}
		// allowAll=false does not override explicit permission=allow; fall through to s.Permission
	}
	if s.Permission != "" {
		return s.Permission
	}
	return fallback
}
