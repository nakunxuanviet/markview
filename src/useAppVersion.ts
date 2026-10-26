import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";

let cached: string | null = null;
let pending: Promise<string> | null = null;

function resolveVersion(): Promise<string> {
  if (cached) return Promise.resolve(cached);
  if (!pending) {
    pending = getVersion()
      .then((version) => {
        cached = version;
        return version;
      })
      .catch(() => {
        cached = "2.0.3";
        return cached;
      });
  }
  return pending;
}

/** App version from the Tauri bundle, with a safe fallback outside Tauri. */
export function useAppVersion(): string {
  const [version, setVersion] = useState(cached ?? "2.0.3");

  useEffect(() => {
    let alive = true;
    void resolveVersion().then((value) => {
      if (alive) setVersion(value);
    });
    return () => {
      alive = false;
    };
  }, []);

  return version;
}
