import {
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";

import {
  fetchLiveAiSignal
} from "./liveAiSignalService.js";

const DEFAULT_REFRESH_INTERVAL =
  60000;

export function useLiveAiSignal(
  options = {}
) {
  const {
    refreshInterval =
      DEFAULT_REFRESH_INTERVAL
  } = options;

  const [
    data,
    setData
  ] = useState(null);

  const [
    loading,
    setLoading
  ] = useState(true);

  const [
    refreshing,
    setRefreshing
  ] = useState(false);

  const [
    error,
    setError
  ] = useState(null);

  const mountedRef =
    useRef(false);

  const requestRunningRef =
    useRef(false);

  const refresh = useCallback(
    async () => {

      if (
        !mountedRef.current
      ) {
        return;
      }

      if (
        requestRunningRef.current
      ) {
        console.log(
          "Live AI refresh skipped: request already running."
        );

        return;
      }

      requestRunningRef.current =
        true;

      setRefreshing(true);

      setError(null);

      try {

        const result =
          await fetchLiveAiSignal(
            options
          );

        if (
          !mountedRef.current
        ) {
          return;
        }

        setData(
          result
        );

      } catch (err) {

        if (
          !mountedRef.current
        ) {
          return;
        }

        console.error(
          "Live AI signal refresh failed:",
          err
        );

        setError(
          err instanceof Error
            ? err.message
            : "Unable to load live AI signal."
        );

      } finally {

        requestRunningRef.current =
          false;

        if (
          mountedRef.current
        ) {

          setLoading(false);

          setRefreshing(false);
        }
      }

    },
    [
      options.scanLimit,
      options.maxMarkets,
      options.preferredProvider
    ]
  );

  useEffect(
    () => {

      mountedRef.current =
        true;

      console.log(
        "🚀 Live AI Signals started"
      );

      console.log(
        "Refresh interval:",
        refreshInterval,
        "ms"
      );

      /*
       * Initial scan immediately.
       */
      refresh();

      /*
       * Automatic refresh.
       *
       * This refreshes the Pionex market,
       * recalculates TOP 5 and asks Groq
       * to compare the current candidates.
       */
      const timer =
        setInterval(
          () => {

            console.log(
              "🔄 Automatic Live AI refresh"
            );

            refresh();

          },
          Math.max(
            30000,
            Number(
              refreshInterval
            ) || DEFAULT_REFRESH_INTERVAL
          )
        );

      return () => {

        mountedRef.current =
          false;

        clearInterval(
          timer
        );

        console.log(
          "🛑 Live AI Signals stopped"
        );
      };

    },
    [
      refresh,
      refreshInterval
    ]
  );

  return {
    data,

    loading,

    refreshing,

    error,

    refresh
  };
}
