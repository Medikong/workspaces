# AWS dev 구매 시나리오 04 실행 결과

## 한 줄 결론

Istio ingress를 통해 로그인부터 주문·결제·이벤트 투영·알림까지 실제로 실행했고,
시나리오 04는 `PASS`했다. 이 결과는 짧은 AWS dev 실험의 증거이며, 장기 SLO나
production readiness를 뜻하지 않는다.

| 항목 | 값 |
| --- | --- |
| 실행 ID | `aws-purchase-20260724T014919Z-c4e07388` |
| 환경 | AWS dev |
| 진입점 | Istio ingressgateway HTTP NodePort 32080 |
| GitOps 최종 revision | `85cba55` |
| fixture | `drop-001` / `product-001` |
| 사용자 | synthetic customer A, 실행 시 Secret에서만 조회 |
| 실행 결과 | `PASS` |

## 확인한 기능 경로

```text
로그인
  → Order 생성
  → 동일 Idempotency-Key 재요청
  → Payment mock 승인
  → 동일 Idempotency-Key 재요청
  → Order CONFIRMED
  → notification.requested 소비
  → Notification 정확히 1건
  → Catalog 재고 투영
```

| 검증 | 실제 결과 |
| --- | --- |
| auth intent | `201` |
| 이메일 로그인 | `200` |
| 주문 생성 / 재요청 | `201` / `201` |
| 결제 승인 / 재요청 | `201` / `201` |
| 주문 상태 | `CONFIRMED` |
| 주문 확정 알림 | 정확히 `1`건 |
| Catalog 재고 | `41 → 40` |

실행 산출물에는 비밀번호, JWT, Authorization 헤더, 이메일, 원본 주문·결제 ID를
저장하지 않았다. 실행 응답의 order/payment 식별자는 단방향 지문으로만 검증했다.

## 실행 중 발견·수정한 실제 장애

첫 실행에서는 Order의 Outbox가 `inventory.changed`와 `notification.requested`를
발행했지만 Catalog 재고와 Notification 검증이 완료되지 않았다.

1. Catalog에는 Kafka bootstrap 환경변수와 Catalog→Kafka egress가 없었다.
2. 이를 추가하자 Kafka broker ingress allowlist가 Catalog를 제외해 Catalog Pod가
   `CrashLoopBackOff`가 됐다.
3. Kafka ingress에 `dropmong-catalog` / `catalog`를 추가한 뒤 Catalog는
   `Synced / Healthy`로 회복했고, 재실행은 PASS했다.
4. Notification은 영속 DB가 없는 process-local 저장소이므로 AWS dev 실험에서
   worker를 `1`로 제한했다. 이는 즉시성 실험을 위한 제한이며, 영속 알림 DB의
   대체가 아니다.

관련 GitHub main 커밋:

- `62d4d68` `fix(aws-dev): enable purchase event projections`
- `85cba55` `fix(data): allow catalog Kafka consumer`

## 관측성 증거 상태

이번 run에서 기능·Kubernetes 상태는 확인했지만 Prometheus p95/5xx, Loki 상관 로그,
Tempo trace, Grafana PNG는 아직 파일로 캡처하지 않았다. 따라서 해당 지표는
`UNMEASURED`이며 발표에서 수치가 있다고 주장하지 않는다.

다음 캡처에서는 실행 ID 시간대를 기준으로 아래 화면을 저장한다.

1. Istio gateway 요청량·5xx·p95
2. Catalog/Order/Payment/Notification CPU·메모리·restart
3. Kafka correlation 로그와 trace
4. Catalog Pod 회복 전후 readiness/restart

Grafana capture의 파일명과 UTC 범위는 [assets manifest](assets/manifest.md)에
추가한다.

## 한계와 다음 실험

- 05 결제 실패·재고 해제·멱등성과 06 병렬 품절은 아직 실행하지 않았다.
- 부하·카오스 실험은 아직 실행하지 않았다.
- Notification PostgreSQL 영속화와 재시작 후 알림 보존은 별도 과제다.
