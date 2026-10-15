import { ACTS } from "../content.ts";

export const TEST_LEVELS = ACTS.flatMap((act, actIndex) => [
  ...act.encounters.flatMap((encounter, encounterIndex) => [
    {
      id: `${actIndex}:encounter:${encounterIndex}`,
      label: `Job ${encounterIndex + 1} — ${encounter.name}`,
      actIndex,
      kind: "encounter" as const,
      encounterIndex,
    },
    ...(act.miniboss?.afterEncounterIndex === encounterIndex
      ? [{
        id: `${actIndex}:miniboss`,
        label: `Miniboss — ${act.miniboss.name}`,
        actIndex,
        kind: "miniboss" as const,
      }]
      : []),
  ]),
  {
    id: `${actIndex}:boss`,
    label: `Boss — ${act.boss.name}`,
    actIndex,
    kind: "boss" as const,
  },
]);
