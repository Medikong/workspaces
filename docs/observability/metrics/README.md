# 지표 정의와 수집 기준

관련 이슈:

- workspace#8: https://github.com/Medikong/workspace/issues/8
- workspace#13: https://github.com/Medikong/workspace/issues/13

## 수집 목적

관측 데이터는 대시보드를 꾸미기 위한 부가 데이터가 아니라, 장애와 이상 징후가 지나간 뒤에도 원인을 좁히기 위한 증거다. MSA에서는 하나의 예약/결제 흐름이 여러 서비스, DB, 메시지 브로커, 외부 결제사를 지나가므로 문제가 항상 같은 형태로 재현된다는 보장이 없다. 따라서 문제가 발생한 시점의 요청 흐름, 도메인 결과, 자원 상태, 배포 상태, 외부 의존성 상태를 나중에 다시 볼 수 있어야 한다.

이 문서의 지표 수집 목적은 다음과 같다.

- 사용자 영향 확인: 요청량, 에러율, 응답시간으로 사용자가 체감한 문제를 먼저 확인한다.
- 도메인 결과 검증: 주문 처리량, 결제 성공률, 중복 주문 0건 같은 비즈니스 성공 기준을 수치로 확인한다.
- 원인 후보 축소: 서비스 내부 에러, 외부 의존성 실패, Pod 재시작, Ready 실패, consumer lag를 함께 보며 원인 범위를 줄인다.
- 재현 불가능한 사건 보존: 같은 장애가 다시 발생하지 않아도 당시의 로그, trace, metric, event를 근거로 분석할 수 있게 한다.
- 비용 통제: 모든 값을 label/index로 올리지 않고, 수집 대상과 인덱싱 대상을 분리해 저장비와 쿼리 비용을 관리한다.
- 실행 환경 확인: 같은 코드라도 특정 Pod, Node, 배포 버전, tenant에서만 문제가 발생할 수 있으므로 애플리케이션 식별자와 실행 환경 식별자를 함께 남긴다.

기준 질문은 "나중에 같은 장애가 재현되지 않아도, 이 데이터만 보고 원인 후보를 줄일 수 있는가?"다. 이 질문에 답하지 못하는 데이터는 줄이고, 이 질문에 필요한 데이터는 반드시 남긴다.

## 핵심 결론

Kubernetes 기반 LGTM(Loki, Grafana, Tempo, Mimir/Prometheus) 관측성에서는 레이어별로 분석 목적과 수집 지표가 달라야 한다. CPU, 메모리, 요청량, 에러율, 응답시간을 같은 수준의 지표로 나열하기보다, "사용자 요청", "비즈니스 흐름", "애플리케이션 런타임", "Pod/Container", "Kubernetes 상태", "Control Plane/관측성 스택"으로 나누어 수집한다.

특히 에러율은 단일 지표로 정의하지 않는다. HTTP 처리 실패율, 비즈니스 실패/거절 비율, 외부 의존성 실패율, 워크로드 상태 실패율, 관측성 수집 실패율은 원인과 대응 절차가 다르다. 같은 "에러율"이라는 이름으로 묶으면 장애 알림과 비즈니스 상태 분석이 섞이므로, 레이어별 에러율을 별도 지표로 둔다.

| 레이어 | 수집 대상 | 대표 지표 |
|---|---|---|
| 서비스 SLI | 사용자 요청 관점 | request rate, HTTP 5xx error rate, p50/p95/p99 latency, active requests |
| 비즈니스 흐름 | 주문/결제/이벤트 처리 | order throughput, payment success rate, business failure/rejection rate, payment latency, queue lag, dead-letter count |
| 애플리케이션 런타임 | 앱 내부 병목 | internal exception rate, dependency error rate, thread/goroutine, GC, connection pool, DB query latency |
| Pod/Container | 워크로드 자원 | CPU usage/throttling, memory working set, restart rate, OOMKilled, network RX/TX |
| Kubernetes 상태 | 배포/스케줄링 상태 | desired/available replicas, pod phase, ready=false rate, HPA replicas, pending pods |
| Control Plane/관측성 스택 | 클러스터와 LGTM 자체 상태 | apiserver latency/error, etcd latency, Prometheus target up, scrape error rate, Loki query latency |

## 레이어별 에러율

