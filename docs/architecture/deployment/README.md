# 태그 기반 이미지 배포 설계

이 문서는 Medikong 서비스 이미지 build/push 실행 기준을 `main` push에서 배포용 Git tag push로 바꾼 구현 기준 설계다.

현재 대상은 개발 환경이다. 배포 의도가 명확한 tag가 push됐을 때만 `service` repo의 image-publish workflow가 이미지를 publish하고, `gitops` repo의 `values/services/*.yaml` image tag를 갱신한다.

실행 명령은 [../../runbooks/deployment/tag-based-image-deploy.md](../../runbooks/deployment/tag-based-image-deploy.md)를 기준으로 한다.

## 배경

기존 이미지 publish 기준은 `main` 반영과 가까웠다.

문제점:

- `main` 브랜치에 커밋이 자주 올라오면 이미지 build/push가 반복 실행된다.
- 실제 배포 의도가 없는 변경도 publish 경로를 탈 수 있다.
- 공통 파일 변경 시 여러 서비스 이미지가 함께 빌드될 수 있다.
- GitHub Actions 월간 사용량을 빠르게 소모한다.

## 목표

- 배포 의도가 있는 경우에만 이미지 build/push를 실행한다.
- 서비스 단위 배포와 변경 서비스 묶음 배포를 기본으로 두고, 전체 배포는 예외로 둔다.
- 배포 이력은 Git tag로 남기되, 서비스 버전과 배포 묶음 ID를 분리한다.
- 사람이 다음 버전을 직접 계산하지 않도록 자동 태깅 helper를 둔다.
- 기존 GitOps values 업데이트와 Argo CD 반영 구조는 유지한다.

## repo별 책임

| repo | 책임 |
| --- | --- |
| `service` | Dockerfile, image build 정의, image-publish workflow, `task deploy:tag` helper |
| `gitops` | 환경별 values, image tag 반영, Argo CD가 읽는 배포 선언 |
| `workspace` | 배포 설계, 런북, agent skill 같은 팀 공통 문서 |

## 태그 규칙

현재 개발 환경만 대상으로 하므로 tag prefix는 `deploy/dev`를 사용한다.

단일 서비스 배포:

```text
deploy/dev/<service-name>/v<major>.<minor>.<patch>
```

변경 서비스 묶음 배포:

```text
deploy/dev/changed/<yyyy.mm.dd>-<sequence>
```

강제 전체 배포:

```text
deploy/dev/all/<yyyy.mm.dd>-<sequence>
```

`changed`와 `all`의 마지막 값은 서비스 버전이 아니라 배포 묶음 ID다.

예시:

```text
deploy/dev/reservation-service/v0.3.3
deploy/dev/payment-service/v0.2.6
deploy/dev/changed/2026.06.15-1
deploy/dev/all/2026.06.15-1
```

나중에 검증 환경이나 운영 환경이 생기면 같은 구조로 확장한다.

```text
deploy/stage/<service-name>/v<major>.<minor>.<patch>
deploy/stage/changed/<yyyy.mm.dd>-<sequence>
deploy/stage/all/<yyyy.mm.dd>-<sequence>
deploy/prod/<service-name>/v<major>.<minor>.<patch>
deploy/prod/changed/<yyyy.mm.dd>-<sequence>
deploy/prod/all/<yyyy.mm.dd>-<sequence>
```

## 버전 증가 규칙

서비스 버전은 SemVer 형식으로 관리한다.

| bump | 변경 예시 | 사용 기준 |
| --- | --- | --- |
| `patch` | `v0.3.1` -> `v0.3.2` | 버그 수정, 설정 변경, 일반 배포 |
| `minor` | `v0.3.1` -> `v0.4.0` | 기능 추가, 호환 가능한 동작 변경 |
| `major` | `v0.3.1` -> `v1.0.0` | 호환이 깨지는 변경 |

초기 서비스 tag가 없으면 `v0.1.0`부터 시작한다. 이 경우 `BUMP`는 tag 규칙 검증에는 쓰지만 초기값은 항상 `v0.1.0`이다.

`SERVICE=changed`와 `SERVICE=all`일 때도 `BUMP`는 서비스별 다음 SemVer 계산에 사용한다. 묶음 tag 자체는 SemVer로 올리지 않는다.

예시:

```text
task deploy:tag SERVICE=all BUMP=patch
-> deploy/dev/all/2026.06.15-1 tag 생성
-> auth-service v0.1.7 -> v0.1.8
-> reservation-service v0.3.2 -> v0.3.3
-> payment-service v0.2.5 -> v0.2.6
```

## changed 기준

`SERVICE=changed`는 현재 브랜치에서 도달 가능한 최신 `deploy/dev/changed/*` 또는 `deploy/dev/all/*` tag를 기준으로 현재 `HEAD`와 변경 파일을 비교한다.

- 기준 tag가 없으면 첫 묶음 배포로 보고 전체 서비스 후보를 만든다.
- `services/<service>/` 또는 `contracts/services/<service>/` 변경은 해당 서비스를 대상에 넣는다.
- `packages/`, `pyproject.toml`, `uv.lock`, `requirements-dev-overrides.txt`, `Taskfile.yml`, `.dockerignore`, image build/publish workflow 변경은 공통 입력 변경으로 보고 전체 서비스를 대상에 넣는다.
- 대상 서비스가 하나도 없으면 tag를 만들지 않고 실패한다.
- `dashboard`는 서비스 이미지 배포 대상에서 제외한다.

## 자동 태깅 helper

`service/Taskfile.yml`의 `deploy:tag` helper는 `service/scripts/deploy_tag.sh`를 실행한다.

예상 명령:

```bash
task deploy:tag SERVICE=reservation-service BUMP=patch
task deploy:tag SERVICE=payment-service BUMP=minor
task deploy:tag SERVICE=changed BUMP=patch
task deploy:tag SERVICE=all BUMP=patch
```

helper 책임:

- `SERVICE`가 허용된 서비스 이름, `changed`, 또는 `all`인지 확인한다.
- `BUMP`가 `patch`, `minor`, `major` 중 하나인지 확인한다.
- `DRY_RUN=true`이면 tag 생성과 push 없이 deploy plan을 출력한다.
- `git fetch --tags --force`로 tag를 최신화한다.
- 서비스별 최신 버전은 `deploy/dev/<service-name>/v*.*.*` tag와 `changed`/`all` deploy plan annotation의 `services[].tag`를 함께 보고 찾는다.
- `changed` 배포는 이전 묶음 배포 기준과 현재 `HEAD` 사이의 변경 파일로 영향받은 서비스 목록을 만든다.
- `all` 배포는 전체 서비스 목록을 대상 서비스로 둔다.
- 묶음 배포는 각 대상 서비스별 최신 SemVer를 찾고 같은 `BUMP` 규칙을 적용한다.
- tag annotation에 서비스별 deploy plan JSON을 저장한다.
- 같은 이름의 tag가 이미 있으면 실패한다.
- 실제 실행에서는 annotated tag를 만들고 origin에 해당 tag만 push한다.

deploy plan JSON 예시:

```json
{
  "schema_version": 1,
  "environment": "dev",
  "target": "changed",
  "bump": "patch",
  "deploy_tag": "deploy/dev/changed/2026.06.15-1",
  "source_sha": "<commit-sha>",
  "reason": "changed paths compared with deploy/dev/changed/2026.06.14-1",
  "services": [
    {"image": "reservation-service", "tag": "v0.3.3", "previous_tag": "v0.3.2"}
  ]
}
```

## image-publish workflow

`service/.github/workflows/image-publish.yml`은 tag push만 배포 신호로 해석한다. `main` push와 `workflow_dispatch`는 publish trigger에서 제거한다.

지원 tag:

```text
deploy/dev/auth-service/v*.*.*
deploy/dev/concert-service/v*.*.*
deploy/dev/reservation-service/v*.*.*
deploy/dev/payment-service/v*.*.*
deploy/dev/ticket-service/v*.*.*
deploy/dev/notification-service/v*.*.*
deploy/dev/changed/*.*.*-*
deploy/dev/all/*.*.*-*
```

처리 기준:

- 단일 서비스 tag는 tag의 `vX.Y.Z`를 그대로 이미지 tag로 사용한다.
- `changed`와 `all` tag는 tag annotation JSON의 `services[]`로 build matrix를 만든다.
- `changed`는 deploy plan에 있는 서비스만 build/push한다.
- `all`은 deploy plan에 6개 서비스가 모두 들어 있는지 검증한 뒤 build/push한다.
- 각 matrix 항목은 `{image, tag}` 형태다.
- build/push 뒤 ECR에서 digest를 확인하고 서비스별 `{image, tag, image_ref, digest, digest_ref}`를 artifact로 남긴다.
- 통합 deploy plan artifact는 GitOps values 업데이트의 입력이 된다.

예시:

```text
Git tag: deploy/dev/reservation-service/v0.3.3
Docker image tag: v0.3.3
Image ref: <registry>/reservation-service:v0.3.3

Git tag: deploy/dev/changed/2026.06.15-1
Docker image tag: deploy plan의 서비스별 SemVer
Image refs: <registry>/<changed-service>:vX.Y.Z

Git tag: deploy/dev/all/2026.06.15-1
Docker image tag: deploy plan의 서비스별 SemVer
Image refs: <registry>/<service>:vX.Y.Z
```

## GitOps values 업데이트

workflow는 publish된 서비스만 `gitops/values/services/<service>.yaml`에 반영한다. 파일명은 서비스 이름에서 `-service`를 제거한 값이다.

예시:

```text
reservation-service -> values/services/reservation.yaml
payment-service -> values/services/payment.yaml
notification-service -> values/services/notification.yaml
```

업데이트 대상은 각 파일의 `image.tag`이다. `dashboard`는 deploy plan에 들어가지 않으므로 이 workflow에서 업데이트하지 않는다.

GitOps commit 메시지는 다음 형식이다.

```text
chore: deploy images for deploy/dev/changed/2026.06.15-1
```

## 기대 효과

- `main` 커밋이 잦아도 이미지 publish가 실행되지 않는다.
- 배포 의도가 tag로 명확히 남는다.
- `changed` 배포가 불필요한 전체 이미지 빌드를 줄인다.
- 팀원이 다음 버전을 직접 계산하지 않아도 된다.
- 서비스별 SemVer가 rollback 기준으로 남고, `changed`/`all` tag가 묶음 배포 실행 이력으로 남는다.
- `dev`, `stage`, `prod` 환경이 생겨도 같은 규칙으로 확장할 수 있다.

## 주의점

- Git tag 전체에는 `/`가 들어가므로 Docker image tag로 그대로 쓰지 않는다.
- `deploy/dev/all/<yyyy.mm.dd>-<sequence>`는 비용이 크므로 예외적인 전체 배포에만 사용한다.
- 일상적인 묶음 배포는 `deploy/dev/changed/<yyyy.mm.dd>-<sequence>`를 우선 사용한다.
- 자동 태깅 helper는 deploy tag를 만드는 명령이다.
- 실제 이미지 build/push와 GitOps values 업데이트는 tag push를 받은 GitHub Actions가 담당한다.
- 운영 환경이 생기면 `prod` 배포 tag 생성 권한과 승인 절차를 별도로 정한다.
