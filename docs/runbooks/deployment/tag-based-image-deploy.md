# 태그 기반 이미지 배포

설계 문서: [../../architecture/deployment/README.md](../../architecture/deployment/README.md)

## 규칙

```text
service tag: deploy/dev/<service-name>/v<major>.<minor>.<patch>
changed tag: deploy/dev/changed/<yyyy.mm.dd>-<sequence>
all tag: deploy/dev/all/<yyyy.mm.dd>-<sequence>
service-name: auth-service | concert-service | reservation-service | payment-service | ticket-service | notification-service
bump: patch | minor | major
```

`changed`와 `all` tag의 마지막 값은 서비스 버전이 아니라 배포 묶음 ID다. 서비스별 이미지 태그는 tag annotation에 저장된 deploy plan JSON의 `services[].tag`를 사용한다.

```text
patch: 버그 수정, 설정 변경, 일반 배포
minor: 기능 추가, 호환 가능한 동작 변경
major: 호환이 깨지는 변경
```

## 미리보기

실제 tag를 만들거나 push하지 않을 때는 `DRY_RUN=true`를 붙인다.

```bash
cd ../service
git status --short --branch
task deploy:tag SERVICE=reservation-service BUMP=patch DRY_RUN=true
task deploy:tag SERVICE=changed BUMP=patch DRY_RUN=true
task deploy:tag SERVICE=all BUMP=patch DRY_RUN=true
```

`SERVICE=changed`는 일상적인 묶음 배포의 기본 선택이다. `SERVICE=all`은 공통 기반을 강제로 다시 배포해야 하는 예외 상황에 둔다.

## 배포 tag 생성

사용자 확인 없이 실제 deploy tag를 push하지 않는다. 배포 실행이 확정된 뒤에만 `DRY_RUN=true`를 제거한다.

단일 서비스 배포:

```bash
cd ../service
git status --short --branch
task deploy:tag SERVICE=reservation-service BUMP=patch
```

변경 서비스 묶음 배포:

```bash
cd ../service
git status --short --branch
task deploy:tag SERVICE=changed BUMP=patch
```

강제 전체 배포:

```bash
cd ../service
git status --short --branch
task deploy:tag SERVICE=all BUMP=patch
```

helper는 먼저 `git fetch --tags --force`를 실행한다. 서비스별 최신 SemVer는 `deploy/dev/<service>/v*.*.*` tag와 `deploy/dev/changed/*`, `deploy/dev/all/*` annotation의 `services[].tag`를 함께 보고 계산한다. 초기 서비스 tag가 없으면 `v0.1.0`부터 시작한다.

## changed 기준

`SERVICE=changed`는 현재 브랜치에서 도달 가능한 최신 `deploy/dev/changed/*` 또는 `deploy/dev/all/*` tag를 기준으로 현재 `HEAD`와 변경 파일을 비교한다.

- 기준 tag가 없으면 첫 묶음 배포로 보고 전체 서비스 후보를 만든다.
- `services/<service>/` 또는 `contracts/services/<service>/` 변경은 해당 서비스만 포함한다.
- `packages/`, `pyproject.toml`, `uv.lock`, `requirements-dev-overrides.txt`, `Taskfile.yml`, `.dockerignore`, image build/publish workflow 변경은 전체 서비스 후보로 본다.
- 대상 서비스가 하나도 없으면 tag를 만들지 않고 실패한다.
- `dashboard`는 이 배포 helper와 image-publish workflow 대상에 포함하지 않는다.

## deploy plan annotation

`changed`와 `all` tag는 annotated tag이고, tag message에 서비스별 deploy plan JSON을 저장한다. 단일 서비스 tag도 감사용으로 같은 JSON 형식의 annotation을 남긴다.

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

GitHub Actions는 단일 서비스 tag에서는 tag의 `vX.Y.Z`를 이미지 태그로 사용한다. `changed`와 `all`에서는 annotation의 `services[]`만 읽어 matrix를 만든다.

## 확인

```bash
cd ../service
git tag --list 'deploy/dev/reservation-service/v*' --sort=-creatordate | head
git tag --list 'deploy/dev/changed/*' --sort=-creatordate | head
git tag --list 'deploy/dev/all/*' --sort=-creatordate | head
gh run list --workflow image-publish.yml --limit 5
```

```bash
cd ../gitops
git pull --ff-only
git log -1 --oneline
git diff HEAD~1 -- values/services/
```

GitOps commit 메시지는 `chore: deploy images for <deploy-tag>` 형식이다. `values/services/<service>.yaml`의 `image.tag`만 deploy plan의 서비스별 tag로 바뀌어야 한다.

## 실패 시

```bash
cd ../service
git tag --list 'deploy/dev/<service-name>/v*' --sort=-creatordate | head
git tag --list 'deploy/dev/changed/*' --sort=-creatordate | head
git tag --list 'deploy/dev/all/*' --sort=-creatordate | head
gh run list --workflow image-publish.yml --limit 10
```

- tag가 없으면 `task deploy:tag` 실패 여부를 확인한다.
- workflow가 없으면 tag pattern이 `deploy/dev/<service>/vX.Y.Z`, `deploy/dev/changed/YYYY.MM.DD-N`, `deploy/dev/all/YYYY.MM.DD-N` 중 하나인지 확인한다.
- `changed` 또는 `all` workflow가 실패하면 tag annotation이 JSON이고 `services[].tag`가 `vX.Y.Z`인지 확인한다.
- GitOps commit이 없으면 `image-publish.yml`의 values update 로그와 `GITOPS_TOKEN` 권한을 확인한다.