에러율은 "무엇이 실패했는가"에 따라 별도로 계산한다. HTTP 5xx와 결제 거절, Pod 재시작, Prometheus scrape 실패는 모두 실패처럼 보이지만 같은 장애 지표가 아니다.

| 레이어 | 에러율 의미 | 지표 예시 | 알림 기준 |
|---|---|---|---|
| API/전송 | HTTP 요청 처리 실패율 | - `http_5xx_error_rate`: 전체 요청 중 HTTP 5xx 비율<br>- `gateway_upstream_error_rate`: Gateway가 upstream 연결에 실패한 비율<br>- `timeout_rate`: 요청이 제한 시간 안에 끝나지 않은 비율 | 장애 알림 대상 |
| 서비스 내부 | 애플리케이션 내부 처리 실패율 | - `service_internal_error_rate`: 내부 예외나 처리 실패 비율<br>- `event_publish_failed_rate`: 이벤트 발행 실패 비율<br>- `db_error_rate`: DB 작업 실패 비율 | 장애 알림 대상 |
| 비즈니스 도메인 | 도메인 결과 실패/거절 비율 | - `payment_failure_rate`: 결제 시도 중 실패 비율<br>- `reservation_rejection_rate`: 예약 요청 중 도메인 규칙으로 거절된 비율<br>- `sold_out_rate`: 매진으로 종료된 요청 비율 | 코드별로 분리 판단 |
| 외부 의존성 | PG, DB, Kafka 같은 의존성 실패율 | - `provider_timeout_rate`: 외부 결제/연동사 timeout 비율<br>- `broker_unavailable_rate`: 메시지 브로커 연결/발행 실패 비율<br>- `db_deadlock_rate`: DB deadlock 또는 lock 충돌 비율 | 장애 알림 대상 |
| Pod/Container | 워크로드 상태 실패율 | - `pod_restart_rate`: Pod/Container 재시작 증가율<br>- `oom_killed_rate`: 메모리 한계로 종료된 비율<br>- `container_not_ready_rate`: `kube_pod_container_status_ready` 기준 not ready 비율 | 지속 발생 시 알림 |
| Kubernetes 상태 | 배포/스케줄링 실패율 | - `ready_false_rate`: Ready 상태가 false인 Pod 비율<br>- `pending_pod_rate`: Pending 상태로 남은 Pod 비율<br>- `available_ratio`: desired replica 대비 available replica 비율 | 지속 발생 시 알림 |
| 관측성 수집 | 수집 파이프라인 실패율 | - `scrape_error_rate`: Prometheus/Alloy scrape 실패 비율<br>- `remote_write_failed_rate`: remote write 전송 실패 비율<br>- `dropped_telemetry_rate`: 유실된 logs/spans/metrics 비율 | 관측성 장애 알림 |

비즈니스 도메인 에러는 `error_code`와 분석 레이블을 분리한다. `SOLD_OUT`, `CARD_DECLINED`, `PROVIDER_TIMEOUT` 같은 값은 고정된 `error_code`이고, `domain`, `category`, `failure_kind`, `expected`, `retryable`, `alert_policy` 같은 레이블은 그 코드를 여러 관점으로 분석하기 위한 차원이다.

| 레이블 | 의미 | 예시 |
|---|---|---|
| `error_code` | 고정된 에러 식별자 | `SOLD_OUT`, `CARD_DECLINED`, `PROVIDER_TIMEOUT` |
| `domain` | 업무 영역 | `reservation`, `payment`, `ticket`, `order` |
| `category` | 문제 유형 | `inventory`, `validation`, `provider_rejection`, `external_dependency` |
| `failure_kind` | 장애성 분류 | `business_rejection`, `internal_error`, `dependency_error` |
| `expected` | 의도된 결과 여부 | `true`, `false` |
| `retryable` | 재시도 의미 여부 | `true`, `false` |

Metric label에는 대시보드와 알림에 실제로 쓰는 값만 넣는다. 에러 코드의 상세 설명, 사용자 메시지, 원본 PG 에러 메시지, 주문/결제 ID는 로그나 에러 코드 레지스트리에 둔다.

## 서비스 SLI

서비스 SLI는 사용자가 직접 체감하는 상태를 보는 지표다. 장애 대응 시 가장 먼저 확인한다.

