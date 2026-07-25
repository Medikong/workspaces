# AWS Istio 구매 실험 발표용 사실 요약

> 이 문서는 PPT·발표 대본 생성 AI가 먼저 읽을 요약본이다. 모든 수치는 연결된 원본 evidence를 우선 근거로 하며, 여기에 없는 성능·SLO·가용성 주장을 만들지 않는다.

## 1. 발표 목표

Medikong의 외부 진입 경로를 Kong에서 Istio ingress gateway 기반으로 전환하고, AWS dev에서 구매 핵심 흐름이 정상 기능·부하·Pod 복구·네트워크 지연 상황에서도 동작하는지 검증했다.

발표의 핵심 질문은 다음과 같다.

1. Istio ingress와 Auth `ext_authz` 구조가 Kong의 외부 진입·인증 역할을 대체하는가?
2. 정상 구매, 결제 실패·재고 해제, 동시 품절의 업무 불변식이 유지되는가?
3. 부하와 제한된 장애에서 오류·비동기 적체·Pod 복구 상태를 관측할 수 있는가?

## 2. Kong에서 Istio ingress로 전환한 근거

Kong은 API 진입·라우팅에는 적합하지만, Kubernetes 환경에서 서비스 간 트래픽 정책, Envoy telemetry, 카나리·장애 실험을 별도 계층으로 연결해야 한다. Istio ingress는 외부 진입점과 mesh 관측을 통합하고, `VirtualService`·`DestinationRule`·PDB·Chaos Mesh와 같은 Kubernetes 운영 요소를 같은 구조에서 검증할 수 있다.

인증 책임은 Gateway plugin에 두지 않고 Auth-service의 내부 session-status endpoint로 이동했다. Istio는 `ext_authz`를 호출하고 Auth-service가 반환한 신뢰 헤더만 upstream에 전달한다. 이 전환은 Gateway가 인증 정책의 소유자가 되는 구조를 피하고, Auth-service 계약을 정책의 단일 근거로 둔다.

## 3. 전환 후 검증 경로

```text
Client
  → Istio ingress gateway
  → Auth ext_authz
  → Order service
  → Kafka outbox / order.created
  → Payment service
  → Order confirmation / notification
```

## 4. 기능 시나리오 결과

| 시나리오 | 검증한 업무 규칙 | 실제 결과 | 근거 |
| --- | --- | --- | --- |
| 04 정상 구매 | 주문·결제·확정·알림과 재고 투영 | PASS | [04 evidence](../evidence/purchase-e2e/aws-dev/2026-07-24-aws-purchase-persistent-20260724T075859Z-45faeaea/) |
| 05 결제 실패 | `card_declined` 뒤 `PAYMENT_FAILED`, 재고 정확한 해제, 멱등성 | PASS. 재고 41 → 41로 복귀 | [05 evidence](../evidence/purchase-e2e/aws-dev/2026-07-24-aws-payment-failure-20260724T081729Z-45faeaea/) |
| 06 동시 품절 | 재고 42에서 5개 worker가 각 10개 동시 요청해 oversell 방지 | PASS. 주문 201 네 건, business conflict 409 한 건, 예약 40 | [06 evidence](../evidence/purchase-e2e/aws-dev/2026-07-24-aws-sold-out-20260724T083820Z-45faeaea/) |

05와 06의 409는 시스템 5xx가 아니라 각각 의도한 업무 결과다.

## 5. 부하 실험 결과

| 단계 | 도착률 | 여정 수 | 주문·결제·확정 성공 | 전체 여정 p50 | 전체 여정 p95 | 핵심 async 결과 |
| --- | ---: | ---: | --- | ---: | ---: | --- |
| L1 | 6/min | 30 | 30 / 30 | 2,199ms | 2,257ms | Kafka lag 0, outbox pending 0 |
| L2-A | 12/min | 60 | 60 / 60 | 2,203ms | 2,253ms | Kafka lag 0, outbox pending 0 |
| L2-B | 24/min | 120 | 120 / 120 | 2,196ms | 2,224ms | Kafka lag 0, outbox pending 0 |

L2-B에서 Order v1/v2와 Payment Pod는 모두 Ready 상태였고 restart는 0이었다. 이 결과는 AWS dev의 짧은 제한 실험 결과이며 production 최대 처리량이나 30일 SLO 달성을 뜻하지 않는다.

- [L1 evidence](../evidence/purchase-e2e/aws-dev/2026-07-25-aws-l1-purchase-20260725T150734Z/)
- [L2-A evidence](../evidence/purchase-e2e/aws-dev/2026-07-25-aws-l2a-purchase-20260725T151613Z/)
- [L2-B evidence](../evidence/purchase-e2e/aws-dev/2026-07-25-aws-l2b-purchase-20260725T152325Z/)

