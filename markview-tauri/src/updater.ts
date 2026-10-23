import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";

import { useStore } from "./store";
import { toast } from "./toast";

let running = false;

/** Dev builds run from `tauri dev`; keep background checks out of them. */
const isDev = import.meta.env.DEV;

function errorText(error: unknown): string {
  return String(error instanceof Error ? error.message : error).replace(
    /^Error:\s*/i,
    "",
  );
}

/**
 * Check GitHub Releases for a newer signed build and download it in the
 * background. Installing on Windows means quitting the app so the NSIS
 * installer can replace it, so the user is asked before that happens.
 */
export async function checkForUpdates(
  options: { silent?: boolean } = {},
): Promise<void> {
  const silent = options.silent !== false;
  if (running) return;
  if (isDev) {
    if (!silent) {
      toast.show("Update checks are disabled in dev builds.", { type: "info" });
    }
    return;
  }

  running = true;
  try {
    const update = await check({ timeout: 20000 });
    if (!update) {
      if (!silent) {
        toast.show("You're running the latest version.", { type: "success" });
      }
      return;
    }

    if (!silent) {
      toast.show(`Downloading MarkView ${update.version}…`, { duration: 8000 });
    }
    await update.download();

    const restart = await toast.confirm(
      `MarkView ${update.version} is ready. Restart now to install it?`,
      { confirmText: "Restart", cancelText: "Later" },
    );

    if (!restart) {
      await update.close();
      if (!silent) {
        toast.show(
          "Update skipped. MarkView will offer it again next launch.",
          {
            type: "info",
          },
        );
      }
      return;
    }

    // Flush the session first: installing exits the process, and the restarted
    // build should come back with the same tabs and unsaved buffers.
    await useStore.getState().saveSession();
    await update.install();
    // Windows quits during install; other platforms need an explicit relaunch.
    await relaunch();
  } catch (error) {
    if (!silent) {
      toast.show(`Could not check for updates: ${errorText(error)}`, {
        type: "error",
        duration: 6000,
      });
    }
    console.warn("update check failed", error);
  } finally {
    running = false;
  }
}