| 목적 | 지표 예시 | 라벨 기준 |
|---|---|---|
| 요청량 | - `http.server.request.duration`: OpenTelemetry 표준 HTTP server duration histogram<br>- Prometheus export의 `_count`: 전체 요청 수 계산에 사용 | `service.name`, `k8s.namespace.name`, `http.route`, `http.request.method`, `http.response.status_code`, `service.version` |
| HTTP 에러율 | - `http.server.request.duration`의 `_count`: `http.response.status_code`가 5xx인 요청 수 / 전체 요청 수<br>- `error.type`: timeout, exception, 500 같은 에러 유형 분류 | `service.name`, `http.route`, `http.request.method`, `http.response.status_code`, `error.type` |
| 응답시간 | - `http.server.request.duration`: OpenTelemetry 표준 HTTP server duration histogram<br>- Prometheus export의 `_bucket`: p50/p95/p99 계산에 사용 | `service.name`, `http.route`, `http.request.method`, `http.response.status_code` |
| 동시 요청 | - `http.server.active_requests`: 현재 처리 중인 HTTP 요청 수 | `service.name`, `http.route`, `http.request.method` |
| 외부 호출 | - `http.client.request.duration`: OpenTelemetry 표준 HTTP client duration histogram<br>- Prometheus export의 `_count`: 외부 호출 수와 실패율 계산에 사용<br>- `error.type`: timeout, connection refused, 500 같은 외부 호출 에러 유형 분류 | `service.name`, `server.address`, `http.request.method`, `http.response.status_code`, `error.type` |

`route`는 `/orders/{orderId}`처럼 낮은 cardinality의 route template을 사용한다. raw URL path, `request_id`, `trace_id`, `order_id`, `payment_id`, `user_id`, exception full message는 metric label로 넣지 않는다.

## 비즈니스 흐름

주문/결제 서비스는 서비스 헬스와 별도로 비즈니스 SLI를 수집한다. API가 살아 있어도 결제 성공률이나 이벤트 적체가 나빠질 수 있기 때문이다. 비즈니스 실패와 의도된 거절은 HTTP 5xx 에러율에 섞지 않고, `error_code`와 분류 레이블로 따로 본다.

| 목적 | 지표 예시 | 라벨 기준 |
|---|---|---|
| 주문 결과 | - `orders_total`: 주문 처리 결과를 하나의 counter로 기록<br>- `result="created"`: 주문 생성 시도<br>- `result="completed"`: 주문 완료<br>- `result="failed"`: 주문 실패 | `service`, `channel`, `result`, `error_code`, `failure_kind` |
| 중복 주문 감지 | - `duplicate_order_detected_total`: 동일 idempotency key, 주문 키, 결제 키 등으로 중복 주문 후보를 감지한 수<br>- `duplicate_order_committed_total`: 중복 주문이 실제 저장/확정까지 진행된 수, 목표는 0건<br>- `idempotency_conflict_total`: idempotency key 충돌이나 중복 요청 방어가 동작한 수 | `service`, `domain`, `error_code`, `detection_stage`, `idempotency_scope` |
| 결제 결과 | - `payments_total`: 결제 결과를 하나의 counter로 기록<br>- `result="attempted"`: 결제 시도<br>- `result="succeeded"`: 결제 성공<br>- `result="failed"`: 결제 실패<br>- 실패 결과에는 `error_code`, `category`, `failure_kind`, `retryable`을 추가 | `provider`, `method`, `result`, `error_code`, `category`, `failure_kind`, `retryable` |
| 비즈니스 결과 | - `business_outcomes_total`: 도메인 처리 결과를 하나의 counter로 기록<br>- `result="success"`: 정상 완료<br>- `result="failure"`: 장애성 실패<br>- `result="rejection"`: 의도된 도메인 거절 | `domain`, `result`, `error_code`, `category`, `failure_kind`, `expected`, `retryable` |
| 결제 지연 | - `payment_request_duration_seconds_bucket`: 결제 요청 처리 시간 histogram<br>- `payment_provider_duration_seconds_bucket`: PG/외부 결제사 호출 시간 histogram | `provider`, `method`, `result` |
| 결제 재시도 | - `payment_retry_total`: 결제 재시도 횟수<br>- `payment_retry_exhausted_total`: 재시도 한도를 모두 소진한 횟수 | `provider`, `error_code`, `failure_kind` |
| 이벤트 처리량 | - `events_published_total`: 이벤트 발행 수<br>- `events_consumed_total`: 이벤트 소비 수<br>- `events_failed_total`: 이벤트 처리 실패 수 | `topic`, `consumer_group`, `result` |
| 큐 적체 | - `consumer_lag`: consumer group이 따라잡지 못한 메시지 수<br>- `queue_depth`: 큐에 쌓인 메시지 수 | `topic`, `consumer_group` |
| Dead letter | - `dead_letter_messages_total`: DLQ로 이동한 메시지 수<br>- `dead_letter_replay_total`: DLQ 재처리 시도 수 | `topic`, `error_code`, `failure_kind` |

