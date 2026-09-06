package auth

import (
	"errors"
	"fmt"
)

var (
	ErrUserExists         = errors.New("auth: username already exists")
	ErrInvalidCredentials = errors.New("auth: invalid username or password")
	ErrTokenExpired       = errors.New("auth: token expired")
	ErrTokenNotFound      = errors.New("auth: token not found")
	ErrInvalidUsername    = errors.New("auth: invalid username")
	ErrInvalidPassword    = errors.New("auth: invalid password")
)

// errf builds an auth error. Replaces &AuthError{...} literals site-wide.
func errf(op, username string, err error) error {
	if username == "" {
		return fmt.Errorf("auth %s: %w", op, err)
	}
	return fmt.Errorf("auth %s %q: %w", op, username, err)
}
