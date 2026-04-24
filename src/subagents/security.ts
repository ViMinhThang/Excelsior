/**
 * @file src/subagents/security.ts
 * @description The Security subagent.
 * @why To prevent known vulnerabilities from being merged by automatically checking new dependencies or insecure coding patterns.
 * @how Parses `package.json` diffs and queries a CVE Database (OSV/npm audit) tool, and flags insecure patterns in the code.
 * @input The PR diff, focusing heavily on dependency files and sensitive logic areas.
 * @output A list of high-priority security warnings or vulnerabilities.
 */

// Implementation will go here...
