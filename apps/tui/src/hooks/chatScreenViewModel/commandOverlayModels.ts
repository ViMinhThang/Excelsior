import type { CommandPaletteProps } from "../../components/palette/CommandPalette.js";
import type { CommandSuggestionsProps } from "../../components/chat/CommandSuggestions.js";
import type { CommandSuggestionState } from "../../chatModes/types.js";
import type { CommandPaletteState, VisibilityModel } from "./types.js";

export function buildSuggestionsModel(
  suggestion: CommandSuggestionState,
  paletteOpen: boolean,
): VisibilityModel<CommandSuggestionsProps> {
  return {
    visible: !paletteOpen && suggestion.show && suggestion.filtered.length > 0,
    props: {
      commands: suggestion.filtered,
      selectedIndex: suggestion.selectedIndex,
      maxVisibleCount: suggestion.maxVisibleCount,
    },
  };
}

export function buildPaletteModel(
  palette: CommandPaletteState,
): VisibilityModel<CommandPaletteProps> {
  return {
    visible: palette.isOpen,
    props: {
      search: palette.search,
      setSearch: palette.setSearch,
      selectedIndex: palette.selectedIndex,
      filtered: palette.filtered,
      total: palette.total,
      next: palette.next,
      prev: palette.prev,
      insertCommand: palette.insertCommand,
      close: palette.close,
    },
  };
}
