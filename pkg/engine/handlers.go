package engine

import (
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"strings"
	"time"

	"excelsior/internal/permissions"
	"excelsior/internal/sessions"
	"excelsior/pkg/config"
	"excelsior/pkg/llm"
	"excelsior/pkg/protocol"
)

func sessionInfo(messages []llm.Message, customTitle string) protocol.SessionInfo {
	added, deleted := diffStats(messages)
	return protocol.SessionInfo{Title: sessions.Title(messages, customTitle), Count: len(messages), Added: added, Deleted: deleted}
}

// diffStats tallies edit-tool line changes across the session.
// ponytail: counts whole oldText/newText blocks, not a real per-line diff
func diffStats(messages []llm.Message) (added, deleted int) {
	for _, m := range messages {
		if m.Role != "assistant" {
			continue
		}
		for _, tc := range m.ToolCalls {
			if tc.Function.Name != "edit" {
				continue
			}
			var a struct {
				OldText string `json:"oldText"`
				NewText string `json:"newText"`
			}
			if json.Unmarshal([]byte(tc.Function.Arguments), &a) != nil {
				continue
			}
			added += countLines(a.NewText)
			deleted += countLines(a.OldText)
		}
	}
	return added, deleted
}

func countLines(s string) int {
	if s == "" {
		return 0
	}
	return strings.Count(s, "\n") + 1
}

// decodePayload unmarshals envelope payload into v, reporting error via sendError on failure.
func (c *Conn) decodePayload(env protocol.Envelope, v any, label string) bool {
	if err := env.Decode(v); err != nil {
		c.sendError(env.ID, fmt.Sprintf("bad %s: %v", label, err))
		return false
	}
	return true
}

