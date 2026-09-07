package engine

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"excelsior/pkg/protocol"
	"excelsior/pkg/util"
	"github.com/gorilla/websocket"
)

func newID() string { b := make([]byte, 16); _, _ = rand.Read(b); return hex.EncodeToString(b) }

// OwnerToken loads or creates this computer's owner token. Rotation takes effect on restart.
func OwnerToken(rotate bool) (string, error) {
	path := os.Getenv("EXCELSIOR_TOKEN_FILE")
	if path == "" {
		dir, err := os.UserConfigDir()
		if err != nil {
			return "", err
		}
		path = filepath.Join(dir, "excelsior", "owner-token")
	}
	if !rotate {
		b, err := os.ReadFile(path)
		if err == nil {
			token := strings.TrimSpace(string(b))
			decoded, err := hex.DecodeString(token)
			if err != nil || len(decoded) != 32 {
				return "", fmt.Errorf("invalid owner token file: %s", path)
			}
			return token, nil
		}
		if !errors.Is(err, os.ErrNotExist) {
			return "", err
		}
	}
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return "", err
	}
	if err := protectTokenDir(dir); err != nil {
		return "", err
	}
	token := newID() + newID()
	if rotate {
		return token, util.WriteAtomic(path, []byte(token+"\n"), 0600)
	}
	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if errors.Is(err, os.ErrExist) {
		return OwnerToken(false)
	}
	if err != nil {
		return "", err
	}
	_, err = f.WriteString(token + "\n")
	closeErr := f.Close()
	if err != nil {
		return "", err
	}
	return token, closeErr
}

func (h *Hub) checkOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	} // Native clients still authenticate.
	for _, allowed := range h.AllowedOrigins {
		if origin == allowed {
			return true
		}
	}
	return false
}

func (h *Hub) authenticate(ws *websocket.Conn) bool {
	ws.SetReadLimit(4096)
	_ = ws.SetReadDeadline(time.Now().Add(5 * time.Second))
	var env protocol.Envelope
	var payload struct {
		Token string `json:"token"`
	}
	if ws.ReadJSON(&env) != nil || env.Type != protocol.TypeAuth || env.Ver != protocol.Ver || env.Decode(&payload) != nil || h.Token == "" || subtle.ConstantTimeCompare([]byte(payload.Token), []byte(h.Token)) != 1 {
		_ = ws.WriteControl(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.ClosePolicyViolation, "authentication required"), time.Now().Add(time.Second))
		return false
	}
	_ = ws.SetReadDeadline(time.Time{})
	_ = ws.SetWriteDeadline(time.Now().Add(5 * time.Second))
	return ws.WriteJSON(protocol.NewEnvelope(protocol.TypeAuth, map[string]any{"ok": true, "workspace": h.Workspace()})) == nil
}
