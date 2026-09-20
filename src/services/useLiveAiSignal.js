import {
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";

import {
  fetchLiveAiSignal,
  fetchLatestAiSignal
} from "./liveAiSignalService.js";

const DEFAULT_REFRESH_INTERVAL = 60 * 1000;

export function useLiveAiSignal(
  options = {}
) {
  const {
    refreshInterval = DEFAULT_REFRESH_INTERVAL
  } = options;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const mountedRef = useRef(false);
  const requestRunningRef = useRef(false);

  const loadLatest = useCallback(
    async ({ allowInitialScan = true } = {}) => {
      if (!mountedRef.current || requestRunningRef.current) {
        return null;
      }

      requestRunningRef.current = true;

      try {
        const latest = await fetchLatestAiSignal({
          ...options
        });

        if (!mountedRef.current) {
          return latest;
        }

        if (latest) {
          setData(latest);
          setError(null);
          setLoading(false);
          return latest;
        }

        if (allowInitialScan) {
          const initial = await fetchLiveAiSignal({
            ...options,
            force: false
          });

          if (mountedRef.current) {
            setData(initial);
            setError(null);
            setLoading(false);
          }

          return initial;
        }

        setLoading(false);
        return null;
      } catch (err) {
        if (!mountedRef.current) {
          return null;
        }

        console.error(
          "Latest server AI snapshot load failed:",
          err
        );

        const message =
          err instanceof Error
            ? err.message
            : "Unable to load latest server AI snapshot.";

        setError(message);

        /*
         * Do not clear a previous successful snapshot.
         * Temporary network/API failures must not make the
         * dashboard look empty.
         */
        setLoading(false);

        return null;
      } finally {
        requestRunningRef.current = false;
      }
    },
    [
      options.scanLimit,
      options.maxMarkets,
      options.preferredProvider,
      options.interval
    ]
  );

  const refresh = useCallback(
    async (force = false) => {
      if (!mountedRef.current || requestRunningRef.current) {
        return null;
      }

      requestRunningRef.current = true;
      setRefreshing(true);
      setError(null);

      try {
        if (!force) {
          const latest = await fetchLatestAiSignal({
            ...options
          });

          if (latest) {
            if (mountedRef.current) {
              setData(latest);
              setLoading(false);
            }
            return latest;
          }
        }

        const result = await fetchLiveAiSignal({
          ...options,
          force
        });

        if (mountedRef.current) {
          setData(result);
          setLoading(false);
          setError(null);
        }

        return result;
      } catch (err) {
        if (!mountedRef.current) {
          return null;
        }

        console.error(
          "Live AI refresh failed:",
          err
        );

        const message =
          err instanceof Error
            ? err.message
            : "Unable to load live AI signal.";

        setError(message);
        setLoading(false);

        /*
         * Keep the previous successful market data visible.
         */
        return null;
      } finally {
        requestRunningRef.current = false;

        if (mountedRef.current) {
          setRefreshing(false);
        }
      }
    },
    [
      options.scanLimit,
      options.maxMarkets,
      options.preferredProvider,
      options.interval
    ]
  );

  useEffect(() => {
    mountedRef.current = true;

    console.log(
      "🚀 TradeMindMZ server AI viewer started"
    );

    /*
     * Load the last persisted server result immediately.
     * Only if there is no snapshot yet do we allow one
     * initial live scan.
     */
    loadLatest({
      allowInitialScan: true
    });

    /*
     * The server is the scheduler. While the app is open,
     * we only poll the persisted snapshot. We do NOT trigger
     * a Pionex scan every minute.
     */
    const timer = setInterval(
      () => {
        loadLatest({
          allowInitialScan: false
        });
      },
      Math.max(
        30000,
        Number(refreshInterval) ||
          DEFAULT_REFRESH_INTERVAL
      )
    );

    return () => {
      mountedRef.current = false;
      clearInterval(timer);

      console.log(
        "🛑 TradeMindMZ server AI viewer stopped"
      );
    };
  }, [
    loadLatest,
    refreshInterval
  ]);

  return {
    data,
    loading,
    refreshing,
    error,
    refresh
  };
}
