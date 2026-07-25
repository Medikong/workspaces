# 발표 자산 manifest

## 현재 확보된 증거

- 실제 AWS dev Istio ingress 시나리오 04 PASS
- Argo CD를 통한 Catalog Kafka consumer 및 broker ingress 정책 반영
- 기능 status와 재고 변화는 `README.md`와 `summary.csv`에 redacted 형태로 기록

## 아직 캡처하지 않은 관측 자산

| 자산 | 발표에서 보여 줄 값 | 상태 |
| --- | --- | --- |
| gateway mesh dashboard | 요청량, 5xx, p95 | `UNMEASURED` |
| saturation dashboard | CPU, 메모리, restart | `UNMEASURED` |
| Kafka correlation dashboard | consumer 로그, trace 연결 | `UNMEASURED` |
| Kubernetes dashboard | Catalog CrashLoopBackOff→Ready 회복 | `UNMEASURED` |

캡처 시 비밀번호, JWT, Authorization 헤더, 이메일, 원본 주문·결제 ID가 화면에 보이면
저장하지 않고 다시 마스킹한다.