`payments_total`과 `business_outcomes_total`은 `result`로 성공/실패/거절을 먼저 나눈다. 실패나 거절일 때만 `error_code`, `category`, `failure_kind`, `expected`, `retryable` 같은 제한된 label을 추가한다. PG사 원본 에러 메시지나 주문/결제 ID는 metric label이 아니라 로그 필드로 남긴다.

## 애플리케이션 런타임

애플리케이션 런타임 지표는 서비스 SLI가 나빠졌을 때 내부 원인을 좁히는 데 사용한다.

| 목적 | 지표 예시 |
|---|---|
| 런타임 스레드/고루틴 | - `thread_count`: JVM/런타임 thread 수<br>- `goroutine_count`: Go 서비스 goroutine 수 |
| GC 부담 | - `gc_duration_seconds`: GC pause 시간<br>- `gc_count`: GC 발생 횟수<br>- `heap_allocated_bytes`: heap 할당량 |
| DB 연결 상태 | - `db_pool_active_connections`: 사용 중인 DB connection 수<br>- `db_pool_idle_connections`: 대기 중인 DB connection 수<br>- `db_pool_wait_count`: connection을 기다린 횟수 |
| DB 지연 | - `db_query_duration_seconds_bucket`: DB query 처리 시간 histogram<br>- `db_transaction_duration_seconds_bucket`: transaction 처리 시간 histogram |
| 내부 에러율 | - `internal_exception_total`: 내부 예외 발생 수<br>- `service_error_total`: 서비스 error code별 실패 수 |
| 캐시 효율 | - `cache_hit_total`: cache hit 수<br>- `cache_miss_total`: cache miss 수<br>- `cache_hit_rate`: 전체 조회 중 cache hit 비율 |
| 외부 의존성 | - `downstream_request_duration_seconds_bucket`: downstream 호출 지연 histogram<br>- `downstream_error_total`: downstream 호출 실패 수<br>- `downstream_timeout_total`: downstream timeout 수 |

서비스 구현 언어에 따라 지표 이름은 달라질 수 있다. Python/FastAPI는 process, event loop, DB pool 지표를 우선하고, JVM 서비스는 heap/non-heap, GC, thread, connection pool 지표를 추가한다.

## Pod/Container

Pod/Container 지표는 워크로드의 자원 포화, 재시작, OOM 여부를 확인하는 데 사용한다.

| 목적 | 지표 예시 | 확인 기준 |
|---|---|---|
| CPU 사용량 | - `container_cpu_usage_seconds_total`: 컨테이너 CPU 누적 사용 시간 | `rate(...[5m])`로 계산 |
| CPU request/limit | - `kube_pod_container_resource_requests`: 컨테이너 CPU request<br>- `kube_pod_container_resource_limits`: 컨테이너 CPU limit | request/limit 대비 사용률 |
| CPU throttling | - `container_cpu_cfs_throttled_seconds_total`: CPU 제한으로 throttling된 누적 시간<br>- `container_cpu_cfs_periods_total`: CFS period 누적 수 | throttling ratio |
| Memory 사용량 | - `container_memory_working_set_bytes`: 실제 사용 중인 메모리 working set | working set / limit |
| 재시작 | - `kube_pod_container_status_restarts_total`: 컨테이너 재시작 누적 수 | 5분/1시간 증가량 |
| OOMKilled | - `kube_pod_container_status_last_terminated_reason{reason="OOMKilled"}`: 마지막 종료 사유가 OOMKilled인지 표시 | 0 초과 시 확인 |
| Ready 실패 | - `kube_pod_container_status_ready`: 컨테이너 readiness check 성공 여부<br>- `kube_pod_status_ready`: Pod Ready condition 상태 | `condition="false"` 지속 여부 |
| Network | - `container_network_receive_bytes_total`: 수신 바이트 누적량<br>- `container_network_transmit_bytes_total`: 송신 바이트 누적량 | RX/TX rate |

