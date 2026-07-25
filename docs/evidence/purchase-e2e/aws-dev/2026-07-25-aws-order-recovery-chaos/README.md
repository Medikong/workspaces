# AWS Order 복구·카오스 실험

## 단일 Pod recovery drill

`PASS (recovery drill)`

AWS dev에서 Order v1의 PDB가 `minAvailable=1`, `disruptionsAllowed=1`인 것을 확인한 뒤, Kubernetes Eviction API로 v1 Pod 한 개만 교체했다.

| 항목 | 관측값 |
| --- | ---: |
| Eviction API HTTP | 201 |
| 새 Pod `2/2 Running`까지 | 14,576ms |
| 복구 후 PDB | healthy 2, disruptionsAllowed 1 |
| 복구 후 실제 구매 | intent 201, login 200, order 201, payment 201, confirmed true |

초기 두 측정은 일반 resource create 호출 실패와 기존 Pod를 replacement로 잘못 판정한 스크립트 오류가 있어 폐기했다. 위 14,576ms만 기존 두 Pod 이름을 모두 제외한 새 Pod로 측정한 유효값이다. 이 값은 단일 애플리케이션 Pod 복구 관측치이며 시스템 HA나 SLA가 아니다.

## 30초 NetworkChaos

`COMPLETED, LATENCY EFFECT UNMEASURED`

Chaos Mesh controller와 CRD가 Running인 것을 확인했다. GitOps 수동 sync로 ingress Pod 1개에서 Order v1 Pod 1개로 향하는 `500ms ± 50ms`, 30초 NetworkChaos를 실행했고 종료 상태는 `Stop`으로 확인했다.

활성화 후 관측 트래픽은 구매 setup 201/201, Order 조회 46/46 HTTP 200, p95 27ms를 기록했다. 이 p95는 주입 지연을 확인하지 못했으므로 지연 효과가 관측됐다고 주장하지 않는다. 이번 run은 fault lifecycle과 서비스 무오류 상태만 증명하며, 지연 효과는 새 run에서 fault 시작 전 traffic을 준비하고 정확한 source/target path trace를 함께 수집해야 한다.

정확 Pod 이름은 실험 종료 후 GitOps main에서 다시 placeholder로 복구했다. 따라서 이후 Chaos 재실행에는 새 preflight와 수동 sync가 필요하다.

## 2026-07-26 재측정: 지연 효과 확인

이전 관측은 fault 종료 뒤에 시작되어 지연 효과를 측정하지 못했다. 이번에는 관측 트래픽이 Chaos Mesh `Run` 상태를 기다린 뒤 30초 동안 실제 Order 조회를 수행하도록 순서를 고쳤다.

| 항목 | 관측값 |
| --- | ---: |
| Chaos 상태 | `Run` 확인 후 측정, 종료 상태 `Stop` 확인 |
| 주입 지연 | 500ms, jitter 50ms, 30초 |
| Order 요청 | 46건 |
| HTTP 200 | 46 / 46 |
| 기타 HTTP 상태 | 0 |
| 400ms 이상 요청 | 19건 |
| p50 | 22ms |
| p95 | 561ms |

일부 요청이 의도한 지연 대상에 도달해 p95가 약 0.56초로 상승했지만, 오류 없이 응답됐다. p50이 낮은 이유는 트래픽이 지연 대상이 아닌 Order replica로도 분산되기 때문이다. 이 결과는 제한된 단일 방향 네트워크 지연 실험이며 전체 서비스 지연이나 장애 복원력을 일반화하지 않는다.
