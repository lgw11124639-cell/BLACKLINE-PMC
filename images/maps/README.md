# 작전 지형 이미지

프로젝트를 위해 생성한 밝은 입체 지형 이미지를 1536×1024 WebP로 저장했습니다. 실행 중 외부 이미지 서비스에 접속하지 않습니다.

| 이미지 | 지형 | 논리 좌표 크기 |
| --- | --- | --- |
| sera-district.webp | 산업지구 | 100×66.667 |
| urban.webp | 시가지 | 100×66.667 |
| mountain.webp | 산악 | 160×106.667 |
| regional.webp | 광역 | 320×213.333 |

`field-maps.js`가 지도별 건물·장애물·접근 경로·고지·후방 진지·출입구를 정의합니다. 이미지 자체로 충돌을 계산하지 않으며, 모든 시각적 지형을 정밀한 3D 메시로 재현한 구조는 아닙니다. `field-simulation.js`는 이 지형 정의에 따라 경로와 차폐를 계산합니다. 기존 기록의 산업지구 좌표는 유지합니다.

`operations-interior.webp`는 1536×1024의 건물 내부 절개 렌더입니다. 논리 좌표 100×66.667, 중앙 복도와 네 개 방을 사용하며 벽·출입구 충돌은 `field-journey.js`에 정의합니다. 현재 건물 종류가 달라도 내부 도면은 이 공통 구조를 재사용합니다.

v37: `urban-modern.webp`, `urban-port.webp`, `urban-quarter.webp`, `urban-market.webp`를 추가했습니다. 내부는 `interior-office.webp`, `interior-clinic.webp`, `interior-apartment.webp`, `interior-warehouse.webp`를 추가했습니다. 모두 1536×1024 생성 렌더의 로컬 WebP이며, 지형/실내 충돌·방·출입구는 `field-scenarios.js`에서 관리합니다. 동측 출입 구조는 원본 이미지를 Canvas에서 좌우 반전하고 좌표도 같이 반전합니다. 원본 생성 PNG는 `/workspace/generated_images`에 보존합니다.