CPU와 메모리는 단순 사용량보다 request/limit 대비 비율을 함께 본다. 사용량이 높아도 request가 충분하면 정상일 수 있고, 사용량이 낮아도 throttling이 심하면 응답시간이 나빠질 수 있다.

## Kubernetes 상태

Kubernetes 상태 지표는 배포, 스케줄링, 오토스케일링이 정상인지 확인하는 데 사용한다.

| 목적 | 지표 예시 |
|---|---|
| Pod phase | - `kube_pod_status_phase`: Pod가 Pending/Running/Succeeded/Failed 중 어디에 있는지 표시 |
| Pod ready | - `kube_pod_status_ready`: Pod Ready condition 상태 |
| Deployment available | - `kube_deployment_status_replicas_available`: 현재 사용 가능한 replica 수 |
| Deployment desired | - `kube_deployment_spec_replicas`: Deployment가 의도한 replica 수 |
| HPA current/desired | - `kube_horizontalpodautoscaler_status_current_replicas`: 현재 replica 수<br>- `kube_horizontalpodautoscaler_status_desired_replicas`: HPA가 계산한 목표 replica 수 |
| Node condition | - `kube_node_status_condition`: Node Ready, MemoryPressure, DiskPressure 같은 상태 |
| Kubernetes Event | - Image pull 실패 이벤트<br>- Scheduling 실패 이벤트<br>- Probe 실패 이벤트<br>- OOM 이벤트 |

서비스 지표가 나빠졌는데 Pod restart, ready=false, desired 대비 available 부족이 같이 보이면 애플리케이션 코드보다 배포/스케줄링 상태를 먼저 확인한다.

## Control Plane/관측성 스택

Control Plane과 관측성 스택 자체 지표는 장애가 애플리케이션 문제가 아니라 클러스터나 수집 파이프라인 문제인지 구분하는 데 사용한다.

| 목적 | 지표 예시 |
|---|---|
| API server 요청량 | - `apiserver_request_total`: Kubernetes API server 요청 수 |
| API server 지연 | - `apiserver_request_duration_seconds_bucket`: API server 요청 처리 시간 histogram |
| API server 에러 | - `apiserver_request_total{code=~"5.."}`: API server 5xx 응답 수 |
| etcd 지연 | - etcd request duration 계열 지표: API server 관점의 etcd 작업 지연 |
| Prometheus scrape 상태 | - `up`: scrape target 정상 여부<br>- scrape duration: target scrape에 걸린 시간<br>- scrape sample count: scrape된 sample 수 |
| Remote write 상태 | - remote write error: 원격 저장소 전송 실패<br>- queue length: remote write 대기열 길이 |
| Loki 상태 | - ingest rate: Loki가 수집하는 log 양<br>- query latency: Loki query 응답 시간<br>- distributor/ingester error: Loki 수집 컴포넌트 오류 |
| Tempo 상태 | - span ingest rate: Tempo가 수집하는 span 양<br>- query latency: trace query 응답 시간<br>- dropped span: 유실된 span 수 |

관측성 스택 자체가 장애이면 대시보드가 비어 있거나 알림이 늦게 올 수 있다. Prometheus/Alloy/Loki/Tempo/Mimir의 self-monitoring 지표도 별도 대시보드에 둔다.

## 요청 추적 ID 용어

분산 추적과 로그 검색에서는 `trace_id`, `request_id`, `span_id`의 범위를 구분한다. 세 값은 모두 요청을 찾는 데 쓰이지만 같은 의미가 아니다.