## 6. Pod 복구 실험

Order v1 Pod 한 개를 Kubernetes Eviction API로 교체했다.

- PDB: `minAvailable=1`, `disruptionsAllowed=1`
- Eviction API: HTTP 201
- 새 Pod가 `2/2 Ready`가 될 때까지: **14,576ms**
- 복구 후 실제 구매: intent 201 → login 200 → order 201 → payment 201 → confirmed

이는 Order 애플리케이션 Pod 한 개의 복구시간이다. DB·Kafka·node까지 동시에 장애 난 전체 시스템 RTO 또는 SLA로 일반화하지 않는다.

## 7. Chaos Mesh 네트워크 지연 실험

Istio ingress Pod 한 개에서 Order v1 Pod 한 개로 향하는 경로에 30초간 `500ms ± 50ms` 지연을 주입했다. 관측 트래픽은 Chaos Mesh 상태가 `Run`이 된 뒤 시작했고 종료 상태 `Stop`도 확인했다.

| 관측 | 결과 |
| --- | ---: |
| Order 조회 | 46건 |
| HTTP 200 | 46 / 46 |
| 기타 HTTP 상태 | 0 |
| 400ms 이상 요청 | 19건 |
| p50 | 22ms |
| p95 | 561ms |

일부 요청만 선택된 Order v1 Pod에 도달하므로 p50은 낮고 p95만 상승했다. 이 실험은 지연이 발생한 조건에서 오류 없이 응답됐음을 보여 주며, 모든 mesh 경로나 전체 장애 복원력을 증명하지 않는다.

- [Pod recovery·Chaos evidence](../evidence/purchase-e2e/aws-dev/2026-07-25-aws-order-recovery-chaos/)

## 8. 발표 자료에 넣을 Grafana 이미지

이미지는 아직 자동 저장되지 않았다. 아래 시간 범위로 Grafana에서 캡처해 `docs/presentation/assets/`에 저장한다. 시간은 KST다.

| 파일명 제안 | 대시보드 | 시간 범위 | 슬라이드 메시지 |
| --- | --- | --- | --- |
| `04-happy-gateway.png` | Gateway / Mesh | 2026-07-24 16:58:45 ~ 17:02:00 | 정상 구매의 요청·p95·5xx |
| `05-payment-failure-gateway.png` | Gateway / Mesh | 2026-07-24 17:17:00 ~ 17:20:00 | 업무 실패와 시스템 5xx의 구분 |
| `06-sold-out-gateway.png` | Gateway / Mesh | 2026-07-24 17:38:00 ~ 17:41:00 | 동시 요청과 예상된 business conflict |
| `06-sold-out-saturation.png` | Load / Saturation | 2026-07-24 17:38:00 ~ 17:41:00 | 동시 요청 중 자원·restart |
| `l2b-gateway.png` | Gateway / Mesh | 2026-07-26 00:23:15 ~ 00:28:35 | 최고 부하에서 p95·5xx |
| `l2b-saturation.png` | Load / Saturation | 2026-07-26 00:23:15 ~ 00:28:35 | 최고 부하의 CPU·메모리·Pod 상태 |
| `pod-recovery-kubernetes.png` | Kubernetes | Pod eviction 전후 | PDB와 replica·Ready 복구 |
| `chaos-gateway.png` | Gateway / Mesh | 2026-07-26 00:59:30 ~ 01:00:15 | p95 561ms, 5xx 0 |

## 9. PPT 생성 AI에 전달할 지시문

```text
docs/presentation/aws-istio-purchase-experiment-brief.md를 가장 먼저 읽고,
그 안의 링크로 연결된 원본 evidence만 사실 근거로 사용해 주세요.

10분 발표용 PPT를 9장으로 구성해 주세요.
각 슬라이드마다 제목, 한 문장 핵심 메시지, 사용할 이미지 파일명,
본문 3~5개 bullet, 40~60초 발표 대본을 작성해 주세요.

필수 순서는 다음입니다.
1. 프로젝트 목표
2. Kong에서 Istio ingress로 전환한 근거
3. 전환 후 구조와 Auth ext_authz 흐름
4. 04·05·06 기능 검증
5. L1/L2 부하 설계
6. 부하 결과
7. Pod recovery 결과
8. Chaos Mesh 지연 결과
9. 결론과 한계

문서에 없는 숫자를 만들지 말고, AWS dev의 짧은 실험 결과를
production SLO·최대 처리량·전체 HA 보장으로 과장하지 마세요.
```
