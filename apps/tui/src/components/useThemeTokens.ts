import { useSlice } from "../store/store.js";
import { selectTheme } from "../store/selectors.js";
import type { ThemeTokens } from "../theme/tokens.js";

export function useThemeTokens(): ThemeTokens {
  return useSlice(selectTheme).tokens;
}