| 용어 | 의미 | 범위 | 생성/전파 기준 |
|---|---|---|---|
| `trace_id` | 전체 요청 또는 업무 흐름이 시스템을 지나가는 과정을 나타내는 고유 ID | 서비스, DB, 메시지, 외부 호출을 포함한 전체 흐름 | 최초 진입 지점에서 생성하고 downstream 서비스로 전파 |
| `request_id` | Gateway/API 경계로 들어온 개별 요청 ID | Gateway 또는 서비스 inbound HTTP 요청 경계 | Gateway에서 만들거나, 서비스 inbound 요청마다 새로 만들 수 있음 |
| `span_id` | 하나의 trace 안에서 관측하고 싶은 처리 단위 ID | HTTP handler, use case, DB query, 이벤트 발행, 외부 API 호출 같은 작업 단위 | span을 시작할 때마다 새로 생성 |
| `correlation_id` | 예약 생성, 결제 승인, 티켓 발급처럼 비즈니스 이벤트 체인을 묶는 ID | 도메인 흐름 또는 이벤트 체인 | 최초 도메인 이벤트에서 만들고 후속 이벤트에 전파 |

`trace_id`는 전체 과정을 묶는 기술적 추적 ID다. 예를 들어 사용자가 예약 생성 API를 호출하고, 예약 서비스가 DB를 쓰고, 결제 서비스가 호출되고, 티켓 발급 이벤트가 이어지면 이 전체 흐름은 하나의 `trace_id`로 연결된다.

`request_id`는 서비스 Gateway 또는 API 경계의 요청 ID로 본다. 하나의 외부 요청 전체에서 같은 `request_id`를 유지할 수도 있지만, Medikong에서는 서비스 경계별 요청 로그를 구분하기 위해 Gateway/API 경계의 inbound 요청 ID로 사용하는 쪽이 자연스럽다. 전체 서비스 흐름 검색은 `request_id`보다 `trace_id`를 기준으로 한다.

`span_id`는 함수 하나일 수도 있고, 여러 함수를 묶은 큰 처리 흐름일 수도 있다. 더 정확히는 "관측하고 싶은 작업 단위"다. HTTP handler, `createReservation()` use case, DB query, Kafka publish, PG사 호출은 모두 span이 될 수 있다.

`correlation_id`는 이벤트소싱 관점에서 하나의 command에서 시작된 업무 흐름을 묶는 ID로 볼 수 있다. `command_id`는 하나의 명령, `event_id`는 실제 발생한 개별 이벤트, `aggregate_id`는 상태가 바뀌는 대상이고, `correlation_id`는 그 이벤트들이 같은 업무 흐름에 속한다는 연결고리다.

통합 예시:

```text
trace_id = T-123
request_id = R-GW-001
command_id = CMD-1
correlation_id = CMD-1  # CreateReservation 명령에서 시작된 예약-결제-티켓 흐름

1. Gateway가 /reservations 요청을 받음
   span_id = S-1
   request_id = R-GW-001
   trace_id = T-123

2. reservation-service가 CreateReservation command 처리
   span_id = S-2
   command_id = CMD-1
   correlation_id = CMD-1
   aggregate_id = reservation-123

3. reservation-service가 좌석 확인 후 예약 생성
   span_id = S-3
   event_id = EVT-1
   event_type = ReservationCreated
   aggregate_id = reservation-123
   correlation_id = CMD-1

4. payment-service가 ReservationCreated 이벤트를 소비하고 결제 승인 처리
   span_id = S-4
   event_id = EVT-2
   event_type = PaymentApproved
   aggregate_id = payment-456
   correlation_id = CMD-1

5. ticket-service가 PaymentApproved 이벤트를 소비하고 티켓 발급
   span_id = S-5
   event_id = EVT-3
   event_type = TicketIssued
   aggregate_id = ticket-789
   correlation_id = CMD-1
```

이 예시에서 `trace_id`는 기술적으로 전체 호출 흐름을 묶고, `span_id`는 각 서비스의 처리 단위를 나타낸다. `correlation_id`는 예약 생성 command에서 시작된 도메인 흐름을 묶고, 각 `event_id`는 실제 발생한 개별 이벤트를 구분한다.

로그에는 최소한 `trace_id`, `span_id`, `request_id`, `service.name`을 함께 남긴다. 비즈니스 이벤트 로그에는 `correlation_id`, `command_id`, `event_id`, `aggregate_id`도 함께 남겨 예약, 결제, 티켓 발급 같은 도메인 흐름을 추적한다.

## 로그와 요청 추적 필드

