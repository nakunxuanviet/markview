import { api, pickFile } from "./api";
import { editorRef } from "./editorRef";
import { useStore } from "./store";
import { toast } from "./toast";
import { basename } from "./utils";

export async function saveActiveAs(): Promise<void> {
  const id = useStore.getState().activeId;
  if (!id) return;
  await useStore.getState().beginSaveAs(id);
}

export async function reloadAllFromDisk(): Promise<void> {
  const state = useStore.getState();
  const skipped: string[] = [];
  for (const tab of Object.values(state.tabs)) {
    if (!tab.path) continue;
    if (tab.modified) {
      skipped.push(tab.filename);
      continue;
    }
    try {
      const data = await api.openFileByPath(tab.path);
      if (data && !data.error && typeof data.content === "string") {
        state.replaceTabContent(tab.id, data.content, true);
      }
    } catch {
      /* ignore individual failures */
    }
  }
  if (skipped.length) {
    toast.show(`Skipped modified file(s): ${skipped.join(", ")}`, {
      type: "warn",
      duration: 5000,
    });
  } else {
    toast.show("Reloaded all files from disk", {
      type: "success",
      duration: 1500,
    });
  }
}

export function openFind(replace: boolean): void {
  useStore.setState({ findOpen: true });
  window.dispatchEvent(
    new CustomEvent("markview:find", { detail: { replace } }),
  );
}

function activeContent(): string {
  const state = useStore.getState();
  const tab = state.activeId ? state.tabs[state.activeId] : null;
  return editorRef.view
    ? editorRef.view.state.doc.toString()
    : (tab?.content ?? "");
}

export async function compareWithSaved(): Promise<void> {
  const state = useStore.getState();
  const tab = state.activeId ? state.tabs[state.activeId] : null;
  if (!tab?.path) {
    toast.show("Save the file first to compare with the disk version.", {
      type: "warn",
      duration: 4000,
    });
    return;
  }
  try {
    const disk = await api.openFileByPath(tab.path);
    if (!disk || disk.error) {
      toast.show("Could not read the file from disk.", { type: "error" });
      return;
    }
    useStore.setState({
      diffLeft: disk.content ?? "",
      diffRight: activeContent(),
      diffLeftLabel: "Saved on disk",
      diffRightLabel: "Current (unsaved)",
      diffOpen: true,
    });
  } catch (error) {
    toast.show(`Compare failed: ${String(error)}`, { type: "error" });
  }
}

export async function compareWithFile(): Promise<void> {
  const state = useStore.getState();
  const tab = state.activeId ? state.tabs[state.activeId] : null;
  const current = activeContent();
  const path = await pickFile();
  if (!path) return;
  try {
    const data = await api.openFileByPath(path);
    if (!data || data.error) {
      toast.show("Could not open the selected file.", { type: "error" });
      return;
    }
    useStore.setState({
      diffLeft: current,
      diffRight: data.content ?? "",
      diffLeftLabel: tab?.filename ?? "Current",
      diffRightLabel: data.filename ?? basename(path),
      diffOpen: true,
    });
  } catch (error) {
    toast.show(`Compare failed: ${String(error)}`, { type: "error" });
  }
}
