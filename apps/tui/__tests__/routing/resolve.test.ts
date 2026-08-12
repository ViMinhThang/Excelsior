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

  it("resolves chat screen keys from any chat focus", () => {
    expect(resolve(ctx({ combo: "ctrl+s" }))).toBe("app.openSettings");
    expect(resolve(ctx({ focus: "transcript", combo: "ctrl+s" }))).toBe("app.openSettings");
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
