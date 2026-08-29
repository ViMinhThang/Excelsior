package engine

import (
	"context"
	"fmt"
	"strings"
	"time"

	"excelsior/pkg/llm"
	"excelsior/pkg/protocol"
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
	ids, err := c.sessionStore().List(ctx)
	if err != nil {
		c.sendError(env.ID, fmt.Sprintf("list sessions: %v", err))
		return
	}
	var sessions []protocol.SessionInfo
	for _, id := range ids {
		rec, err := c.sessionStore().LoadRecord(ctx, id)
		if err != nil {
			continue
		}
		info := sessionInfo(rec.Messages, rec.Title)
		info.ID = id
		sessions = append(sessions, info)
	}
	c.sendEnvelope(protocol.NewEnvelopeWithID(env.ID, protocol.TypeSessionList, protocol.SessionListResp{Sessions: sessions}))
}

func (c *Conn) handleSessionData(ctx context.Context, env protocol.Envelope) {
	var req protocol.SessionDataReq
	if !c.decodePayload(env, &req, "session.data") {
		return
	}
	msgs, err := c.sessionStore().Load(ctx, req.ID)
	if err != nil {
		c.sendError(env.ID, fmt.Sprintf("load session: %v", err))
		return
	}
	var nonSystem []llm.Message
	for _, m := range msgs {
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
	if req.Title != "" {
		_ = c.sessionStore().SaveWithTitle(ctx, id, req.Title, nil)
	} else {
		_ = c.sessionStore().Save(ctx, id, nil)
	}
	c.sendEnvelope(protocol.NewEnvelopeWithID(env.ID, protocol.TypeSessionCreate, protocol.SessionCreateResp{ID: id}))
}

func (c *Conn) handleSessionDelete(ctx context.Context, env protocol.Envelope) {
	var req protocol.SessionDeleteReq
	if !c.decodePayload(env, &req, "session.delete") {
		return
	}
	if err := c.sessionStore().Delete(ctx, req.ID); err != nil {
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
	if err := c.sessionStore().Rename(ctx, req.ID, req.Title); err != nil {
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
