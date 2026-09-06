package auth

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"errors"
	"regexp"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

var validUsername = regexp.MustCompile(`^[a-zA-Z0-9._-]{3,32}$`)

// Store is the auth persistence layer on a single sqlite DB.
type Store struct {
	db *sql.DB
}

// NewStore wraps an opened *sql.DB (from pkg/db.Open).
func NewStore(db *sql.DB) *Store { return &Store{db: db} }

func validateUsername(u string) error {
	u = strings.TrimSpace(u)
	if !validUsername.MatchString(u) {
		return errf("validate", u, ErrInvalidUsername)
	}
	return nil
}

func validatePassword(p string) error {
	if len(p) < 8 || len(p) > 128 {
		return errf("validate", "", ErrInvalidPassword)
	}
	return nil
}

func newToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

const tokenTTL = 30 * 24 * time.Hour

// Register creates a user and returns a bearer token.
func (s *Store) Register(ctx context.Context, username, password string) (string, error) {
	username = strings.TrimSpace(username)
	if err := validateUsername(username); err != nil {
		return "", err
	}
	if err := validatePassword(password); err != nil {
		return "", err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", errf("register", username, err)
	}
	_, err = s.db.ExecContext(ctx, `INSERT INTO users(username,password_hash) VALUES(?,?)`, username, string(hash))
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			return "", errf("register", username, ErrUserExists)
		}
		return "", errf("register", username, err)
	}
	var userID int64
	if err := s.db.QueryRowContext(ctx, `SELECT id FROM users WHERE username=?`, username).Scan(&userID); err != nil {
		return "", errf("register", username, err)
	}
	return s.issueToken(ctx, userID)
}

// Login verifies password and returns a new bearer token.
func (s *Store) Login(ctx context.Context, username, password string) (string, error) {
	username = strings.TrimSpace(username)
	var userID int64
	var hash string
	err := s.db.QueryRowContext(ctx, `SELECT id,password_hash FROM users WHERE username=? COLLATE NOCASE`, username).Scan(&userID, &hash)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", errf("login", username, ErrInvalidCredentials)
		}
		return "", errf("login", username, err)
	}
	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)); err != nil {
		return "", errf("login", username, ErrInvalidCredentials)
	}
	return s.issueToken(ctx, userID)
}

func (s *Store) issueToken(ctx context.Context, userID int64) (string, error) {
	tok, err := newToken()
	if err != nil {
		return "", err
	}
	exp := time.Now().Add(tokenTTL).UTC()
	_, err = s.db.ExecContext(ctx, `INSERT INTO tokens(token,user_id,expires_at) VALUES(?,?,?)`, tok, userID, exp.Format(time.RFC3339Nano))
	if err != nil {
		return "", errf("token", "", err)
	}
	return tok, nil
}

// ValidateToken returns userID and username for a valid, non-expired token.
func (s *Store) ValidateToken(ctx context.Context, token string) (int64, string, error) {
	token = strings.TrimSpace(token)
	if token == "" {
		return 0, "", errf("validate", "", ErrTokenNotFound)
	}
	var userID int64
	var username, expStr string
	err := s.db.QueryRowContext(ctx,
		`SELECT u.id, u.username, t.expires_at FROM tokens t JOIN users u ON u.id=t.user_id WHERE t.token=?`, token).
		Scan(&userID, &username, &expStr)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return 0, "", errf("validate", "", ErrTokenNotFound)
		}
		return 0, "", errf("validate", "", err)
	}
	exp, err := time.Parse(time.RFC3339Nano, expStr)
	if err != nil {
		// fallback: try without nano
		if e2, err2 := time.Parse(time.RFC3339, expStr); err2 == nil {
			exp = e2
		} else {
			return 0, "", errf("validate", "", err)
		}
	}
	if time.Now().UTC().After(exp) {
		_, _ = s.db.ExecContext(ctx, `DELETE FROM tokens WHERE token=?`, token)
		return 0, "", errf("validate", "", ErrTokenExpired)
	}
	return userID, username, nil
}

// CleanupExpired deletes expired tokens. Call on startup or periodically.
func (s *Store) CleanupExpired(ctx context.Context) (int64, error) {
	res, err := s.db.ExecContext(ctx, `DELETE FROM tokens WHERE expires_at < ?`, time.Now().UTC().Format(time.RFC3339Nano))
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	return n, nil
}

// UserExists checks if username is taken (case-insensitive).
func (s *Store) UserExists(ctx context.Context, username string) (bool, error) {
	var n int
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users WHERE username=? COLLATE NOCASE`, strings.TrimSpace(username)).Scan(&n)
	return n > 0, err
}
