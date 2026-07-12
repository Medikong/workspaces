# Capacity Baseline Cost Model

이 문서는 capacity-baseline 결과의 `서비스별 RPS`, `CPU usage`, `CPU request 후보`를 인스턴스 비용으로 환산하기 위한 산정표다.

트러블 문서는 원인과 해결을 기록하고, 비용 판단은 이 문서에 모은다. 나중에 다른 서비스도 같은 형식으로 row를 추가한다.

## 기준

| 항목 | 값 |
| --- | --- |
| 기준일 | 2026-06-21 |
| 리전 | `us-east-1` |
| 과금 | Linux On-Demand |
| 가격 출처 | AWS EC2 On-Demand Pricing, AWS Price List Bulk API |
| capacity evidence | [local-baseline-1000m server/worker split](../reports/local-baseline-1000m-server-worker-2026-06-21/README.md), [local-write-services-expand-1000m](../reports/local-write-services-expand-1000m-2026-06-21/README.md) |
| 계산 범위 | EC2 instance-hour만 포함 |

가격 기준:

| instance | vCPU | memory | price |
| --- | ---: | ---: | ---: |
| `t4g.medium` | 2 | 4 GiB | `$0.0336/h` |
| `t4g.large` | 2 | 8 GiB | `$0.0672/h` |
| `t4g.xlarge` | 4 | 16 GiB | `$0.1344/h` |

이 값은 AWS Price List Bulk API의 `AmazonEC2/current/us-east-1` 파일에서 Linux, Shared tenancy, On-Demand, `RunInstances` 조건으로 조회했다.

## 계산식

| 항목 | 계산 |
| --- | --- |
| CPU request 후보 | `측정 CPU usage / HPA target utilization` |
| 100만 요청당 비용 | `instance hourly price / (RPS * 3600) * 1,000,000` |
| `$1h`당 처리량 | `RPS / instance hourly price` |
| 월 비용 | `instance hourly price * 730` |

주의:

- 이 문서는 비용 방향을 비교하기 위한 산정표다. 실제 청구액 예측에는 EBS, NAT, LB, data transfer, taxes, Savings Plans, Spot, support 비용을 별도로 더한다.
- Kubernetes에서는 kube/system reserved, DaemonSet, sidecar, multi-AZ 분산 때문에 인스턴스 vCPU 전체를 Pod request로 꽉 채울 수 없다.
- `t4g`는 burstable instance다. CPU credit 정책과 sustained load 조건은 실제 운영 sizing에서 별도로 확인한다.

## 서비스별 산정표

### auth-service

근거:

| step | target RPS | p95 | p99 | error rate | CPU avg | CPU request 후보 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `auth_rps_30` | 30 | 53.2ms | 64.0ms | 0% | 747.8m | 1069m |
| `auth_rps_40` | 40 | 52.8ms | 64.1ms | 0% | 1476.4m | 2110m |

비용 비교:

| 대응 방식 | 처리량 가정 | CPU slot | instance 기준 | 시간당 비용 | 100만 요청당 비용 | `$1h`당 처리량 | 판단 |
| --- | ---: | ---: | --- | ---: | ---: | ---: | --- |
| scale-out | 30 RPS Pod 2개 = 60 RPS | `1000m x 2` | `t4g.medium` 1대의 CPU slot | `$0.0336` | `$0.1556` | 1785.7 RPS | 권장 |
| scale-up | 40 RPS Pod 1개 | `2000m x 1` | `t4g.medium` 1대의 CPU slot | `$0.0336` | `$0.2333` | 1190.5 RPS | 비용 효율 낮음 |
| strict 후보 | 40 RPS Pod 1개 | `2110m` 후보 | `t4g.xlarge` auth-only 기준 | `$0.1344` | `$0.9333` | 297.6 RPS | 단독 배치 기준 비효율 |

판단:

`auth-service`는 40 RPS도 SLO는 통과하지만 CPU request 후보가 `2110m`까지 올라간다. 단일 Pod를 40 RPS 기준으로 키우기보다 `1000m`, Pod당 30 RPS를 유지하고 Pod 수를 늘리는 편이 비용 효율이 좋다.

`2000m` scale-up과 비교하면 `1000m` Pod 2개 scale-out은 같은 2 vCPU slot에서 처리량이 50% 높고, 100만 요청당 비용은 약 33% 낮다.

운영 기준:

| 항목 | 권장값 |
| --- | --- |
| Pod당 목표 처리량 | 30 RPS |
| CPU request | `1000m` |
| 40 RPS 이상 대응 | replica 증가 |
| scale-up 사용 | 임시 완충 또는 낮은 replica 수가 더 중요한 환경에서만 검토 |

### reservation/payment/ticket expansion

근거: [local-write-services-expand-1000m](../reports/local-write-services-expand-1000m-2026-06-21/README.md). 각 서비스 첫 stage는 warmup으로 보고 후보 산정에서 제외했다.

측정값:

| service | step | target RPS | p95 | p99 | error rate | CPU avg | CPU request 후보 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| reservation-service | `reservation_rps_240` | 240 | 63.7ms | 108.9ms | 0.00% | 1384.6m | 1978m |
| payment-service | `payment_rps_240` | 240 | 96.6ms | 498.0ms | 0.00% | 1137.4m | 1625m |
| ticket-service | `ticket_rps_100` | 100 | 60.0ms | 128.5ms | 0.00% | 1005.8m | 1437m |

비용 비교:

| service | 처리량 가정 | CPU slot | instance 기준 | 시간당 비용 | 100만 요청당 비용 | `$1h`당 처리량 | 판단 |
| --- | ---: | ---: | --- | ---: | ---: | ---: | --- |
| reservation-service | 240 RPS Pod 1개 | `1978m` 후보 | `t4g.medium` 1대의 CPU slot | `$0.0336` | `$0.0389` | 7142.9 RPS | 240 RPS 목표면 2 vCPU급 request 필요 |
| payment-service | 240 RPS Pod 1개 | `1625m` 후보 | `t4g.medium` 1대의 CPU slot | `$0.0336` | `$0.0389` | 7142.9 RPS | 320 RPS는 한계 구간, 240 RPS 기준 후보 |
| ticket-service | 100 RPS Pod 1개 | `1437m` 후보 | `t4g.medium` 1대의 CPU slot | `$0.0336` | `$0.0933` | 2976.2 RPS | 120 RPS는 `/tickets/me` p95 gate 초과 |

판단:

reservation/payment/ticket 모두 확장 탐색 기준 후보가 `1000m`보다 크다. `1000m`를 운영 기본값으로 유지하려면 이번 최대 유효 RPS를 그대로 Pod당 목표로 쓰기보다 replica 증가 기준을 별도로 잡아야 한다. 단일 Pod 처리량을 우선하면 reservation-service는 240 RPS, payment-service는 240 RPS, ticket-service는 100 RPS 기준으로 request 후보를 둔다.

## 추가 규칙

서비스를 추가할 때는 아래 값을 같이 넣는다.

| 필드 | 설명 |
| --- | --- |
| evidence report | 근거가 되는 capacity-baseline report |
| step | 기준으로 삼은 capacity step |
| target RPS | Pod 1개 기준 RPS |
| p95/p99/error rate | SLO 통과 여부 |
| CPU avg | 해당 step의 평균 CPU 사용량 |
| CPU request 후보 | target utilization 적용 후 request 후보 |
| instance 기준 | 비교에 쓴 instance family와 단가 |
| 판단 | scale-up, scale-out, current request 유지 중 하나 |

## 출처

- [AWS EC2 On-Demand Pricing](https://aws.amazon.com/ec2/pricing/on-demand/)
- [AWS Price List Bulk API 문서](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/finding-prices-in-service-price-list-files.html)
- AWS Price List Bulk API: `https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/current/us-east-1/index.json`
