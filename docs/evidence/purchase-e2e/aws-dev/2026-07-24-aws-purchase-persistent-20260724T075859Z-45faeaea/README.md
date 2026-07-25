# AWS dev Scenario 04 실행 결과

## 판정

- 기능: `PASS`
- 관측성 3축 상관: `OBSERVABILITY_BLOCKED`
- 실행 ID: `aws-purchase-persistent-20260724T075859Z-45faeaea`
- 실행 구간: 2026-07-24 07:58:59Z ~ 07:59:03Z
- 대상: AWS dev, Istio ingress 경유

## 확인한 사용자 흐름

1. 이메일 로그인 intent와 로그인
2. 전용 상품 1개 주문 생성
3. 같은 idempotency key로 주문 재요청
4. Mock 결제 승인과 결제 조회
5. 주문 `CONFIRMED` 전환
6. `ORDER_CONFIRMED` 알림을 두 번 조회해도 정확히 1건
7. Catalog 재고 `42 -> 41`

모든 HTTP 단계는 성공했다. intent는 201, 로그인·주문·결제·알림·Catalog의
최종 검증은 각각 200 또는 201이었다. 주문과 결제의 원문 ID, JWT, 이메일, 비밀번호는
저장하지 않았다.

## 배포 및 상태 근거

- GitOps 복구 revision: `f1bf9d9`
- Order 이미지: `v0.1.6`
- Order primary Pod: 2/2 Ready, 각 restart count 0
- Order DB: 전용 상품 주문 1건, `CONFIRMED`, 결제 연결 있음
- 재고 DB: `total=42`, `reserved=0`, `sold=1`, `version=2`
- Payment DB: 실행 직후 amount 50000의 `APPROVED` 1건

이 실행 전에 발견한 결제 409의 원인은 Order AWS overlay의 `container.env` 목록이
base 목록을 교체해 `DATABASE_URL`과 `KAFKA_BOOTSTRAP_SERVERS`가 사라진 것이었다.
`f1bf9d9`에서 두 값을 fixture 설정과 함께 다시 명시한 뒤 재실행했다.

## 관측성 판정과 한계

Prometheus와 Kubernetes 상태는 수집했다. 07:59Z를 포함하는 3분 창에서 대상 서비스의
Istio 5xx 증가량은 0이고 p95는 Order 10 ms, Payment 19.75 ms였다. 이 창에는
헬스체크 및 다른 배경 요청도 있으므로 요청 총량은 Scenario 04 단독 처리량으로 해석하지 않는다.

Loki에서 실행 ID로 검색한 결과는 0건이었다. 이번 실행은 trace ID를 보존하지 않았으므로
Tempo 상관 조회도 수행하지 못했다. 따라서 기능 결과는 PASS지만, 로그·트레이스까지 연결한
발표용 3축 증거 판정은 `OBSERVABILITY_BLOCKED`다.

## Grafana 발표 화면

시간 범위를 `2026-07-24 07:58:45Z ~ 08:02:00Z`로 맞춘다.

- Gateway/Mesh: `http://127.0.0.1:13000/d/dropmong-ops-03-gateway-mesh`
- Saturation: `http://127.0.0.1:13000/d/dropmong-load-30-saturation`
- Kubernetes: `http://127.0.0.1:13000/d/dropmong-ops-10-kubernetes`

자동 화면 캡처 파일은 만들지 않았다. 화면에 로그인 정보나 요청 헤더가 보이지 않는지 확인한 뒤
캡처하면 `assets/manifest.md`에 파일명·시간 범위를 추가한다.

## 연결 자료

- [발표용 정량 결과표](quantitative-summary.md)
- [수치 요약](summary.csv)
- [Prometheus 원문](raw/prometheus/scenario-04-window-20260724T080200Z.json)
- [Loki 상관 조회](raw/loki/scenario-04-run-id-20260724T080130Z.json)
- [Kubernetes 및 DB read-back](raw/kubernetes/scenario-04-state-20260724T080000Z.json)
