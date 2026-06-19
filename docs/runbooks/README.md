# Runbooks

이 폴더는 Medikong 운영, 배포, 관측성, 장애 대응 절차를 실행 순서 중심으로 정리한다.

아키텍처 문서는 "무엇을 왜 하는가"를 설명하고, 런북은 "지금 어떤 순서로 확인하고 조치하는가"를 다룬다. 같은 주제라도 기준과 설계는 `docs/architecture`, 실제 확인 절차는 이 폴더에 둔다.

## 파일 구성

| 경로 | 용도 |
| --- | --- |
| `README.md` | 런북 인덱스와 작성 기준 |
| `observability/` | metric, log, trace, dashboard 확인 절차 |
| `deployment/` | 배포, rollback, release 확인 절차 |
| `incident/` | 장애 대응과 복구 절차 |

## 런북 인덱스

| 영역 | 제목 | 파일 |
| --- | --- | --- |
| observability | 로컬 메트릭 수집 확인 | [observability/local-metrics-verification.md](observability/local-metrics-verification.md) |
| observability | 로컬 Grafana 대시보드 피드백 | [observability/local-dashboard-feedback.md](observability/local-dashboard-feedback.md) |
| observability | AWS Grafana SSH 터널 접속 | [observability/aws-grafana-tunnel.md](observability/aws-grafana-tunnel.md) |
| observability | synthetic traffic 검증 | [observability/synthetic-traffic-verification.md](observability/synthetic-traffic-verification.md) |
| deployment | 태그 기반 이미지 배포 | [deployment/tag-based-image-deploy.md](deployment/tag-based-image-deploy.md) |
| deployment | ECR kubelet credential provider 도입 | [deployment/ecr-kubelet-credential-provider.md](deployment/ecr-kubelet-credential-provider.md) |

## 작성 기준

- 런북은 실제 실행 순서대로 작성한다.
- 명령은 repo 위치와 namespace를 함께 적는다.
- 정상 확인 기준과 실패했을 때 볼 항목을 함께 적는다.
- 장기 설계 설명은 최소화하고, 상세 설계 문서 링크로 연결한다.
- 사고 기록은 `docs/trouble`에 남기고, 재사용 가능한 절차만 런북으로 승격한다.
