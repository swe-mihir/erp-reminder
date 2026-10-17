// Load .env for local script runs (Node 21.7+). In CI the variables come from secrets.
try {
  process.loadEnvFile(".env");
} catch {
  /* no .env file: fine */
}
