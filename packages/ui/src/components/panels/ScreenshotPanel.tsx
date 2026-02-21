import { useScreenshot } from '../../hooks/useScreenshot';
import { Panel } from '../layout/Panel';

export function ScreenshotPanel() {
  const { imageUrl, loading, error, capture, autoRefresh, setAutoRefresh } = useScreenshot();

  const toolbar = (
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-1 text-xs text-text-secondary cursor-pointer">
        <input
          type="checkbox"
          checked={autoRefresh}
          onChange={(e) => setAutoRefresh(e.target.checked)}
          className="accent-accent-blue"
        />
        Auto
      </label>
      <button
        onClick={capture}
        disabled={loading}
        className="px-2 py-0.5 text-xs bg-bg-tertiary border border-border-default rounded hover:border-accent-blue disabled:opacity-50"
      >
        {loading ? '...' : 'Capture'}
      </button>
    </div>
  );

  return (
    <Panel title="Screenshot" toolbar={toolbar}>
      {error && <div className="text-accent-red text-xs mb-2">{error}</div>}
      {imageUrl ? (
        <div className="flex items-center justify-center h-full">
          <img
            src={imageUrl}
            alt="DOS screenshot"
            className="max-w-full max-h-full"
            style={{ imageRendering: 'pixelated' }}
          />
        </div>
      ) : (
        <div className="flex items-center justify-center h-full text-text-muted text-xs">
          No screenshot captured
        </div>
      )}
    </Panel>
  );
}