Kibana와 Loki/Grafana 모두 request-level 추적을 위해 구조화 로그 필드가 필요하다.

| 필드 | 목적 |
|---|---|
| `service.name` | 서비스 필터 |
| `service.version` | 배포 버전 비교 |
| `service.environment` | prod/stage 구분 |
| `kubernetes.namespace` | namespace 필터 |
| `kubernetes.pod.name` | pod 필터 |
| `kubernetes.node.name` | 특정 Node 쏠림 확인 |
| `cloud.region` 또는 `cloud.availability_zone` | 특정 Region/Zone 쏠림 확인 |
| `tenant_id` | 특정 tenant 영향 범위 확인 |
| `request_id` 또는 `request.id` | 단일 요청 검색 |
| `trace_id` 또는 `trace.id` | trace 연결 |
| `span_id` 또는 `span.id` | span 연결 |
| `correlation_id` | 비즈니스 이벤트 체인 연결 |
| `http.method` | 요청 방식 |
| `http.route` | 낮은 cardinality route |
| `http.status_code` | 에러 필터 |
| `duration_ms` | 로그 기반 지연 분석 |
| `error.type` | 에러 분류 |

장애 분석에는 애플리케이션 식별자뿐 아니라 실행 환경 식별자가 필요하다. 특정 tenant, Pod, Node, Zone, 배포 버전에서만 문제가 발생할 수 있기 때문이다. 로그와 trace에는 이 context를 함께 남기고, 대시보드에서는 필요한 범위에서만 집계 차원으로 사용한다.

Kibana를 사용할 경우 ECS 기준의 `trace.id`, `transaction.id`, `span.id`를 로그에 포함한다. Grafana LGTM을 사용할 경우 Loki 로그에서 `trace_id`를 추출해 Tempo trace로 이동할 수 있도록 derived field를 구성한다.

`request_id`, `trace_id`, `order_id`, `payment_id`, `user_id`는 검색 필드로는 필요하지만 metric label이나 Loki label로 만들지 않는다. 요청마다 값이 바뀌는 고카디널리티 값이므로 저장 비용과 쿼리 성능에 영향을 준다.

## Grafana 대시보드 기준

| 영역 | 패널 | 기준 |
|---|---|---|
| 서비스 상태 | Request Rate by service | `sum by (service.name)(rate(http_server_request_duration_count[5m]))` 또는 backend의 OTel export 이름 기준 |
| 서비스 상태 | 5xx Error Rate by service | warn 1%, critical 5% |
| 서비스 상태 | Internal Error Rate by service | `failure_kind="internal_error"` 기준 |
| 서비스 상태 | Dependency Error Rate by service | `failure_kind="dependency_error"` 기준 |
| 서비스 상태 | p95 Latency by service | 서비스 SLO 기준 |
| 비즈니스 | 주문 처리량 | `orders_total{result="completed"}` 기준, 평시 대비 급락 감지 |
| 비즈니스 | 중복 주문 감지 | `duplicate_order_committed_total`은 0 유지, `duplicate_order_detected_total`은 원인 확인 |
| 비즈니스 | 결제 성공률 | `payments_total{result="succeeded"}` / `payments_total{result="attempted"}` 기준, warn 98% 미만, critical 95% 미만 |
| 비즈니스 | Business Rejection Rate | `expected="true"`는 장애 알림 제외 |
| 비즈니스 | Business Failure Rate | `expected="false"` 또는 장애성 `error_code` 중심 |
| 비즈니스 | 결제 p95 latency | PG/SLO 기준 |
| 비즈니스 | Consumer lag/DLQ | 10분 이상 지속 시 경고 |
| 자원/배포 | CPU request 대비 사용률 | warn 80%, critical 95% |
| 자원/배포 | Memory limit 대비 사용률 | warn 80%, critical 90% |
| 자원/배포 | Pod restart/OOMKilled | 0 초과 시 확인 |
| 자원/배포 | Deployment available ratio | 100% 미만 지속 시 경고 |

## 수집 기준

