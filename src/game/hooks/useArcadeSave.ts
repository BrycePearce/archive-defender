import { useCallback, useRef, useState } from "react";
import { readArcadeSave, writeArcadeSave } from "../persistence.ts";
import type { ArcadeSaveV2, ArcadeSettings } from "../types.ts";

export function useArcadeSave() {
  const [save, setSave] = useState<ArcadeSaveV2>(readArcadeSave);
  const saveRef = useRef(save);
  saveRef.current = save;

  const commitSave = useCallback((update: (draft: ArcadeSaveV2) => void) => {
    setSave((current) => {
      const next = structuredClone(current);
      update(next);
      writeArcadeSave(next);
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
