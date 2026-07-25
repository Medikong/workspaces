# DropMong 연속 ramp 병목 측정: baseline90d-ramp-20260725t215600z

전체 상태: **fail**
Replica 수: **1**

## 서비스별 결과

| 서비스 | 상태 | peak 목표 RPS | peak 실측 RPS | 마지막 reference 실측 RPS | 최초 저하 실측 RPS | 관측 상태 |
|---|---|---:|---:|---:|---:|---|
| auth-service | bottleneck_reached | 52 | 35 | 8.8 | 12.2 | available |
| user-service | max_rps_reached | 75 | 75.4 | 75.4 | unavailable | available |
| catalog-service | bottleneck_reached | 80 | 81.2 | 45.8 | 76.2 | available |
| coupon-service | max_rps_reached | 33 | 33.1 | 33.1 | unavailable | available |
| interest-service | failed | unavailable | unavailable | unavailable | unavailable | unavailable |
| order-service | max_rps_reached | 53 | 52.6 | 52.6 | unavailable | available |
| payment-service | max_rps_reached | 32 | 32.9 | 32.9 | unavailable | available |
| notification-service | bottleneck_reached | 98 | 58.4 | 58.4 | 51.1 | available |

## 판정 근거

### auth-service

- 실행: 2 RPS에서 80 RPS까지 초당 2 RPS씩 증가했습니다.
- window: 10초 단위 3개를 기록했습니다. 종료: 2개 연속 reference 저하(dropped_iterations_observed, http_error_observed, check_failure_observed).
- RPS: peak 목표 52, peak 실측 35, 마지막 정상 reference 실측 8.8, 최초 저하 목표/실측 32/12.2.
- API별 k6 결과는 services.auth-service.apis에 route별로 보관하고, 서비스·Pod 관측성은 별도 필드에 둡니다.

### user-service

- 실행: 5 RPS에서 100 RPS까지 초당 2 RPS씩 증가했습니다.
- window: 10초 단위 4개를 기록했습니다. 종료: 설정한 최대 RPS 도달.
- RPS: peak 목표 75, peak 실측 75.4, 마지막 정상 reference 실측 75.4, 최초 저하 목표/실측 unavailable/unavailable.
- API별 k6 결과는 services.user-service.apis에 route별로 보관하고, 서비스·Pod 관측성은 별도 필드에 둡니다.

### catalog-service

- 실행: 10 RPS에서 300 RPS까지 초당 2 RPS씩 증가했습니다.
- window: 10초 단위 4개를 기록했습니다. 종료: 2개 연속 reference 저하(http_error_observed, check_failure_observed).
- RPS: peak 목표 80, peak 실측 81.2, 마지막 정상 reference 실측 45.8, 최초 저하 목표/실측 60/76.2.
- API별 k6 결과는 services.catalog-service.apis에 route별로 보관하고, 서비스·Pod 관측성은 별도 필드에 둡니다.

### coupon-service

- 실행: 3 RPS에서 60 RPS까지 초당 2 RPS씩 증가했습니다.
- window: 10초 단위 2개를 기록했습니다. 종료: 설정한 최대 RPS 도달.
- RPS: peak 목표 33, peak 실측 33.1, 마지막 정상 reference 실측 33.1, 최초 저하 목표/실측 unavailable/unavailable.
- API별 k6 결과는 services.coupon-service.apis에 route별로 보관하고, 서비스·Pod 관측성은 별도 필드에 둡니다.

### interest-service

- 실행: unavailable RPS에서 unavailable RPS까지 초당 unavailable RPS씩 증가했습니다.
- window: unavailable초 단위 0개를 기록했습니다. 종료: 실행 실패(execution_failure).
- RPS: peak 목표 unavailable, peak 실측 unavailable, 마지막 정상 reference 실측 unavailable, 최초 저하 목표/실측 unavailable/unavailable.
- API별 k6 결과는 services.interest-service.apis에 route별로 보관하고, 서비스·Pod 관측성은 별도 필드에 둡니다.
- 관측성 unavailable: observability snapshot is unavailable. k6 성공을 자동 실패로 바꾸지 않습니다.

### order-service

- 실행: 3 RPS에서 70 RPS까지 초당 2 RPS씩 증가했습니다.
- window: 10초 단위 3개를 기록했습니다. 종료: 설정한 최대 RPS 도달.
- RPS: peak 목표 53, peak 실측 52.6, 마지막 정상 reference 실측 52.6, 최초 저하 목표/실측 unavailable/unavailable.
- API별 k6 결과는 services.order-service.apis에 route별로 보관하고, 서비스·Pod 관측성은 별도 필드에 둡니다.

### payment-service

- 실행: 2 RPS에서 50 RPS까지 초당 2 RPS씩 증가했습니다.
- window: 10초 단위 2개를 기록했습니다. 종료: 설정한 최대 RPS 도달.
- RPS: peak 목표 32, peak 실측 32.9, 마지막 정상 reference 실측 32.9, 최초 저하 목표/실측 unavailable/unavailable.
- API별 k6 결과는 services.payment-service.apis에 route별로 보관하고, 서비스·Pod 관측성은 별도 필드에 둡니다.

### notification-service

- 실행: 8 RPS에서 150 RPS까지 초당 2 RPS씩 증가했습니다.
- window: 10초 단위 5개를 기록했습니다. 종료: 2개 연속 reference 저하(actual_rps_stalled_against_reference, dropped_iterations_observed, http_error_observed, check_failure_observed).
- RPS: peak 목표 98, peak 실측 58.4, 마지막 정상 reference 실측 58.4, 최초 저하 목표/실측 78/51.1.
- API별 k6 결과는 services.notification-service.apis에 route별로 보관하고, 서비스·Pod 관측성은 별도 필드에 둡니다.

수집하지 못한 관측값은 0이 아니라 null과 unavailable으로 남깁니다. 이 결과는 선택한 환경의 실험 자료이며 운영 처리량 보장값이 아닙니다.
