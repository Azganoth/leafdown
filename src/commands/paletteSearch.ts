import type { AppCommandId } from "./dispatch";

export interface PaletteCommand {
  id: AppCommandId;
  label: string;
  menuPath: string;
}

export const searchPaletteCommands = (commands: PaletteCommand[], query: string) => {
  const normalizedQuery = query.trim().replace(/\s+/gu, " ").toLocaleLowerCase();
  if (!normalizedQuery) {
    return commands;
  }

  const terms = normalizedQuery.split(" ");

  return commands
    .map((command, index) => {
      const label = command.label.toLocaleLowerCase();
      const searchable = command.menuPath.toLocaleLowerCase();
      if (!terms.every((term) => searchable.includes(term))) {
        return null;
      }

      const rank =
        label === normalizedQuery
          ? 0
          : label.startsWith(normalizedQuery)
            ? 1
            : terms.every((term) => label.includes(term))
              ? 2
              : 3;

      return { command, index, rank };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .toSorted((left, right) => left.rank - right.rank || left.index - right.index)
    .map(({ command }) => command);
};
