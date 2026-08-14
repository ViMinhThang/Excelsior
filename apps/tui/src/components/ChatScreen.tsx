import { useSlice } from "../store/store.js";
import { selectOverlay, selectStatus } from "../store/selectors.js";
import { Transcript } from "./chat/Transcript.js";
import { InputBar } from "./InputBar.js";
import { StatusBar } from "./StatusBar.js";
import { FooterBar } from "./FooterBar.js";
import { PendingOverlay } from "./PendingOverlay.js";
import { SessionList } from "./SessionList.js";
import { EngineCrashed } from "./EngineCrashed.js";

export function ChatScreen() {
  const overlay = useSlice(selectOverlay);
  const status = useSlice(selectStatus);

  return (
    <box flexDirection="column" width="100%" height="100%">
      <box flexGrow={1} flexShrink={1} minHeight={0} width="100%" overflow="hidden">
        <Transcript />
      </box>
      <box flexShrink={0} flexDirection="column" width="100%">
        {overlay.kind === "pending-confirm" || overlay.kind === "pending-question" ? <PendingOverlay /> : null}
        {overlay.kind === "session-list" ? <SessionList /> : null}
        <StatusBar />
        <InputBar />
        <FooterBar />
        {status.engine === "crashed" ? <EngineCrashed /> : null}
      </box>
    </box>
  );
}
