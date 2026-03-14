import { Shell } from "./components/layout/Shell"
import { BackendPanel } from "./components/panels/BackendPanel"
import { DisplayPanel } from "./components/panels/DisplayPanel"
import { RegisterPanel } from "./components/panels/RegisterPanel"
import { MemoryPanel } from "./components/panels/MemoryPanel"
import { DebuggerPanel } from "./components/panels/DebuggerPanel"
import { SnapshotPanel } from "./components/panels/SnapshotPanel"
import { KeyboardPanel } from "./components/panels/KeyboardPanel"

export default function App() {
  return (
    <Shell
      left={
        <>
          <BackendPanel />
          <RegisterPanel />
          <SnapshotPanel />
        </>
      }
      center={
        <>
          <DisplayPanel />
          <MemoryPanel />
        </>
      }
      right={
        <>
          <DebuggerPanel />
          <KeyboardPanel />
        </>
      }
    />
  )
}
