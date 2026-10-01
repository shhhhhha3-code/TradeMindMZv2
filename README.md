# TradeMindMZ · Football AI Dashboard

A React/Vite football intelligence dashboard with a responsive dark interface, live match data, AI predictions, odds/value signals, model evaluation and an autonomous learning pipeline.

## Included
- Dark cinematic responsive dashboard
- Live football fixtures and results
- AI confidence, 1X2 probabilities, odds and value
- Match Intelligence detail view
- AI Intelligence Center with feature impact and model weights
- AI reasoning stream
- Country / league / competition filters
- Mobile-friendly match cards and navigation
- Supabase Edge Function backend
- Football data ingestion and result settlement
- API-Football odds integration
- Feature extraction, prediction evaluation and model retraining
- Automated GitHub Actions build, deployment and pipeline checks

## Architecture

Frontend: React + Vite  
Backend: Supabase Edge Functions  
Database: Supabase Postgres  
Football data: Football Soccer API  
Odds: API-Football  
ML pipeline: feature engineering + multiclass model + evaluation/retraining

## Development

```bash
npm install
npm run dev
```

## Production checks

```bash
npm run build
```

The production build is validated in GitHub Actions. The Football AI Edge Function is type-checked, deployed and health-tested automatically when backend changes reach `main`.

## APK preparation

The web dashboard is responsive and is being validated on mobile before packaging the production frontend as an Android APK.
