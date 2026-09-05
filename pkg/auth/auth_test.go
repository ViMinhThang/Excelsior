package auth

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"excelsior/pkg/db"
)

func setupTestStore(t *testing.T) *Store {
	t.Helper()
	tmpDir := t.TempDir()
	database, err := db.Open(filepath.Join(tmpDir, "test_auth.db"))
	if err != nil {
		t.Fatalf("setup db failed: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	return NewStore(database)
}

func TestAuthRegisterAndLogin(t *testing.T) {
	store := setupTestStore(t)
	ctx := context.Background()

	// 1. Validation errors
	_, err := store.Register(ctx, "ab", "password123")
	if !errors.Is(err, ErrInvalidUsername) {
		t.Fatalf("expected ErrInvalidUsername, got %v", err)
	}

	_, err = store.Register(ctx, "alice", "short")
	if !errors.Is(err, ErrInvalidPassword) {
		t.Fatalf("expected ErrInvalidPassword, got %v", err)
	}

	// 2. Successful registration
	tok1, err := store.Register(ctx, "alice", "supersecret123")
	if err != nil {
		t.Fatalf("register failed: %v", err)
	}
	if tok1 == "" {
		t.Fatalf("expected non-empty token")
	}

	// 3. Duplicate registration
	_, err = store.Register(ctx, "alice", "differentpw123")
	if !errors.Is(err, ErrUserExists) {
		t.Fatalf("expected ErrUserExists, got %v", err)
	}

	// 4. Case-insensitive duplicate registration
	_, err = store.Register(ctx, "ALICE", "differentpw123")
	if !errors.Is(err, ErrUserExists) {
		t.Fatalf("expected ErrUserExists for ALICE, got %v", err)
	}

	// 5. UserExists
	exists, err := store.UserExists(ctx, "Alice")
	if err != nil || !exists {
		t.Fatalf("expected UserExists to return true for Alice, got %v, err=%v", exists, err)
	}
	notExists, err := store.UserExists(ctx, "bob")
	if err != nil || notExists {
		t.Fatalf("expected UserExists to return false for bob, got %v, err=%v", notExists, err)
	}

	// 6. Successful login (case-insensitive)
	tok2, err := store.Login(ctx, "Alice", "supersecret123")
	if err != nil {
		t.Fatalf("login failed: %v", err)
	}
	if tok2 == "" {
		t.Fatalf("expected non-empty token from login")
	}

	// 7. Bad credentials
	_, err = store.Login(ctx, "alice", "wrongpassword")
	if !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("expected ErrInvalidCredentials, got %v", err)
	}

	_, err = store.Login(ctx, "nonexistent", "supersecret123")
	if !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("expected ErrInvalidCredentials for nonexistent user, got %v", err)
	}
}

func TestAuthValidateToken(t *testing.T) {
	store := setupTestStore(t)
	ctx := context.Background()

	// Empty token
	_, _, err := store.ValidateToken(ctx, "")
	if !errors.Is(err, ErrTokenNotFound) {
		t.Fatalf("expected ErrTokenNotFound on empty token, got %v", err)
	}

	// Non-existent token
	_, _, err = store.ValidateToken(ctx, "invalid-random-token")
	if !errors.Is(err, ErrTokenNotFound) {
		t.Fatalf("expected ErrTokenNotFound on invalid token, got %v", err)
	}

	// Valid token
	tok, err := store.Register(ctx, "bob_user", "password123")
	if err != nil {
		t.Fatalf("register failed: %v", err)
	}

	uid, username, err := store.ValidateToken(ctx, tok)
	if err != nil {
		t.Fatalf("validate token failed: %v", err)
	}
	if uid <= 0 || username != "bob_user" {
		t.Fatalf("unexpected uid=%d, username=%s", uid, username)
	}
}

func TestAuthTokenExpirationAndCleanup(t *testing.T) {
	store := setupTestStore(t)
	ctx := context.Background()

	tok, err := store.Register(ctx, "expire_user", "password123")
	if err != nil {
		t.Fatalf("register failed: %v", err)
	}

	// Manually set expiration in the past
	past := time.Now().UTC().Add(-1 * time.Hour).Format(time.RFC3339Nano)
	_, err = store.db.ExecContext(ctx, `UPDATE tokens SET expires_at=? WHERE token=?`, past, tok)
	if err != nil {
		t.Fatalf("update expires_at failed: %v", err)
	}

	// Validate expired token
	_, _, err = store.ValidateToken(ctx, tok)
	if !errors.Is(err, ErrTokenExpired) {
		t.Fatalf("expected ErrTokenExpired, got %v", err)
	}

	// Token should now be deleted after expiry check
	_, _, err = store.ValidateToken(ctx, tok)
	if !errors.Is(err, ErrTokenNotFound) {
		t.Fatalf("expected ErrTokenNotFound after deletion, got %v", err)
	}

	// Test CleanupExpired
	tok2, err := store.Login(ctx, "expire_user", "password123")
	if err != nil {
		t.Fatalf("login failed: %v", err)
	}
	_, err = store.db.ExecContext(ctx, `UPDATE tokens SET expires_at=? WHERE token=?`, past, tok2)
	if err != nil {
		t.Fatalf("update expires_at failed: %v", err)
	}

	cleaned, err := store.CleanupExpired(ctx)
	if err != nil {
		t.Fatalf("cleanup failed: %v", err)
	}
	if cleaned != 1 {
		t.Fatalf("expected 1 token cleaned, got %d", cleaned)
	}
}
