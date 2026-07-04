/**
 * 인제스트 실행 스크립트 — 실 조립(env · 로컬캐시 · clock).
 *
 * 키 없이 fixture 모드로 완전 동작:
 *  - ONTONG_API_KEY 미설정 → ontongClient fixture.
 *  - GEMINI_API_KEY 미설정 → LLM off(parseChunk 전 UNKNOWN 폴백).
 *
 * 산출:
 *  - data/cache/policies.json (적재 스냅샷)
 *  - coverage-report.json (온통 vs 몽땅 갭률·몽땅전용·수동검증후보)
 *
 * 실행: npm run ingest
 */
import process from 'node:process';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

// .env 로드(루트에 있으면). 없으면 fixture/LLM-off 모드로 정상 동작(throw 금지).
try {
  process.loadEnvFile();
} catch {
  // .env 미존재 — 키 없이 fixture 모드.
}

import { createOntongClient } from '../src/data/ontongClient';
import { createSeoulClient } from '../src/data/seoulClient';
import { createGeminiClient, createDisabledLlmClient } from '../src/data/llm/geminiClient';
import { createGeminiEmbeddingProvider } from '../src/data/llm/geminiEmbed';
import { parseChunk } from '../src/data/parseChunk';
import { explainMatch } from '../src/llm/explain';
import { ingest } from '../src/data/ingest';
import type { IngestClient, IngestParser, IngestExplainer, IngestEmbedder } from '../src/data/ingest';
import { LocalJsonCache } from '../src/data/cache/localJsonCache';
import { SupabaseCache } from '../src/data/cache/supabaseCache';
import type { PolicyCache } from '../src/data/cache/types';
import { computeCoverage } from '../src/data/coverage';
import { normalizePolicy } from '../src/domain/normalizePolicy';
import type { Policy } from '../src/domain/types';

import mongttangRaw from '../test/fixtures/mongttang.sample.json';

const CACHE_PATH = 'data/cache/policies.json';
const COVERAGE_PATH = 'coverage-report.json';
const PARSED_SAMPLE_PATH = 'data/parsed-sample.json';

/** 몽땅 raw 스키마(bizId/policyName/...) → 도메인 raw 어댑터. */
function mongttangToRaw(m: unknown): Record<string, unknown> {
  const o = (m && typeof m === 'object' ? m : {}) as Record<string, unknown>;
  return {
    id: o.bizId ?? null,
    title: o.policyName ?? null,
    orgName: o.orgName ?? null,
    regionText: o.regionName ?? null,
    ageText: o.ageInfo ?? null,
    incomeText: o.incomeInfo ?? null,
    recruitText: o.applyPeriod ?? null,
    sourceUrl: o.detailUrl ?? null,
    source: 'mongttang',
  };
}

async function writeJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2), 'utf-8');
}

