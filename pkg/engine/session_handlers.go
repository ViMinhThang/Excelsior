package engine

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"excelsior/pkg/llm"
	"excelsior/pkg/protocol"
)

func sessionInfo(msgs []llm.Message, customTitle string) protocol.SessionInfo {
	title := strings.TrimSpace(customTitle)
	count := len(msgs)

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
	if len(title) > 40 {
		title = title[:40] + "…"
	}
	return protocol.SessionInfo{Title: title, Count: count}
}

func (c *Conn) handleSessionList(env protocol.Envelope) {
	ids, err := c.sessionStore().ListSimple()
	if err != nil {
		c.sendError(env.ID, fmt.Sprintf("list sessions: %v", err))
		return
	}
	var sessions []protocol.SessionInfo
	for _, id := range ids {
		rec, err := c.sessionStore().LoadRecordSimple(id)
		if err != nil {
			continue
		}
		info := sessionInfo(rec.Messages, rec.Title)
		info.ID = id
		sessions = append(sessions, info)
	}
	c.sendEnvelope(protocol.Envelope{
		Ver:     protocol.Ver,
		ID:      env.ID,
		Type:    protocol.TypeSessionList,
		Payload: protocol.SessionListResp{Sessions: sessions},
	})
}

func (c *Conn) handleSessionData(env protocol.Envelope) {
	raw, _ := json.Marshal(env.Payload)
	var req protocol.SessionDataReq
	if err := json.Unmarshal(raw, &req); err != nil {
		c.sendError(env.ID, fmt.Sprintf("bad session.data: %v", err))
		return
	}
	msgs, err := c.sessionStore().LoadSimple(req.ID)
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
	c.sendEnvelope(protocol.Envelope{
		Ver:     protocol.Ver,
		ID:      env.ID,
		Type:    protocol.TypeSessionData,
		Payload: protocol.SessionDataResp{ID: req.ID, Messages: nonSystem},
	})
}

func (c *Conn) handleSessionCreate(env protocol.Envelope) {
	raw, _ := json.Marshal(env.Payload)
	var req protocol.SessionCreateReq
	if err := json.Unmarshal(raw, &req); err != nil {
		c.sendError(env.ID, fmt.Sprintf("bad session.create: %v", err))
		return
	}
	id := fmt.Sprintf("%d", time.Now().UnixMilli())
	if req.Title != "" {
		_ = c.sessionStore().SaveWithTitleSimple(id, req.Title, []llm.Message{})
	} else {
		_ = c.sessionStore().SaveSimple(id, []llm.Message{})
	}
	c.sendEnvelope(protocol.Envelope{
		Ver:     protocol.Ver,
		ID:      env.ID,
		Type:    protocol.TypeSessionCreate,
		Payload: protocol.SessionCreateResp{ID: id},
	})
}

func (c *Conn) handleSessionDelete(env protocol.Envelope) {
	raw, _ := json.Marshal(env.Payload)
	var req protocol.SessionDeleteReq
	if err := json.Unmarshal(raw, &req); err != nil {
		c.sendError(env.ID, fmt.Sprintf("bad session.delete: %v", err))
		return
	}
	if err := c.sessionStore().DeleteSimple(req.ID); err != nil {
		c.sendError(env.ID, fmt.Sprintf("delete session: %v", err))
		return
	}
	c.sendEnvelope(protocol.Envelope{
		Ver:     protocol.Ver,
		ID:      env.ID,
		Type:    protocol.TypeSessionDelete,
		Payload: map[string]string{"deleted": req.ID},
	})
}

func (c *Conn) handleSessionRename(env protocol.Envelope) {
	raw, _ := json.Marshal(env.Payload)
	var req protocol.SessionRenameReq
	if err := json.Unmarshal(raw, &req); err != nil {
		c.sendError(env.ID, fmt.Sprintf("bad session.rename: %v", err))
		return
	}
	if err := c.sessionStore().RenameSimple(req.ID, req.Title); err != nil {
		c.sendError(env.ID, fmt.Sprintf("rename session: %v", err))
		return
	}
	c.sendEnvelope(protocol.Envelope{
		Ver:     protocol.Ver,
		ID:      env.ID,
		Type:    protocol.TypeSessionRename,
		Payload: protocol.SessionInfo{ID: req.ID, Title: req.Title},
	})
}
