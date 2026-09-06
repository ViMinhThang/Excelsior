package engine

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"excelsior/pkg/auth"
)

type authCredentials struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type authTokenResponse struct {
	Token    string `json:"token"`
	Username string `json:"username,omitempty"`
}

func (h *Hub) authenticateRequest(w http.ResponseWriter, r *http.Request) (int64, string, bool) {
	if h.Auth == nil {
		return 0, "", true
	}
	token := bearerToken(r.Header.Get("Authorization"))
	if token == "" {
		token = strings.TrimSpace(r.URL.Query().Get("token"))
	}
	userID, username, err := h.Auth.ValidateToken(r.Context(), token)
	if err != nil {
		h.logger().Warn("engine authentication failed", "remote", r.RemoteAddr, "err", err)
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return 0, "", false
	}
	return userID, username, true
}

func bearerToken(header string) string {
	parts := strings.Fields(header)
	if len(parts) == 2 && strings.EqualFold(parts[0], "bearer") {
		return parts[1]
	}
	return ""
}

func (h *Hub) handleAuthRegister(w http.ResponseWriter, r *http.Request) {
	if h.Auth == nil {
		http.NotFound(w, r)
		return
	}
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req authCredentials
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	token, err := h.Auth.Register(r.Context(), req.Username, req.Password)
	if err != nil {
		writeAuthError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, authTokenResponse{Token: token, Username: req.Username})
}

func (h *Hub) handleAuthLogin(w http.ResponseWriter, r *http.Request) {
	if h.Auth == nil {
		http.NotFound(w, r)
		return
	}
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req authCredentials
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	token, err := h.Auth.Login(r.Context(), req.Username, req.Password)
	if err != nil {
		writeAuthError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, authTokenResponse{Token: token, Username: req.Username})
}

func (h *Hub) handleAuthMe(w http.ResponseWriter, r *http.Request) {
	if h.Auth == nil {
		http.NotFound(w, r)
		return
	}
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	_, username, ok := h.authenticateRequest(w, r)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"username": username})
}

func writeAuthError(w http.ResponseWriter, err error) {
	status := http.StatusBadRequest
	if errors.Is(err, auth.ErrUserExists) {
		status = http.StatusConflict
	} else if errors.Is(err, auth.ErrInvalidCredentials) {
		status = http.StatusUnauthorized
	}
	http.Error(w, err.Error(), status)
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