| 항목 | 기준 |
|---|---|
| Scrape interval | 앱 HTTP/비즈니스 지표 15s-30s, 인프라 지표 30s-60s |
| PromQL rate window | 기본 5m, scrape interval보다 충분히 길게 설정 |
| Histogram | 평균 대신 p95/p99를 계산할 수 있게 bucket 구성 |
| Label 정책 | OTel 표준은 `service.name`, `k8s.namespace.name`, `http.route`, `http.request.method`, `http.response.status_code`, `service.version` 중심 |
| 에러율 정책 | HTTP 5xx, 내부 에러, 비즈니스 실패/거절, 의존성 실패, 워크로드 실패, 수집 실패를 분리 |
| 에러 코드 정책 | `error_code`는 고정 목록으로 관리하고 `domain`, `category`, `failure_kind`, `expected`, `retryable`로 분류 |
| Metric/Loki label 금지 | `request_id`, `trace_id`, `span_id`, `correlation_id`, `order_id`, `payment_id`, `user_id`, raw path는 수집 대상이지만 metric label 또는 Loki label/indexing 대상은 아님 |
| 로그 형식 | JSON structured log, trace/request/service/k8s 필드 포함 |
| Alert | 순간 spike보다 5분 이상 지속 조건 우선 |
| Self-monitoring | Prometheus/Alloy/Loki/Tempo/Mimir 자체 지표 수집 |

## 출처

- Google SRE, Monitoring Distributed Systems: https://sre.google/sre-book/monitoring-distributed-systems/
- Grafana Labs, The RED Method: https://grafana.com/blog/the-red-method-how-to-instrument-your-services/
- Grafana Labs, Monitoring Kubernetes layers: https://grafana.com/blog/monitoring-kubernetes-layers-key-metrics-to-know/
- Grafana Labs, Kubernetes application monitoring: https://grafana.com/blog/a-beginners-guide-to-kubernetes-application-monitoring/
- Grafana Kubernetes Monitoring Helm chart: https://grafana.com/docs/grafana-cloud/monitor-infrastructure/kubernetes-monitoring/configuration/helm-chart-config/helm-chart/
- Grafana Alloy Kubernetes logs: https://grafana.com/docs/alloy/latest/monitor/monitor-kubernetes-logs/
- AWS Containers Blog, Monitoring Amazon EKS on Fargate using Prometheus and Grafana: https://aws.amazon.com/blogs/containers/monitoring-amazon-eks-on-aws-fargate-using-prometheus-and-grafana/
- AWS Containers Blog, Troubleshooting Amazon EKS API servers with Prometheus: https://aws.amazon.com/blogs/containers/troubleshooting-amazon-eks-api-servers-with-prometheus/
- AWS Cloud Operations Blog, OpenTelemetry observability solution: https://aws.amazon.com/blogs/mt/build-an-observability-solution-using-managed-aws-services-and-the-opentelemetry-standard/
- OpenTelemetry HTTP semantic conventions: https://opentelemetry.io/docs/specs/semconv/http/http-metrics/
- kube-state-metrics pod metrics: https://github.com/kubernetes/kube-state-metrics/blob/main/docs/metrics/workload/pod-metrics.md
- Grafana Loki label best practices: https://grafana.com/docs/loki/latest/get-started/labels/bp-labels/
- Grafana Tempo trace-to-logs: https://grafana.com/docs/grafana/latest/datasources/tempo/configure-tempo-data-source/configure-trace-to-logs/
- Elastic APM log correlation: https://www.elastic.co/docs/reference/apm/agents/go/log-correlation
- Elastic ECS tracing fields: https://www.elastic.co/guide/en/ecs/current/ecs-tracing.html
- LINE Engineering, Monitoring Prometheus metrics from Armeria: https://engineering.linecorp.com/en/blog/monitoring-prometheus-metrics-from-armeria
- LINE Engineering, Performance test in Jenkins with Kubernetes and Grafana: https://engineering.linecorp.com/en/blog/performance-test-in-jenkins-run-dynamic-pod-executors-in-kubernetes-parallelly/
- Toss Tech, Gateway monitoring: https://toss.tech/article/22910
- Toss Tech, MSA observability: https://toss.tech/article/MSA-observability
- NAVER D2, 검색 SRE VictoriaMetrics 운영기: https://d2.naver.com/helloworld/6867189
- NAVER D2, 대규모 메트릭 저장소 운영기: https://d2.naver.com/helloworld/6475419
- Cloudflare Blog, Monitoring our monitoring: https://blog.cloudflare.com/monitoring-our-monitoring/
