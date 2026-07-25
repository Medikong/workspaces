---
title: Interest 90일 Ramp의 runtime address capacity 누락
date: 2026-07-25
repository: gitops
status: resolved-locally
related_experiment: baseline90d-ramp-20260725t215600z
category: loadtest-execution-failure
---

# Interest runtime address capacity 누락

## 문제

Interest 서비스의 실제 90일 ramp는 k6 요청을 시작하기 전에 runtime address allocation에서 멈췄다. 최종 결과의 failure category는 runtime_addressing이며, 정제된 오류는 다음과 같다.

    runtime address range existingInterests exhausted: required end 322, capacity unknown

## 직접 원인

Interest endpoint mix는 DELETE /v1/users/me/interests/{dropId}를 existingInterests 쓰기 범위로 사용한다. allocator는 이 범위의 capacity를 검사해야 하지만, deterministic-data의 normalizeDatasetProfile은 interestCount를 profile에 계산해 넣지 않는다. 이어서 writeCapacities가 profile.interestCount를 읽으므로 값이 undefined가 되고, 필요한 322개 범위를 검증할 수 없다.

데이터셋 생성기 쪽 profile은 interestCount를 계산한다. 즉 데이터셋 자체가 없어서 생긴 문제가 아니라, runtime allocator가 같은 파생 값을 다시 구성할 때 계약이 빠진 문제다.

## 영향과 분류

- Interest Dataset Job과 기존 dev replica 복원은 완료됐다.
- Interest의 k6 request, actual RPS, HTTP 오류율, check, API trace sample은 생성되지 않았다.
- 따라서 이번 run의 Interest failed는 성능 병목도 0 RPS 결과도 아니다.
- 전체 RUN 상태가 fail이 된 직접 원인이다. Auth, Catalog, Notification의 병목 후보와는 독립적으로 해석해야 한다.

## 해결

고정 existingInterests 쓰기 범위를 유지하는 대신, Interest 삭제를 실제 사용자 흐름으로 바꿨다.

- k6 iteration 안에서 GET /v1/users/me/interests를 호출한다.
- 목록 응답의 dropId 하나를 선택해 DELETE /v1/users/me/interests/{dropId}를 호출한다.
- 목록이 비어 있으면 GET만 정상 측정하고 삭제 오류로 만들지 않는다.
- Interest 삭제 endpoint에서 addressPool과 addressAccess를 제거해 allocator가 existingInterests capacity를 요구하지 않게 했다.
- 같은 변경을 ramp와 static-replica scenario에 함께 적용하고 회귀 테스트를 추가했다.

2026-07-25에 baseline-90days 데이터셋으로 Interest 단독 저RPS ramp를 다시 실행했다. RUN interest-cycle-smoke-20260725t132003z는 pass 및 max_rps_reached로 종료했고, DELETE route는 2건 모두 오류율 0과 checks 1로 실제 측정됐다. 이 검증은 저RPS 실행이므로 전체 baseline ramp 재실행의 성능 결론을 대체하지 않는다.

## 관련 자료

- [실험 결과](../README.md)
- [정제된 최종 결과 JSON](../assets/run-baseline90d-ramp-20260725t215600z/result.json)
- [scenario 분석](../assets/run-baseline90d-ramp-20260725t215600z/analysis.md)
