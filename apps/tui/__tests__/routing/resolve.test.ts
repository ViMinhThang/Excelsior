import { describe, expect, it } from "vitest";
import { resolve, type ResolveContext } from "../../src/routing/resolve.js";

function ctx(partial: Partial<ResolveContext>): ResolveContext {
  return {
    focus: "input",
    screen: "chat",
    combo: "",
    text: null,
    overlayKind: "none",
    questionManual: false,
    ...partial,
  };
}

describe("resolve", () => {
  it("routes printable text to input.insert while input is focused", () => {
    expect(resolve(ctx({ combo: "a", text: "a" }))).toBe("input.insert");
  });

  it("does not accept text in transcript or app focus", () => {
    expect(resolve(ctx({ focus: "transcript", combo: "a", text: "a" }))).toBeNull();
    expect(resolve(ctx({ focus: "app", combo: "a", text: "a" }))).toBeNull();
  });

  it("routes text to settings.insert while a settings field is focused", () => {
    expect(resolve(ctx({ focus: "settings", screen: "settings", combo: "x", text: "x" }))).toBe(
      "settings.insert",
    );
  });

  it("routes text to question.insert only in manual question mode", () => {
    const base = {
      focus: "overlay" as const,
      overlayKind: "pending-question" as const,
      combo: "h",
      text: "h",
    };
    expect(resolve(ctx({ ...base, questionManual: false }))).toBeNull();
    expect(resolve(ctx({ ...base, questionManual: true }))).toBe("question.insert");
  });

  it("resolves ctrl+c to app.exit on every focus (except settings table override)", () => {
    expect(resolve(ctx({ combo: "ctrl+c" }))).toBe("app.exit");
    expect(resolve(ctx({ focus: "transcript", combo: "ctrl+c" }))).toBe("app.exit");
  });

  it("resolves input keys only while input is focused", () => {
    expect(resolve(ctx({ combo: "enter" }))).toBe("input.submit");
    expect(resolve(ctx({ combo: "escape" }))).toBe("input.blur");
    expect(resolve(ctx({ focus: "transcript", combo: "enter" }))).toBeNull();
  });

  it("resolves transcript scrolling keys only while transcript is focused", () => {
    expect(resolve(ctx({ focus: "transcript", combo: "up" }))).toBe("transcript.scrollUp");
    expect(resolve(ctx({ focus: "transcript", combo: "ctrl+f" }))).toBe("transcript.toggleFollow");
    expect(resolve(ctx({ focus: "input", combo: "up" }))).toBe("input.historyUp");
  });

  it("lets pageup/pagedown scroll the transcript from any chat focus", () => {
    expect(resolve(ctx({ focus: "input", combo: "pageup" }))).toBe("transcript.pageUp");
    expect(resolve(ctx({ focus: "app", combo: "pagedown" }))).toBe("transcript.pageDown");
    expect(resolve(ctx({ focus: "transcript", combo: "pagedown" }))).toBe("transcript.pageDown");
  });

  it("resolves chat screen keys from any chat focus", () => {
    expect(resolve(ctx({ combo: "ctrl+s" }))).toBe("app.openSettings");
    expect(resolve(ctx({ focus: "transcript", combo: "ctrl+s" }))).toBe("app.openSettings");
    expect(resolve(ctx({ combo: "ctrl+p" }))).toBe("app.openSessions");
    expect(resolve(ctx({ combo: "ctrl+n" }))).toBe("app.newSession");
    expect(resolve(ctx({ combo: "ctrl+d" }))).toBe("app.deleteSession");
    expect(resolve(ctx({ combo: "ctrl+o" }))).toBe("transcript.toggleTools");
    expect(resolve(ctx({ combo: "tab" }))).toBe("input.tab");
    expect(resolve(ctx({ focus: "transcript", combo: "tab" }))).toBe("app.toggleMode");
    expect(resolve(ctx({ combo: "shift+tab" }))).toBe("app.toggleMode");
    expect(resolve(ctx({ combo: "ctrl+up" }))).toBe("transcript.scrollUp");
    expect(resolve(ctx({ combo: "ctrl+down" }))).toBe("transcript.scrollDown");
  });

  it("lets overlays capture all keys while open", () => {
    expect(
      resolve(ctx({ focus: "overlay", overlayKind: "pending-confirm", combo: "y" })),
    ).toBe("confirm.approve");
    expect(
      resolve(ctx({ focus: "overlay", overlayKind: "pending-question", combo: "1" })),
    ).toBe("question.select:0");
    expect(
      resolve(ctx({ focus: "overlay", overlayKind: "session-list", combo: "d" })),
    ).toBe("session-list.delete");
    expect(
      resolve(ctx({ focus: "overlay", overlayKind: "session-list", combo: "up" })),
    ).toBe("session-list.move:-1");
    expect(
      resolve(ctx({ focus: "overlay", overlayKind: "session-list", combo: "down" })),
    ).toBe("session-list.move:1");
  });

  it("captures overlay letter/digit keys even when the keypress carries text", () => {
    expect(
      resolve(ctx({ focus: "overlay", overlayKind: "session-list", combo: "n", text: "n" })),
    ).toBe("session-list.create");
    expect(
      resolve(ctx({ focus: "overlay", overlayKind: "session-list", combo: "d", text: "d" })),
    ).toBe("session-list.delete");
    expect(
      resolve(ctx({ focus: "overlay", overlayKind: "pending-confirm", combo: "y", text: "y" })),
    ).toBe("confirm.approve");
    expect(
      resolve(ctx({ focus: "overlay", overlayKind: "pending-question", combo: "1", text: "1" })),
    ).toBe("question.select:0");
  });

  it("does not route unbound overlay letters to text insertion", () => {
    expect(
      resolve(ctx({ focus: "overlay", overlayKind: "session-list", combo: "x", text: "x" })),
    ).toBeNull();
  });

  it("keeps app.exit available above overlays", () => {
    expect(
      resolve(ctx({ focus: "overlay", overlayKind: "pending-confirm", combo: "ctrl+c" })),
    ).toBe("app.exit");
  });

  it("resolves settings keys while on the settings screen", () => {
    expect(resolve(ctx({ focus: "settings", screen: "settings", combo: "ctrl+s" }))).toBe(
      "settings.save",
    );
    expect(resolve(ctx({ focus: "settings", screen: "settings", combo: "escape" }))).toBe(
      "settings.back",
    );
    expect(resolve(ctx({ screen: "settings", combo: "enter" }))).toBeNull();
  });

  it("returns null for unbound combos", () => {
    expect(resolve(ctx({ combo: "f5" }))).toBeNull();
    expect(resolve(ctx({ focus: "transcript", combo: "x", text: "x" }))).toBeNull();
  });
});
