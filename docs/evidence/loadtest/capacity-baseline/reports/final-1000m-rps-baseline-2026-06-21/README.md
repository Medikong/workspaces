# 1000m RPS Baseline Final Analysis

## Source

| 항목 | 값 |
| --- | --- |
| 기준일 | 2026-06-21 |
| CPU request 기준 | `1000m` |
| CPU target utilization | `70%` |
| 목표 CPU avg | `700m` |
| all-service evidence | [local-baseline-1000m-server-worker-2026-06-21](../local-baseline-1000m-server-worker-2026-06-21/README.md) |
| write-service expansion evidence | [local-write-services-expand-1000m-2026-06-21](../local-write-services-expand-1000m-2026-06-21/README.md) |
| dataset_revision | `capacity-baseline-half-year-early-growth-v2` |
| 공통 조건 | single replica, HPA off, CPU limit 없음 |

## Method

`1000m` request를 유지할 때의 Pod당 RPS 기준치는 CPU avg가 `700m` 근처가 되는 지점을 기준으로 잡았다.

```text
목표 CPU avg = 1000m * 0.70 = 700m
추정 RPS = 앞 step RPS + (700m - 앞 step CPU) / (뒤 step CPU - 앞 step CPU) * step 간격
```

보고서의 최종 기준치는 아래 원칙으로 정했다.

| 원칙 | 적용 |
| --- | --- |
| 선형 보간 | 700m 지점이 측정 step 사이에 있으면 보간값을 계산 |
| 보수 반올림 | 운영 기준은 계산값보다 약간 낮게 둠 |
| 측정 범위 우선 | 700m 지점이 측정 범위 밖이면 측정된 최대 유효 RPS를 우선 사용 |
| 특수 endpoint | auth-service는 기존 `1000m @ 30 RPS` 확정값 유지 |
| warmup 제외 | write-service 확장 실험의 첫 stage는 후보 산정에서 제외 |

## Final Baseline

| 서비스 | 최종 기준치 | 계산상 700m 지점 | 증거 기준 | 판단 |
| --- | ---: | ---: | --- | --- |
| auth-service | 30 RPS | 약 28 RPS | `auth_rps_30` | 로그인은 별도 확정 기준 유지 |
| concert-service | 140 RPS | 약 146 RPS | `concert_rps_120` -> `concert_rps_160` | 160 RPS도 SLO는 통과하지만 70% CPU 기준으로는 140 RPS가 더 적합 |
| reservation-service | 140 RPS | 약 146 RPS | `reservation_rps_120` -> `reservation_rps_160` | 240 RPS까지 통과했지만 1000m 운영 기준은 140 RPS |
| payment-service | 150 RPS | 약 151 RPS | `payment_rps_120` -> `payment_rps_160` | 240 RPS까지 통과, 320 RPS 실패. 1000m 기준은 150 RPS |
| ticket-service | 75 RPS | 약 78 RPS | `ticket_rps_60` -> `ticket_rps_80` | 100 RPS까지 통과하지만 70% CPU 기준은 75 RPS |
| notification-service | 320 RPS | 약 372 RPS | `notification_rps_320` | 320 RPS가 측정 최대 유효 구간이고 CPU avg도 700m 안쪽 |

## Service Analysis

### auth-service

최종 기준치는 `1000m @ 30 RPS`다.

| step | target RPS | p95 | p99 | error rate | CPU avg | 후보 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `auth_rps_10` | 10 | 63.1ms | 70.3ms | 0.00% | 279.1m | 399m |
| `auth_rps_30` | 30 | 53.2ms | 64.0ms | 0.00% | 747.8m | 1069m |
| `auth_rps_40` | 40 | 52.8ms | 64.1ms | 0.00% | 1476.4m | 2110m |

계산상 700m 지점은 약 28 RPS지만, auth-service는 로그인 password verify 비용이 포함된 특수 endpoint다. 기존 warmup-backed 기준과 이미 확정한 운영 판단을 유지해 `30 RPS`를 최종 기준으로 둔다. 40 RPS는 SLO는 통과했지만 CPU 후보가 `2110m`라 `1000m` 기준으로는 채택하지 않는다.

### concert-service

최종 기준치는 `1000m @ 140 RPS`다.

| step | target RPS | 대표 p95 | CPU avg | 후보 | 판정 |
| --- | ---: | ---: | ---: | ---: | --- |
| `concert_rps_120` | 120 | detail 16.2ms / seat-map 18.6ms | 552.4m | 790m | 1000m 기준 여유 있음 |
| `concert_rps_160` | 160 | detail 21.8ms / seat-map 39.1ms | 779.0m | 1113m | SLO 통과, 70% CPU 기준 초과 |

160 RPS는 모든 concert API가 SLO를 통과했다. 다만 `1000m` request에서 70% CPU 기준을 맞추려면 120과 160 사이를 보간한 약 146 RPS가 기준점이다. 운영 기준은 보수적으로 `140 RPS`로 둔다.

### reservation-service

최종 기준치는 `1000m @ 140 RPS`다.

| step | target RPS | p95 | p99 | error rate | CPU avg | 후보 | 판정 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `reservation_rps_80` | 80 | 13.4ms | 40.1ms | 0.00% | 182.9m | 262m | warmup 제외 |
| `reservation_rps_120` | 120 | 20.9ms | 40.0ms | 0.00% | 536.3m | 767m | valid |
| `reservation_rps_160` | 160 | 37.3ms | 110.4ms | 0.00% | 791.8m | 1132m | valid |
| `reservation_rps_240` | 240 | 63.7ms | 108.9ms | 0.00% | 1384.6m | 1978m | 상한 탐색 통과 |