async function main(): Promise<void> {
  const ontongKey = process.env.ONTONG_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const now = new Date().toISOString();

  const ontong = createOntongClient({ apiKey: ontongKey });
  const llm = createGeminiClient({ apiKey: geminiKey });

  // 서울 청년몽땅 합류(B) — SEOUL_INGEST=on일 때만 실 크롤(기본 off = 무영향).
  //  숫자-ID(온통 유입)는 클라이언트가 원천 제외, V-접두(서울 자체)만 수집.
  const seoulLive = process.env.SEOUL_INGEST === 'on';
  const seoul = createSeoulClient({ live: seoulLive });
  // 다중 클라이언트 합류. 서울 수집 실패가 온통청년 적재를 절단·삭제하지 않게 격리한다(부분실패 격리).
  const client: IngestClient = {
    async fetchAll() {
      const ontongItems = await ontong.fetchAll();
      let seoulItems: unknown[] = [];
      try {
        seoulItems = await seoul.fetchAll();
      } catch (e) {
        console.warn('[seoul] fetch 실패 — 서울분 건너뜀(온통청년 적재 보존):', e);
      }
      console.log(`[fetch] ontong=${ontongItems.length} seoul=${seoulItems.length} (live=${seoulLive})`);
      return [...ontongItems, ...seoulItems];
    },
  };
  // parseChunk: 기본 LLM. INGEST_PARSE=off면 청크 LLM 생략(임베딩은 title+summary 폴백, 비용·시간 절감).
  const parseLlm = process.env.INGEST_PARSE === 'off' ? createDisabledLlmClient() : llm;
  const parser: IngestParser = {
    parseChunk: (text: string) => parseChunk(text, { llm: parseLlm }),
  };
  // 설명 precompute(운영자 키 있을 때만) — explainMatch는 질의 무관이라 정책별 고정.
  const explainer: IngestExplainer | undefined = geminiKey
    ? {
        async explain(p) {
          const r = await explainMatch(
            {
              title: p.title,
              summary: p.summary,
              category: p.category,
              ageMin: p.ageMin,
              ageMax: p.ageMax,
              regionText: p.regionText,
              recruit: null,
              sourceUrl: p.sourceUrl,
            },
            { llm },
          );
          return r.text;
        },
      }
    : undefined;
  // 임베딩 precompute(운영자 키 있을 때만) — 1536d 정규화(Supabase pgvector용).
  const embedProvider = createGeminiEmbeddingProvider({ apiKey: geminiKey, outputDimensionality: 1536 });
  const embedder: IngestEmbedder | undefined = embedProvider
    ? { embed: (texts: string[]) => embedProvider.embed(texts) } // provider가 ≤100/콜 배치
    : undefined;

  // 캐시: SUPABASE_URL+SERVICE_KEY 있으면 Supabase, 없으면 로컬 JSON(dev).
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  const useSupabase = Boolean(supabaseUrl && supabaseKey);
  const cache: PolicyCache = useSupabase
    ? new SupabaseCache(supabaseUrl!, supabaseKey!)
    : new LocalJsonCache(CACHE_PATH);

  // 스코프 확장 P2: 전국 적재('all') + 설명·임베딩 precompute. (서울만 원하면 ONTONG_REGION=seoul)
  const regionScope = process.env.ONTONG_REGION === 'seoul' ? 'seoul' : 'all';
  const concurrency = Number(process.env.INGEST_CONCURRENCY) || 12;
  console.log(
    `[cache:${useSupabase ? 'supabase' : 'localjson'}] [embed:${embedder ? '1536' : 'off'}] ` +
      `[parse:${process.env.INGEST_PARSE === 'off' ? 'off' : 'llm'}] [region:${regionScope}] [conc:${concurrency}]`,
  );
  const result = await ingest({ client, parser, cache, now, regionScope, explainer, embedder, concurrency });

  // 커버리지: 적재된 온통(서울) 정책 vs 몽땅 fixture(어댑터 정규화).
  const ontongPolicies: Policy[] = result.policies;
  const mongttangPolicies: Policy[] = (mongttangRaw as unknown[]).map((m) =>
    normalizePolicy(mongttangToRaw(m)),
  );
  const coverage = {
    ...computeCoverage(ontongPolicies, mongttangPolicies),
    generatedAt: now,
  };

  await writeJson(COVERAGE_PATH, coverage);

  // 검수 샘플: 적재 정책의 구조화 자격 + 3청크(키 없으면 LLM off → 전 UNKNOWN).
  const parsedSample = result.policies.slice(0, 3).map((p) => ({
    id: p.id,
    title: p.title,
    parsed: p.parsed,
  }));
  await writeJson(PARSED_SAMPLE_PATH, parsedSample);

  // 콘솔 요약(키 없이 fixture 모드 확인용).
  const mode = ontongKey ? 'live' : 'fixture';
  console.log(
    `[ingest:${mode}] policies=${result.policies.length} ` +
      `droppedNoId=${result.droppedNoId} droppedUnknownRegion=${result.droppedUnknownRegion} ` +
      `droppedNonSeoul=${result.droppedNonSeoul} merged=${result.mergedDuplicates} ` +
      `suppressedCrossSource=${result.suppressedCrossSource} ` +
      `reparsed=${result.reparsed} manualCandidates=${result.dedupeManualCandidates.length}`,
  );
  console.log(
    `[coverage] matched=${coverage.matched} mongttangOnly=${coverage.mongttangOnly.length} ` +
      `manualReview=${coverage.manualReviewCandidates.length} gapRate=${coverage.gapRate.toFixed(3)}`,
  );
  console.log(`[out] ${CACHE_PATH}, ${COVERAGE_PATH}, ${PARSED_SAMPLE_PATH}`);
}

main().catch((err) => {
  console.error('[ingest] failed:', err);
  process.exitCode = 1;
});
