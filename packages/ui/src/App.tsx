import { Shell } from './components/layout/Shell';
import { BackendPanel } from './components/panels/BackendPanel';
import { ScreenshotPanel } from './components/panels/ScreenshotPanel';
import { RegisterPanel } from './components/panels/RegisterPanel';
import { MemoryPanel } from './components/panels/MemoryPanel';
import { DebuggerPanel } from './components/panels/DebuggerPanel';

export default function App() {
  return (
    <Shell
      left={
        <>
          <BackendPanel />
          <RegisterPanel />
        </>
      }
      center={
        <>
          <ScreenshotPanel />
          <MemoryPanel />
        </>
      }
      right={
        <>
          <DebuggerPanel />
        </>
      }
    />
  );
}
