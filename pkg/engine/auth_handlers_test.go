package engine

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/gorilla/websocket"

	"excelsior/pkg/auth"
	"excelsior/pkg/config"
	"excelsior/pkg/db"
	"excelsior/pkg/protocol"
)

func TestAuthenticatedEngineRequiresTokenAndScopesConnection(t *testing.T) {
	database, err := db.Open(filepath.Join(t.TempDir(), "engine.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()

	hub := NewHub(config.Config{}, t.TempDir())
	hub.DB = database
	hub.Auth = auth.NewStore(database)
	server := httptest.NewServer(hub.Handler())
	defer server.Close()

	body := bytes.NewBufferString(`{"username":"alice","password":"secret123"}`)
	resp, err := http.Post(server.URL+"/v1/auth/register", "application/json", body)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("register status = %d", resp.StatusCode)
	}
	var token authTokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&token); err != nil {
		t.Fatal(err)
	}
	if token.Token == "" {
		t.Fatal("register returned an empty token")
	}

	wsURL := "ws" + server.URL[len("http"):] + "/v1/ws"
	if _, _, err := websocket.DefaultDialer.Dial(wsURL, nil); err == nil {
		t.Fatal("unauthenticated websocket connection unexpectedly succeeded")
	}

	header := http.Header{"Authorization": []string{"Bearer " + token.Token}}
	ws, response, err := websocket.DefaultDialer.Dial(wsURL, header)
	if err != nil {
		t.Fatalf("authenticated websocket dial: %v", err)
	}
	defer ws.Close()
	if response.StatusCode != http.StatusSwitchingProtocols {
		t.Fatalf("websocket status = %d", response.StatusCode)
	}

	if err := ws.WriteJSON(protocol.NewEnvelope(protocol.TypeSessionList, nil)); err != nil {
		t.Fatal(err)
	}
	var envelope protocol.Envelope
	if err := ws.ReadJSON(&envelope); err != nil {
		t.Fatal(err)
	}
	if envelope.Type != protocol.TypeSessionList {
		t.Fatalf("response type = %q, want %q", envelope.Type, protocol.TypeSessionList)
	}
}
