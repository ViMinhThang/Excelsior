package engine

import (
	"encoding/json"
	"fmt"
	"strings"

	"excelsior/pkg/protocol"
)

func (c *Conn) handleWorkspaceSet(env protocol.Envelope) {
	raw, _ := json.Marshal(env.Payload)
	var req protocol.WorkspaceSetReq
	if err := json.Unmarshal(raw, &req); err != nil {
		c.sendError(env.ID, fmt.Sprintf("bad workspace.set: %v", err))
		return
	}
	target := strings.TrimSpace(req.Workspace)
	if target != "" {
		c.mu.Lock()
		c.workspace = target
		c.mu.Unlock()

		c.hub.SetWorkspace(target)
		c.hub.logger().Info("switched workspace", "workspace", target)
	}
	c.handleSessionList(env)
}
