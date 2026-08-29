package engine

import (
	"context"
	"fmt"
	"strings"
	"time"

	"excelsior/pkg/llm"
	"excelsior/pkg/protocol"
	"excelsior/pkg/session"
	"excelsior/pkg/util"
)

func sessionInfo(msgs []llm.Message, customTitle string) protocol.SessionInfo {
	title := strings.TrimSpace(customTitle)
	if title == "" || title == "(empty)" {
		for _, m := range msgs {
			if m.Role == "user" && strings.TrimSpace(m.Content) != "" {
				title = strings.TrimSpace(m.Content)
				break
			}
		}
	}
	if title == "" || title == "(empty)" {
		title = "New Chat"
	}
	title = util.Truncate(title, 40)
	return protocol.SessionInfo{Title: title, Count: len(msgs)}
}

// decodePayload unmarshals envelope payload into v, reporting error via sendError on failure.
func (c *Conn) decodePayload(env protocol.Envelope, v any, label string) bool {
	if err := env.Decode(v); err != nil {
		c.sendError(env.ID, fmt.Sprintf("bad %s: %v", label, err))
		return false
	}
	return true
}

func (c *Conn) handleSessionList(ctx context.Context, env protocol.Envelope) {
	metas, err := c.sessionStore().List()
	if err != nil {
		c.sendError(env.ID, fmt.Sprintf("list sessions: %v", err))
		return
	}
	var sessions []protocol.SessionInfo
	for _, meta := range metas {
		title := strings.TrimSpace(meta.Title)
		if title == "" || title == "(empty)" {
			if rec, err := c.sessionStore().Load(meta.ID); err == nil {
				info := sessionInfo(rec.Messages, rec.Title)
				title = info.Title
			} else {
				title = "New Chat"
			}
		}
		title = util.Truncate(title, 40)
		sessions = append(sessions, protocol.SessionInfo{
			ID:    meta.ID,
			Title: title,
			Count: meta.MsgCount,
		})
	}
	c.sendEnvelope(protocol.NewEnvelopeWithID(env.ID, protocol.TypeSessionList, protocol.SessionListResp{Sessions: sessions}))
}

func (c *Conn) handleSessionData(ctx context.Context, env protocol.Envelope) {
	var req protocol.SessionDataReq
	if !c.decodePayload(env, &req, "session.data") {
		return
	}
	rec, err := c.sessionStore().Load(req.ID)
	if err != nil {
		c.sendError(env.ID, fmt.Sprintf("load session: %v", err))
		return
	}
	var nonSystem []llm.Message
	for _, m := range rec.Messages {
		if m.Role != "system" {
			nonSystem = append(nonSystem, m)
		}
	}
	c.sendEnvelope(protocol.NewEnvelopeWithID(env.ID, protocol.TypeSessionData, protocol.SessionDataResp{ID: req.ID, Messages: nonSystem}))
}

func (c *Conn) handleSessionCreate(ctx context.Context, env protocol.Envelope) {
	var req protocol.SessionCreateReq
	if !c.decodePayload(env, &req, "session.create") {
		return
	}
	id := fmt.Sprintf("%d", time.Now().UnixMilli())
	rec := session.Record{
		ID:        id,
		Title:     req.Title,
		CreatedAt: time.Now().UTC(),
		Messages:  []llm.Message{},
	}
	if err := c.sessionStore().Save(rec); err != nil {
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
	if err := c.sessionStore().Delete(req.ID); err != nil {
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
	rec, err := c.sessionStore().Load(req.ID)
	if err != nil {
		c.sendError(env.ID, fmt.Sprintf("rename session: %v", err))
		return
	}
	rec.Title = req.Title
	if err := c.sessionStore().Save(rec); err != nil {
		c.sendError(env.ID, fmt.Sprintf("rename session: %v", err))
		return
	}
	c.sendEnvelope(protocol.NewEnvelopeWithID(env.ID, protocol.TypeSessionRename, protocol.SessionInfo{ID: req.ID, Title: req.Title}))
}

func (c *Conn) handleWorkspaceSet(ctx context.Context, env protocol.Envelope) {
	var req protocol.WorkspaceSetReq
	if !c.decodePayload(env, &req, "workspace.set") {
		return
	}
	if target := strings.TrimSpace(req.Workspace); target != "" {
		c.mu.Lock()
		c.workspace = target
		c.mu.Unlock()
		c.hub.logger().Info("switched workspace (per-conn)", "workspace", target)
	}
	c.handleSessionList(ctx, env)
}
