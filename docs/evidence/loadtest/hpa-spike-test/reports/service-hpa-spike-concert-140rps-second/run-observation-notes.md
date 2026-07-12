# Run Observation Notes

## Command

```bash
SCENARIO=service-hpa-spike-load-test PRESET=concert-140rps task --dir gitops dev:loadtest
```

The task redeployed local services with `LOCAL_DOCKER_DESKTOP_ENV=local-hpa-spike` before starting the load test.

## Live observations

- Initial deployment env: `SERVICE_ENVIRONMENT=local-hpa-spike`, `SQLALCHEMY_POOL_SIZE=15`, `SQLALCHEMY_MAX_OVERFLOW=0`, `UVICORN_WORKERS=2`.
- HPA watch observed `concert-service` moving from `1` replica to `2`, then `3`, then `4`.
- HPA samples included CPU above target: `81%/70%`, `104%/70%`, and later `89%/70%`.
- k6 progress reached the later concert lanes with `0 interrupted iterations` in the live terminal output.
- The last visible failure pattern was repeated `capacity_baseline.concert.seat_map failed with status 0`.
- The job later failed with `DeadlineExceeded`; the report archive directory existed but remained empty.

## Interpretation boundary

The normal k6 `handleSummary` JSON files were not produced for this run. The final analysis therefore uses:

- Kubernetes job status and events.
- HPA and pod snapshots.
- concert-service and concert-db logs.
- live terminal observations captured during the run.
- the saved Grafana RPS screenshot.

