# TradeMindMZ monitoring

This directory contains the live runtime health check for the app backend.

The GitHub Actions workflow `.github/workflows/trademind-runtime-monitor.yml` runs every 10 minutes and checks:

- Supabase Edge API diagnostics
- Pionex configuration and fresh market snapshot
- persisted Market AI snapshot freshness
- at least 5 Engine TOP 5 candidates
- persisted `/api/ai/latest` availability

A failed check makes the workflow red, which gives us a concrete signal that the live trading-data pipeline needs attention.

This monitors the **server/data pipeline**, not whether an Android APK is currently open. The Android app is intentionally a viewer of the persisted server state.
