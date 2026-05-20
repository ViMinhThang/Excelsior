declare module "cli-highlight" {
  export interface HighlightOptions {
    language?: string;
    theme?: Record<string, unknown>;
    ignoreIllegals?: boolean;
  }

  export function highlight(code: string, options?: HighlightOptions): string;
  export function listLanguages(): string[];
  export function hasLanguage(lang: string): boolean;
}