상한 탐색에서는 240 RPS까지 통과했다. 그러나 1000m 기준 목표 CPU는 700m이므로 120과 160 사이 보간값인 약 146 RPS를 기준으로 본다. 운영 기준은 `140 RPS`다.

### payment-service

최종 기준치는 `1000m @ 150 RPS`다.

| step | target RPS | p95 | p99 | error rate | CPU avg | 후보 | 판정 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `payment_rps_40` | 40 | 8.2ms | 18.3ms | 0.00% | 60.2m | 87m | warmup 제외 |
| `payment_rps_120` | 120 | 16.3ms | 34.5ms | 0.00% | 444.4m | 635m | valid |
| `payment_rps_160` | 160 | 34.1ms | 101.8ms | 0.00% | 774.3m | 1107m | valid |
| `payment_rps_240` | 240 | 96.6ms | 498.0ms | 0.00% | 1137.4m | 1625m | 상한 탐색 통과 |
| `payment_rps_320` | 320 | 4120.9ms | 10000.8ms | 12.89% | 1611.4m | 2303m | 실패 시작 |

120과 160 사이 보간값은 약 151 RPS다. 따라서 `1000m` 기준 운영값은 `150 RPS`로 둔다. 240 RPS는 SLO p95를 통과했지만 CPU 후보가 `1625m`이고 p99가 커서 1000m 기준으로는 채택하지 않는다.

### ticket-service

최종 기준치는 `1000m @ 75 RPS`다.

| step | target RPS | issue p95 | list p95 | error rate | CPU avg | 후보 | 판정 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `ticket_rps_40` | 40 | 23.7ms | 20.8ms | 0.00% | 199.5m | 285m | warmup 제외 |
| `ticket_rps_60` | 60 | 21.2ms | 20.3ms | 0.00% | 488.6m | 699m | valid |
| `ticket_rps_80` | 80 | 42.4ms | 40.5ms | 0.00% | 721.2m | 1031m | valid |
| `ticket_rps_100` | 100 | 55.3ms | 60.0ms | 0.00% | 1005.8m | 1437m | 상한 탐색 통과 |
| `ticket_rps_120` | 120 | 103.4ms | 117.8ms | 0.00% | 1337.2m | 1911m | list p95 실패 |

60과 80 사이 보간값은 약 78 RPS다. 운영 기준은 보수적으로 `75 RPS`로 둔다. 100 RPS는 API SLO는 통과했지만 CPU avg가 이미 `1000m`를 넘으므로 `1000m` 기준값으로 보지 않는다.

### notification-service

최종 기준치는 `1000m @ 320 RPS`다.

| step | target RPS | p95 | p99 | error rate | CPU avg | 후보 | 판정 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `notification_rps_160` | 160 | 6.5ms | 25.3ms | 0.00% | 219.1m | 314m | valid |
| `notification_rps_240` | 240 | 19.2ms | 51.3ms | 0.00% | 417.4m | 597m | valid |
| `notification_rps_320` | 320 | 34.2ms | 57.6ms | 0.00% | 588.7m | 842m | valid |

240과 320 사이를 기준으로 700m 지점을 외삽하면 약 372 RPS다. 하지만 320 RPS를 넘는 구간은 아직 측정하지 않았으므로 최종 기준치는 증거가 있는 최대 유효 구간인 `320 RPS`로 둔다. 이 값은 CPU 후보도 `842m`라 `1000m` 기준 안에 있다.

## Final Decision

| 서비스 | 1000m 기준 Pod당 RPS | scale-out 기준 |
| --- | ---: | --- |
| auth-service | 30 | 30 RPS 초과 시 replica 증가 우선 |
| concert-service | 140 | 140 RPS 초과 시 replica 증가 또는 160 RPS 기준 CPU 상향 검토 |
| reservation-service | 140 | 140 RPS 초과 시 replica 증가, 240 RPS 단일 Pod는 2 vCPU급 후보 |
| payment-service | 150 | 150 RPS 초과 시 replica 증가, 240 RPS 단일 Pod는 1625m 후보 |
| ticket-service | 75 | 75 RPS 초과 시 replica 증가, 120 RPS 이상은 `/tickets/me` 개선 필요 |
| notification-service | 320 | 320 RPS 초과 기준은 추가 `360 -> 400` 탐색 후 확정 |

## Notes

- 이 보고서는 CPU request 기준치를 정하기 위한 capacity-baseline 분석이다. 사용자-facing SLO나 전체 예매 여정 TPS 기준은 별도 문서에서 다룬다.
- `auth/concert/notification`은 [local-baseline-1000m-server-worker-2026-06-21](../local-baseline-1000m-server-worker-2026-06-21/README.md)을 기준으로 봤다.
- `reservation/payment/ticket`은 [local-write-services-expand-1000m-2026-06-21](../local-write-services-expand-1000m-2026-06-21/README.md)을 기준으로 봤고, 첫 stage는 warmup으로 제외했다.
- notification-service는 700m 지점이 측정 범위 밖이므로, 외삽값 372 RPS 대신 측정된 320 RPS를 최종 기준으로 채택했다.
