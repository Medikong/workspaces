# 공연 
[공연 예매가 좋은 이유]
1. 순간 트래픽 폭발
→ HPA 한계 테스트
→ Redis 클러스터 내구성
→ 메시지 큐 백프레셔

2. 실시간 좌석 동기화
→ WebSocket 연결 관리
→ 네트워크 레이턴시 튜닝


[서비스 구성]
공연 예매 플랫폼
├── user-service          # 회원가입, 로그인, JWT 발급
├── performance-service   # 공연 등록, 정보 관리 (제목/날짜/장소/출연진)
├── venue-service         # 공연장, 구역, 좌석 배치도 관리
├── booking-service       # 예매 생성·조회·취소 (핵심)
├── seat-service          # 좌석 선택, 선점(임시 점유), 해제
├── payment-service       # 결제 요청·승인·환불 (PG 연동)
├── ticket-service        # 티켓 발급, QR 코드 생성
├── notification-service  # 예매 완료·취소 알림 (이메일/SMS)
└── api-gateway           # 라우팅, 인증




# SaaS
[SaaS가 좋은 이유]
1. 멀티테넌시
→ 네임스페이스 분리 (K8s)
→ DB 연결 풀 관리
→ 테넌트별 리소스 쿼터

2. 구독 결제 자동화
→ Celery Worker 안정적 운영
→ 실패 재시도 큐 모니터링

3. 장기 운영
→ 서비스별 HPA (오토스케일링)
→ 비용 모니터링

[서비스 구성]
├── auth-service          # 로그인, OAuth, JWT
├── organization-service  # 조직(팀) 생성, 멤버 초대
├── workspace-service     # 조직별 작업 공간 (멀티테넌시 핵심)
├── plan-service          # 요금제 관리 (Free/Pro/Enterprise)
├── subscription-service  # 구독 생성·갱신·해지
├── billing-service       # 청구서, 인보이스, 결제 실패 재시도
├── payment-service       # PG 연동 (카드 등록, 자동결제)
├── notification-service  # 결제 실패·갱신 알림
└── api-gateway


--------------------------------------------------

# 검증 시나리오
공통 시나리오 (도메인 무관)

1 — 정상 배포 검증
코드 Push
→ GitHub Actions 빌드 + 이미지 Push
→ Helm values 이미지 태그 업데이트
→ ArgoCD 자동 감지 → K8s 배포
→ kubectl get pods Running 확인
→ Kong Gateway API 호출 200 응답
측정: 배포 완료 소요 시간공통 

2 — 장애 복구 검증
핵심 서비스 Pod 강제 종료
→ kubectl delete pod xxx
→ ReplicaSet 자동 재시작 확인
→ Kafka 메시지 유실 없음 확인
→ Grafana 알림 발생 확인
측정: MTTR (평균 복구 시간)공통 

3 — GitOps 롤백 검증
broken 이미지 의도적 배포
→ ArgoCD에서 이전 revision 롤백
→ 서비스 정상 복구 확인
측정: 롤백 소요 시간공통 

4 — DevSecOps 검증
시크릿 관리
→ DB 비밀번호 평문 yaml 없음 확인
→ Sealed Secrets or AWS Secrets Manager 적용
네트워크 격리
→ 허용된 서비스 간 통신만 가능 확인
→ NetworkPolicy 기준 검증
이미지 취약점 스캔
→ GitHub Actions Trivy 스캔
→ Critical 취약점 0건 확인공통 

5 — 모니터링 시각화 검증
Prometheus 메트릭 수집 확인
→ Grafana 대시보드 정상 표시
→ 주요 지표: CPU, Memory, 응답시간, 에러율
→ 임계값 초과 시 알림 발생 확인

6 - 트래픽 폭발 대응
k6 or Locust로 seat-service 동시 1000 요청
→ HPA Pod 자동 증가 확인
→ Grafana CPU/Memory 급증 → 스케일아웃 시각화
→ 트래픽 감소 후 Pod 자동 축소 확인

# 문서

착수·설계 (팀 공통)
├── 프로젝트 계획서
├── 아키텍처 설계서
└── ADR

구축 (담당)
├── Terraform 실행 가이드       ← 필수
├── K8s 클러스터 구성 가이드    ← 필수
├── ArgoCD 설치 가이드          ← 필수
├── Helm 차트 가이드            ← 필수
├── Sealed Secrets 적용 가이드  ← DevSec
└── NetworkPolicy 설정 가이드   ← DevSec

검증 (담당)
├── 부하 테스트 결과서          ← 발표 임팩트
└── 보안 스캔 결과서            ← 발표 임팩트

운영
├── 장애 대응 매뉴얼
└── 롤백 매뉴얼