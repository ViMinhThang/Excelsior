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

// AuthError is a typed domain error for auth operations.
type AuthError struct {
	Op       string
	Username string
	Err      error
}

func (e *AuthError) Error() string {
	meta := ""
	if e.Op != "" {
		meta = " [" + e.Op
		if e.Username != "" {
			meta += fmt.Sprintf(" user=%s", e.Username)
		}
		meta += "]"
	}
	base := "auth" + meta
	if e.Err != nil {
		return fmt.Sprintf("%s: %v", base, e.Err)
	}
	return base
}

func (e *AuthError) Unwrap() error { return e.Err }
func (e *AuthError) Is(target error) bool {
	if target == nil {
		return false
	}
	return errors.Is(e.Err, target)
}
