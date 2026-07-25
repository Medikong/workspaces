# AWS 구매 HA 실험: 용량 기준선

## 판정

`PASS (capacity baseline)`

이 기준선은 AWS dev에서 Order·Payment·Notification의 실험용 복제본과 PDB를 적용하기 **전** 수집했다. 이 결과는 이후 장애 실험이 안전하다는 보조 근거이며, 부하·복구·카오스 결과나 production SLO를 의미하지 않는다.

| 항목 | 관측값 | 판정 |
| --- | ---: | --- |
| Kubernetes node Ready | 8 / 8 | PASS |
| worker-app-1 memory request | 3,016Mi / 약 3,726Mi | 관측 |
| worker-app-2 memory request | 2,568Mi / 약 3,726Mi | 관측 |
| worker-app-3 memory request | 2,128Mi / 약 3,726Mi | 관측 |
| Order DB connections | 11 / 300 | PASS |
| Payment DB connections | 19 / 300 | PASS |
| Kafka lag: catalog inventory projection | 0 | PASS |
| Kafka lag: payment refund requested | 0 | PASS |
| Kafka lag: payment order created | 0 | PASS |
| Kafka lag: order payment events | `NO_ROWS` | UNMEASURED |
| Kafka lag: notification requested | `NO_ROWS` | UNMEASURED |

`NO_ROWS`는 해당 consumer group에 현재 partition assignment 행이 없었다는 Kafka CLI 결과다. 이를 lag 0으로 추정하지 않는다. 이후 부하·장애 구간에서도 같은 명령으로 다시 확인한다.

## 수집 시각과 방법

- UTC window: `2026-07-25T13:01:33Z` node/service snapshot, `2026-07-25T13:22:00Z` DB/Kafka baseline.
- 경로: AWS SSM → control-plane → Kubernetes API → DB/Kafka Pod.
- DB: 각 PostgreSQL Pod에서 container-local 인증 정보를 출력하지 않고 `max_connections`와 `pg_stat_activity` 총 연결 수만 조회했다.
- Kafka: `kafka-consumer-groups.sh --describe`를 group별로 병렬, 읽기 전용 실행했다.
- 비밀값, JWT, cookie, Authorization header, 이메일, 주문 payload는 문서와 명령 출력에 저장하지 않았다.

## 다음 진입 조건

1. GitOps로 Order·Payment·Notification만 실험 기간에 2 replica와 PDB `minAvailable: 1`로 적용한다.
2. 세 서비스가 모두 2/2 Ready, endpoint 2개, PDB `disruptionsAllowed=1`이 된 것을 확인한다.
3. 기능 기준군 → L1/L2 부하 → 단일 Pod eviction → 30초 Order NetworkChaos 순으로 실행한다.
4. 어느 단계에서든 Pending, OOM, 예상 밖 5xx, DB 연결 급증, lag 증가, cleanup 실패가 있으면 다음 단계로 넘어가지 않고 rollback한다.

## 한계

- 이 문서는 부하 전 단일 시점 기준선이다. L1/L2·복구·카오스 중의 DB headroom과 Kafka lag는 별도 run-ID 증거로 다시 기록해야 한다.
- `NO_ROWS` group은 async activity가 발생한 구간에서 재수집하기 전까지 정상 lag를 주장하지 않는다.
