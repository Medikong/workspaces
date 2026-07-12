### 1. 검증 목적

본 검증의 목적은 Kubernetes RBAC을 통해 서비스 앱 계정과 운영 주체의 권한이 최소 권한 원칙에 맞게 분리되어 있는지 확인하는 것이다.

검증 기준은 다음과 같다.

```
1. 서비스별 전용 ServiceAccount를 사용한다.
2. 서비스 앱 Pod는 default ServiceAccount를 사용하지 않는다.
3. 서비스 앱 계정에는 Kubernetes API 조회/수정/Secret 접근 권한을 부여하지 않는다.
4. 서비스 앱 계정에 ClusterRoleBinding이 직접 연결되지 않는다.
5. 개발자, 운영자, SRE 역할을 Role + RoleBinding 기반으로 분리한다.
6. 개발자는 조회 전용, 운영자는 Deployment 관리, SRE는 namespace 관리자 권한을 가진다.
```

---

### 2. ServiceAccount 구조 확인

각 핵심 백엔드 서비스는 default ServiceAccount가 아니라 서비스별 전용 ServiceAccount를 사용한다.

```
auth-service          -> auth-service ServiceAccount
concert-service       -> concert-service ServiceAccount
reservation-service   -> reservation-service ServiceAccount
payment-service       -> payment-service ServiceAccount
ticket-service        -> ticket-service ServiceAccount
notification-service  -> notification-service ServiceAccount
```

Deployment와 실제 Pod 모두 전용 ServiceAccount를 사용하는 것을 확인했다.

```
auth-service Pod              => auth-service
concert-service Pod           => concert-service
reservation-service Pod       => reservation-service
payment-service Pod           => payment-service
ticket-service Pod            => ticket-service
notification-service Pod      => notification-service
```

---

### 3. 서비스 앱 ServiceAccount 최소 권한 검증

서비스 앱 계정이 Kubernetes API 권한을 갖지 않는지 `kubectl auth can-i`로 검증했다.

실행 명령 예시:

```bash
kubectl auth can-i get pods \
  --as=system:serviceaccount:ticketing-auth:auth-service \
  -n ticketing-auth

kubectl auth can-i list secrets \
  --as=system:serviceaccount:ticketing-auth:auth-service \
  -n ticketing-auth

kubectl auth can-i update deployments \
  --as=system:serviceaccount:ticketing-auth:auth-service \
  -n ticketing-auth
```

검증 결과:

```
auth-service SA:
get pods = no
list secrets = no
update deployments = no

reservation-service SA:
get pods = no
list secrets = no
update deployments = no

payment-service SA:
get pods = no
list secrets = no
update deployments = no
```

해석:

```
서비스 앱 계정은 Kubernetes API를 통해 Pod를 조회하거나 Secret을 읽거나 Deployment를 수정할 수 없다.
```

따라서 서비스 앱 계정은 최소 권한 원칙에 맞게 구성되어 있다.

---

### 4. ClusterRoleBinding 확인

서비스 앱 계정에 직접 연결된 ClusterRoleBinding이 없는지 확인했다.

검증 결과:

```
auth-service
concert-service
reservation-service
payment-service
ticket-service
notification-service
```

위 서비스 계정에 연결된 ClusterRoleBinding은 발견되지 않았다.

해석:

```
서비스 앱 계정에는 cluster-wide 권한이 부여되어 있지 않다.
```

---

### 5. 사용자 역할 분리 구조

RoleBinding subject 확인 결과, 사용자 역할은 다음 group 기준으로 분리되어 있었다.

```
medikong:developers -> medikong-developer-readonly
medikong:operators  -> medikong-operator-deployment-manager
medikong:sres       -> medikong-sre-namespace-admin
```

각 group은 namespace Role에 RoleBinding되어 있으며, ClusterRole이 아닌 Role 기반으로 namespace 범위 권한만 부여된다.

---

### 6. Developer Role 검증

Developer Role은 조회 전용 권한을 가진다.

검증 명령:

```bash
kubectl auth can-i get pods \
  --as=dev-user \
  --as-group=medikong:developers \
  -n ticketing-auth

kubectl auth can-i get pods/log \
  --as=dev-user \
  --as-group=medikong:developers \
  -n ticketing-auth

kubectl auth can-i patch deployments \
  --as=dev-user \
  --as-group=medikong:developers \
  -n ticketing-auth

kubectl auth can-i list secrets \
  --as=dev-user \
  --as-group=medikong:developers \
  -n ticketing-auth
```

검증 결과:

```
get pods          = yes
get pods/log      = yes
patch deployments = no
list secrets      = no
```

해석:

```
개발자는 Pod와 로그 조회는 가능하지만 Deployment 수정과 Secret 조회는 불가능하다.
```

---

### 7. Operator Role 검증

Operator Role은 Deployment 관리 중심 권한을 가진다.

검증 명령:

```bash
kubectl auth can-i get pods \
  --as=ops-user \
  --as-group=medikong:operators \
  -n ticketing-auth

kubectl auth can-i patch deployments \
  --as=ops-user \
  --as-group=medikong:operators \
  -n ticketing-auth

kubectl auth can-i update deployments/scale \
  --as=ops-user \
  --as-group=medikong:operators \
  -n ticketing-auth

kubectl auth can-i list secrets \
  --as=ops-user \
  --as-group=medikong:operators \
  -n ticketing-auth

kubectl auth can-i delete pods \
  --as=ops-user \
  --as-group=medikong:operators \
  -n ticketing-auth
```

검증 결과:

```
get pods                  = yes
patch deployments          = yes
update deployments/scale   = yes
list secrets               = no
delete pods                = no
```

해석:

```
운영자는 Deployment 수정 및 scale 조정은 가능하지만, Secret 조회나 Pod 직접 삭제는 불가능하다.
```

---

### 8. SRE Role 검증

SRE Role은 namespace 내부 관리자 권한을 가진다.

검증 명령:

```bash
kubectl auth can-i get pods \
  --as=sre-user \
  --as-group=medikong:sres \
  -n ticketing-auth

kubectl auth can-i delete pods \
  --as=sre-user \
  --as-group=medikong:sres \
  -n ticketing-auth

kubectl auth can-i list secrets \
  --as=sre-user \
  --as-group=medikong:sres \
  -n ticketing-auth

kubectl auth can-i create deployments \
  --as=sre-user \
  --as-group=medikong:sres \
  -n ticketing-auth
```

검증 결과:

```
get pods           = yes
delete pods        = yes
list secrets       = yes
create deployments = yes
```

해석:

```
SRE는 ticketing-auth namespace 내부에서 운영 복구와 장애 대응을 위한 관리자 권한을 가진다.
```

---

### 9. 최종 판정

| 검증 항목                           | 결과                                       | 판정 |
| ----------------------------------- | ------------------------------------------ | ---- |
| 서비스별 전용 ServiceAccount        | 존재                                       | 통과 |
| Deployment 전용 ServiceAccount 사용 | 확인                                       | 통과 |
| Pod 전용 ServiceAccount 사용        | 확인                                       | 통과 |
| 서비스 앱 Kubernetes API 권한       | no                                         | 통과 |
| 서비스 앱 Secret 접근               | no                                         | 통과 |
| 서비스 앱 Deployment 수정           | no                                         | 통과 |
| 서비스 앱 ClusterRoleBinding        | 없음                                       | 통과 |
| Developer Role                      | 조회 가능, 수정/Secret 불가                | 통과 |
| Operator Role                       | Deployment 관리 가능, Secret/Pod 삭제 불가 | 통과 |
| SRE Role                            | Namespace 내부 관리자                      | 통과 |

최종 결론:

```
RBAC / ServiceAccount 최소 권한 검증 완료
```

본 구조는 서비스 앱 계정과 운영 주체 권한을 분리하고, ClusterRoleBinding 대신 namespace Role + RoleBinding을 사용하여 최소 권한 원칙을 적용한다.
