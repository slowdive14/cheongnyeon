import type { GraphNode } from '../../types';

/**
 * 청년정책 멀티도메인 entry (스코프 확장 Phase 1).
 *
 *  - entry에 allowedCategories를 두지 않는다 → hybridSearch 하드필터 없음 → 자유입력이
 *    전 영역(마음건강·일자리·주거·교육·복지)을 관련도로 검색한다.
 *  - children은 '이렇게 적어도 돼요' 예시 quick-start. 라벨이 곧 검색 질의가 되므로(FunnelContainer
 *    onExample) 영역 키워드를 라벨에 담아 키 없는 키워드 검색도 적중하게 한다.
 *  - 위기 라우팅은 도메인 무관(detectCrisis가 질의에서 직접). safety 노드는 자리만(ChoiceChips가 제외).
 */

const exampleNodes: GraphNode[] = [
  {
    id: 'yp.mind',
    label: '지치고 무기력하고 우울해요',
    concept: '마음건강 우울 불안 무기력 번아웃 심리상담 고립',
    keywords: ['마음건강', '무기력', '우울', '심리상담'],
    kind: 'leaf',
  },
  {
    id: 'yp.job',
    label: '일자리를 찾고 있어요',
    concept: '일자리 취업 구직 창업 직업훈련 인턴',
    keywords: ['일자리', '취업', '구직', '창업'],
    kind: 'leaf',
  },
  {
    id: 'yp.house',
    label: '월세·주거비가 부담돼요',
    concept: '주거 월세 전세 임대 보증금 주택 청약',
    keywords: ['주거', '월세', '전세', '보증금'],
    kind: 'leaf',
  },
  {
    id: 'yp.edu',
    label: '학비·자격증이 부담돼요',
    concept: '교육 학자금 등록금 자격증 직업훈련 장학금',
    keywords: ['교육', '학자금', '자격증'],
    kind: 'leaf',
  },
  {
    id: 'yp.welfare',
    label: '생활비가 막막해요',
    concept: '복지 생활비 금융 지원 문화 바우처',
    keywords: ['복지', '생활비', '금융'],
    kind: 'leaf',
  },
];

const safetyNode: GraphNode = {
  id: 'yp.safety',
  label: '지금 많이 힘들고 위급해요',
  concept: '위기 안전 긴급 상담',
  keywords: ['위기', '긴급', '안전'],
  kind: 'safety',
};

export const youthPolicyGraph: GraphNode = {
  id: 'yp.entry',
  label: '어떤 점이 고민이세요?',
  concept: '청년정책 마음건강 일자리 주거 교육 복지',
  // allowedCategories 미지정 → 전 영역 검색(하드필터 없음).
  keywords: ['청년정책'],
  kind: 'entry',
  children: [...exampleNodes, safetyNode],
};
