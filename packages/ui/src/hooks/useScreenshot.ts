import { useCallback, useEffect, useRef, useState } from 'react';
import { getScreenshot } from '../lib/api';
import { parsePPM, imageDataToBlobUrl } from '../lib/ppm';

interface UseScreenshotResult {
  imageUrl: string | null;
  loading: boolean;
  error: string | null;
  capture: () => void;
  autoRefresh: boolean;
  setAutoRefresh: (on: boolean) => void;
}

const AUTO_REFRESH_INTERVAL = 1000;

export function useScreenshot(): UseScreenshotResult {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const prevUrlRef = useRef<string | null>(null);

  const capture = useCallback(() => {
    setLoading(true);
    getScreenshot()
      .then(async ({ blob, contentType }) => {
        // Revoke previous URL
        if (prevUrlRef.current) {
          URL.revokeObjectURL(prevUrlRef.current);
          prevUrlRef.current = null;
        }

        let url: string;
        if (contentType === 'image/x-portable-pixmap') {
          const buf = await blob.arrayBuffer();
          const imageData = parsePPM(buf);
          url = imageDataToBlobUrl(imageData);
        } else {
          url = URL.createObjectURL(blob);
          prevUrlRef.current = url;
        }

        setImageUrl(url);
        setError(null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Auto-refresh interval
  useEffect(() => {
    if (!autoRefresh) return;
    capture();
    const id = setInterval(capture, AUTO_REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [autoRefresh, capture]);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
    };
  }, []);

  return { imageUrl, loading, error, capture, autoRefresh, setAutoRefresh };
}
