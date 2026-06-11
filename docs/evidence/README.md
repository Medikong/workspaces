# Evidence

이 폴더는 Medikong 구현 결과를 발표, 회고, 문제 분석에서 다시 확인할 수 있도록 보관하는 주제별 evidence archive다.

`trouble` 문서는 문제와 원인 분석을 남기고, `evidence` 문서는 실제로 동작을 확인한 결과물, 캡처, 조회 기준, 검증 메모를 남긴다. 결과물은 하나의 큰 문서에 모으지 않고 주제와 검증 단위별로 나눈다.

## Folder Convention

```text
docs/evidence/
  <area>/
    <topic-slug>/
      README.md
      assets/
```

예시:

```text
docs/evidence/observability/payment-ticket-trace-context/
docs/evidence/deployment/canary-rollout/
docs/evidence/security/network-policy-block/
```

## Area Index

| 영역 | 용도 | 인덱스 |
| --- | --- | --- |
| observability | metric, log, trace, dashboard 검증 결과 | [observability/README.md](observability/README.md) |
