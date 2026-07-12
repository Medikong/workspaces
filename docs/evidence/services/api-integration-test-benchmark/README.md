# API 통합 벤치마크

서비스별 API 통합 벤치마크 evidence를 모은다.

이 영역의 benchmark는 동시접속 부하테스트가 아니다. 공통 YAML preset으로 만든 대량 데이터가 DB에 누적된 상태에서, API 1회 처리 비용을 smoke와 large로 나누어 확인한다.

## Preset

- [half-year-early-growth](./half-year-early-growth/README.md)

## 실행 기준

- smoke: `task --dir service benchmark-api-smoke-service SERVICE=<service> PRESET=smoke`
- large: `task --dir service benchmark-api-large-service SERVICE=<service> PRESET=half-year-early-growth`
- report: `task --dir service benchmark-api-report SERVICE=all`
