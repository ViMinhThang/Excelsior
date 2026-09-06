package permissions

import "excelsior/pkg/config"

// Resolve applies workspace settings and explicit runtime overrides.
// Allow and deny runtime modes are authoritative; ask leaves workspace settings active.
func Resolve(override config.PermissionMode, settings config.Settings) (config.PermissionMode, bool) {
	mode := settings.EffectivePermission(config.PermissionAsk)
	if override == config.PermissionAllow || override == config.PermissionDeny {
		mode = override
	}
	if mode == "" {
		mode = config.PermissionAsk
	}
	allowAll := mode == config.PermissionAllow
	if settings.AllowAll != nil {
		allowAll = *settings.AllowAll
	}
	return mode, allowAll
}
