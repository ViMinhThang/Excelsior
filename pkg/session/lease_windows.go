//go:build windows

package session

import (
	"os"
	"syscall"
	"unsafe"
)

const (
	lockFailImmediately = 1
	lockExclusive       = 2
)

var (
	procLockFileEx = syscall.NewLazyDLL("kernel32.dll").NewProc("LockFileEx")
)

// openLockFile opens (creating if needed) the store lock file. FILE_SHARE_DELETE
// lets the directory be cleaned up while the lease is held; deleting the file
// does not release the lock.
func openLockFile(path string) (*os.File, error) {
	p, err := syscall.UTF16PtrFromString(path)
	if err != nil {
		return nil, err
	}
	h, err := syscall.CreateFile(
		p,
		syscall.GENERIC_READ|syscall.GENERIC_WRITE,
		syscall.FILE_SHARE_READ|syscall.FILE_SHARE_WRITE|syscall.FILE_SHARE_DELETE,
		nil,
		syscall.OPEN_ALWAYS,
		syscall.FILE_ATTRIBUTE_NORMAL,
		0,
	)
	if err != nil {
		return nil, err
	}
	return os.NewFile(uintptr(h), path), nil
}

// lockFileExclusive takes an immediate exclusive byte-range lock; the OS
// releases it when the process exits.
func lockFileExclusive(f *os.File) error {
	ol := new(syscall.Overlapped)
	r1, _, err := procLockFileEx.Call(
		f.Fd(),
		uintptr(lockFailImmediately|lockExclusive),
		0,
		1, 0,
		uintptr(unsafe.Pointer(ol)),
	)
	if r1 == 0 {
		return err
	}
	return nil
}
