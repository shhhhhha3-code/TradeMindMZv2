# TradeMindMZ Football Intelligence v3

Ny arkitektur for TradeMindMZ:
- Europa-only match universe
- Fast pre-score av alle relevante kamper
- TOPP 6 deep AI analysis
- AI Resultat og resultatevaluering
- Egen learning/performance layer
- AI News som separat informasjonslag
- Settings med av/på for Football API, Odds API, Groq, OpenAI og News Engine
- Samme Supabase/API-infrastruktur kan kobles til via environment variables

## Neste byggefasene
1. Koble Supabase og eksisterende tabeller/API-er
2. Flytte pre-score/top-6 engine server-side
3. Koble Groq/OpenAI med provider toggles
4. Koble odds og team-logo cache
5. Bygge news retrieval med kilder
6. Resultatevaluering og egen learning/retraining
7. E2E + Android build