// branchOf returns the current git branch of dir, or "" if not a git repo.
// ponytail: one branch per workspace (current HEAD), not the branch at session creation; persist per-session if that matters later.
func branchOf(dir string) string {
	out, err := exec.Command("git", "-C", dir, "rev-parse", "--abbrev-ref", "HEAD").Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

func (c *Conn) handleSessionList(ctx context.Context, env protocol.Envelope) {
	metas, err := (sessions.Service{Store: c.sessionStore()}).List()
	if err != nil {
		c.sendError(env.ID, fmt.Sprintf("list sessions: %v", err))
		return
	}
	branch := branchOf(c.currentWorkspace())
	sessions := make([]protocol.SessionInfo, 0, len(metas))
	for _, meta := range metas {
		sessions = append(sessions, protocol.SessionInfo{
			ID:     meta.ID,
			Title:  meta.Title,
			Count:  meta.MsgCount,
			Branch: branch,
		})
	}
	c.sendEnvelope(protocol.NewEnvelopeWithID(env.ID, protocol.TypeSessionList, protocol.SessionListResp{Sessions: sessions}))
}

func (c *Conn) handleSessionData(ctx context.Context, env protocol.Envelope) {
	var req protocol.SessionDataReq
	if !c.decodePayload(env, &req, "session.data") {
		return
	}
	nonSystem, err := (sessions.Service{Store: c.sessionStore()}).Data(req.ID)
	if err != nil {
		c.sendError(env.ID, fmt.Sprintf("load session: %v", err))
		return
	}
	c.sendEnvelope(protocol.NewEnvelopeWithID(env.ID, protocol.TypeSessionData, protocol.SessionDataResp{ID: req.ID, Messages: nonSystem}))
}

func (c *Conn) handleSessionCreate(ctx context.Context, env protocol.Envelope) {
	var req protocol.SessionCreateReq
	if !c.decodePayload(env, &req, "session.create") {
		return
	}
	id := fmt.Sprintf("%d", time.Now().UnixMilli())
	if err := (sessions.Service{Store: c.sessionStore()}).Create(id, req.Title); err != nil {
		c.sendError(env.ID, fmt.Sprintf("create session: %v", err))
		return
	}
	c.sendEnvelope(protocol.NewEnvelopeWithID(env.ID, protocol.TypeSessionCreate, protocol.SessionCreateResp{ID: id}))
}

func (c *Conn) handleSessionDelete(ctx context.Context, env protocol.Envelope) {
	var req protocol.SessionDeleteReq
	if !c.decodePayload(env, &req, "session.delete") {
		return
	}
	if err := (sessions.Service{Store: c.sessionStore()}).Delete(req.ID); err != nil {
		c.sendError(env.ID, fmt.Sprintf("delete session: %v", err))
		return
	}
	c.sendEnvelope(protocol.NewEnvelopeWithID(env.ID, protocol.TypeSessionDelete, map[string]string{"deleted": req.ID}))
}

func (c *Conn) handleSessionRename(ctx context.Context, env protocol.Envelope) {
	var req protocol.SessionRenameReq
	if !c.decodePayload(env, &req, "session.rename") {
		return
	}
	if err := (sessions.Service{Store: c.sessionStore()}).Rename(req.ID, req.Title); err != nil {
		c.sendError(env.ID, fmt.Sprintf("rename session: %v", err))
		return
	}
	c.sendEnvelope(protocol.NewEnvelopeWithID(env.ID, protocol.TypeSessionRename, protocol.SessionInfo{ID: req.ID, Title: req.Title}))
}

func (c *Conn) handleSessionSubscribe(env protocol.Envelope, subscribe bool) {
	var req protocol.SessionSubscriptionReq
	if !c.decodePayload(env, &req, "session subscription") {
		return
	}
	if subscribe {
		c.subscribe(req.ID)
	} else {
		c.unsubscribe(req.ID)
	}
	c.sendEnvelope(protocol.NewEnvelopeWithID(env.ID, env.Type, map[string]string{"id": req.ID}))
}

func (c *Conn) handleWorkspaceSet(ctx context.Context, env protocol.Envelope) {
	var req protocol.WorkspaceSetReq
	if !c.decodePayload(env, &req, "workspace.set") {
		return
	}
	if target := strings.TrimSpace(req.Workspace); target != "" {
		c.workspace.Set(target)
		c.hub.logger().Info("switched workspace (per-conn)", "workspace", target)
	}
	c.handleSessionList(ctx, env)
}

func (c *Conn) handleSettingsGet(ctx context.Context, env protocol.Envelope) {
	s := config.LoadSettings(c.currentWorkspace())
	perm, allowAll := permissions.Resolve(c.hub.PermissionOverride, s)
	c.sendEnvelope(protocol.NewEnvelopeWithID(env.ID, protocol.TypeSettingsGet, protocol.SettingsGetResp{Permission: string(perm), AllowAll: allowAll}))
}

func (c *Conn) handleSettingsSet(ctx context.Context, env protocol.Envelope) {
	var req protocol.SettingsSetReq
	if !c.decodePayload(env, &req, "settings.set") {
		return
	}
	s := config.LoadSettings(c.currentWorkspace())
	updated := false
	if req.Permission != nil {
		pm, err := config.ParsePermissionMode(*req.Permission)
		if err != nil {
			c.sendError(env.ID, err.Error())
			return
		}
		s.Permission = pm
		updated = true
	}
	if req.AllowAll != nil {
		s.AllowAll = req.AllowAll
		if *req.AllowAll {
			s.Permission = config.PermissionAllow
		} else if s.Permission == config.PermissionAllow {
			s.Permission = config.PermissionAsk
		}
		updated = true
	}
	if updated {
		if err := config.SaveSettings(c.currentWorkspace(), s); err != nil {
			c.sendError(env.ID, fmt.Sprintf("save settings: %v", err))
			return
		}

		c.hub.logger().Info("settings updated", "permission", s.Permission, "allowAll", s.AllowAll)
	}
	perm, allowAll := permissions.Resolve(c.hub.PermissionOverride, s)
	c.sendEnvelope(protocol.NewEnvelopeWithID(env.ID, protocol.TypeSettingsSet, protocol.SettingsSetResp{Permission: string(perm), AllowAll: allowAll}))
}
