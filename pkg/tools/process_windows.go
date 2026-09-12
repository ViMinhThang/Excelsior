//go:build windows

package tools

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"sync"
	"syscall"
	"unsafe"
)

var jobDLL = syscall.NewLazyDLL("kernel32.dll")
var createJob = jobDLL.NewProc("CreateJobObjectW")
var setJobInfo = jobDLL.NewProc("SetInformationJobObject")
var assignJob = jobDLL.NewProc("AssignProcessToJobObject")
var terminateJob = jobDLL.NewProc("TerminateJobObject")

type jobBasicLimits struct {
	ProcessTime, JobTime           int64
	Flags                          uint32
	MinWorkingSet, MaxWorkingSet   uintptr
	ActiveProcessLimit             uint32
	Affinity                       uintptr
	PriorityClass, SchedulingClass uint32
}
type jobExtendedLimits struct {
	Basic                                                      jobBasicLimits
	IO                                                         [6]uint64
	ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory uintptr
}

// Job membership is inherited by descendants. A stdin gate prevents the shell
// from executing user commands before assignment. Closing the job kills children.
// https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects
func shellCommand(ctx context.Context, command string) (*exec.Cmd, func() error, func(), error) {
	job, _, err := createJob.Call(0, 0)
	if job == 0 {
		return nil, nil, nil, fmt.Errorf("create process job: %w", err)
	}
	limits := jobExtendedLimits{}
	limits.Basic.Flags = 0x2000 // KILL_ON_JOB_CLOSE
	if ok, _, e := setJobInfo.Call(job, 9, uintptr(unsafe.Pointer(&limits)), unsafe.Sizeof(limits)); ok == 0 {
		syscall.CloseHandle(syscall.Handle(job))
		return nil, nil, nil, fmt.Errorf("configure process job: %w", e)
	}
	input, gate, err := os.Pipe()
	if err != nil {
		syscall.CloseHandle(syscall.Handle(job))
		return nil, nil, nil, err
	}
	cmd := exec.CommandContext(ctx, "powershell", "-NoProfile", "-NonInteractive", "-Command", "if ([Console]::ReadLine() -ne 'start') { exit 1 }; "+command)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	cmd.Stdin = input
	var once sync.Once
	cleanup := func() { once.Do(func() { gate.Close(); input.Close(); syscall.CloseHandle(syscall.Handle(job)) }) }
	cmd.Cancel = func() error {
		if ok, _, e := terminateJob.Call(job, 1); ok == 0 {
			return e
		}
		return nil
	}
	start := func() error {
		if err := cmd.Start(); err != nil {
			return err
		}
		handle, err := syscall.OpenProcess(0x0100|0x0001, false, uint32(cmd.Process.Pid))
		if err == nil {
			ok, _, e := assignJob.Call(job, uintptr(handle))
			syscall.CloseHandle(handle)
			if ok == 0 {
				err = e
			}
		}
		if err != nil {
			_ = cmd.Process.Kill()
			_ = cmd.Wait()
			return fmt.Errorf("assign process job: %w", err)
		}
		_, err = gate.WriteString("start\n")
		gate.Close()
		input.Close()
		if err != nil {
			_ = cmd.Cancel()
			_ = cmd.Wait()
		}
		return err
	}
	return cmd, start, cleanup, nil
}
