import type { GraphNode } from '../types';

/**
 * 마음건강 욕구 그래프(Phase 4.8).
 *
 * 스코핑 원칙(Q-5 실측 반영):
 *  - 실데이터 Policy.category는 거친 도메인 라벨("마음건강","일자리","주거")이다.
 *    "심리"/"상담"/"정신건강" 같은 세부 라벨은 신뢰할 매핑이 없다.
 *    → 하드필터(allowedCategories)는 신뢰 가능한 거친 도메인("마음건강")에만.
 *    → 세부 갈래(번아웃/고립은둔/검사)는 소프트 부스트(boostCategories/boostKeywords)로만 운영(재현율 우선).
 *  - 불명(category=null)은 하드 제외되지 않는다(hybridSearch가 보장, SC-4).
 *
 * 안전: kind='safety' 노드는 SAFETY_RESOURCES를 참조(위기 시 traverse가 crisisDetect로 직접 라우팅).
 */

const burnoutNode: GraphNode = {
  id: 'mh.burnout',
  label: '지치고 무기력해요',
  concept: '번아웃 의욕저하 만성피로 무기력 소진 전문 심리상담',
  allowedCategories: ['마음건강'],
  boostCategories: ['상담', '심리치료', '심리상담'],
  boostKeywords: ['번아웃', '무기력', '의욕', '소진', '심리상담', '마음투자', '바우처'],
  keywords: ['번아웃', '무기력', '의욕', '소진', '심리상담'],
  kind: 'leaf',
};

const isolationNode: GraphNode = {
  id: 'mh.isolation',
  label: '고립·은둔 상태예요',
  concept: '고립 은둔 외톨이 관계 단절 사회적 고립 관계망 회복 이음센터',
  allowedCategories: ['마음건강'],
  boostCategories: ['관계회복', '고립은둔', '사회적관계'],
  boostKeywords: ['고립', '은둔', '이음센터', '관계망', '관계회복'],
  keywords: ['고립', '은둔', '이음센터', '관계망'],
  kind: 'leaf',
};

const screeningNode: GraphNode = {
  id: 'mh.screening',
  label: '상태를 검사해보고 싶어요',
  concept: '자가검진 자가진단 정신건강 검사 우울 척도 정신건강복지센터',
  allowedCategories: ['마음건강'],
  boostCategories: ['검사', '진단', '정신건강복지센터'],
  boostKeywords: ['자가검진', '자가진단', '검사', '정신건강복지센터', '척도'],
  keywords: ['자가검진', '검사', '정신건강복지센터'],
  kind: 'leaf',
};

const safetyNode: GraphNode = {
  id: 'mh.safety',
  label: '지금 많이 힘들고 위급해요',
  concept: '위기 안전 자살 자해 긴급 상담 안전자원',
  // 안전 노드는 검색이 아니라 crisisDetect 라우팅을 받는다(traverse가 처리).
  keywords: ['위기', '긴급', '안전'],
  kind: 'safety',
};

export const mentalHealthGraph: GraphNode = {
  id: 'mh.entry',
  label: '마음이 어떤가요?',
  concept: '마음건강 정신건강 심리 우울 불안 스트레스',
  allowedCategories: ['마음건강'],
  keywords: ['마음건강', '심리', '정신건강'],
  kind: 'entry',
  children: [burnoutNode, isolationNode, screeningNode, safetyNode],
};
