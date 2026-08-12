import { useCallback, useRef, useState } from "react";
import { createDefaultSave, readArcadeSave, writeArcadeSave } from "../persistence.ts";
import type { ArcadePersistenceOptions } from "../persistence.ts";
import type { ArcadeSaveV2, ArcadeSettings } from "../types.ts";

export function useArcadeSave({ persistence, initialSettings }: {
  persistence: false | ArcadePersistenceOptions;
  initialSettings?: Partial<ArcadeSettings>;
}) {
  const persistenceRef = useRef(persistence);
  persistenceRef.current = persistence;
  const [save, setSave] = useState<ArcadeSaveV2>(() => {
    const defaults = createDefaultSave();
    Object.assign(defaults.settings, initialSettings);
    return persistence === false ? defaults : readArcadeSave({ ...persistence, defaults });
  });
  const saveRef = useRef(save);
  saveRef.current = save;

  const commitSave = useCallback((update: (draft: ArcadeSaveV2) => void) => {
    setSave((current) => {
      const next = structuredClone(current);
      update(next);
      if (persistenceRef.current !== false) {
        writeArcadeSave(next, persistenceRef.current);
      }
      return next;
    });
  }, []);

  const changeSettings = useCallback(
    (patch: Partial<ArcadeSettings>) => {
      commitSave((draft) => Object.assign(draft.settings, patch));
    },
    [commitSave],
  );

  return { save, saveRef, commitSave, changeSettings };
}
