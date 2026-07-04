import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { CachedPolicy, PolicyCache } from './types';
import { toRow, fromRow } from './supabaseMapping';

/**
 * Supabase 구현 PolicyCache (운영). LocalJsonCache와 동일 계약 뒤.
 *  - service_role 키 사용(RLS 우회) — 인제스트(서버) 전용. 클라이언트 금지.
 *  - writeAll = upsert(onConflict id). 대량은 청크.
 *  - 순수 매핑(toRow/fromRow)은 supabaseMapping.ts(테스트). 이 파일은 실 SDK 경계 → 커버리지 제외.
 *
 * ★실 네트워크 경계: 결정적 게이트(키 0) 미도달.
 */

/* c8 ignore start -- 실 Supabase SDK 경계: 키 있는 환경 전용. */
const TABLE = 'policies';
// 청크당 벡터(3072차원) upsert + HNSW 인덱스 갱신이 문장 타임아웃에 닿지 않게 작게 유지.
const CHUNK = 100;
const WRITE_RETRIES = 3;

export class SupabaseCache implements PolicyCache {
  private client: SupabaseClient;
  private table: string;

  constructor(url: string, serviceKey: string, table = TABLE) {
    this.client = createClient(url, serviceKey, { auth: { persistSession: false } });
    this.table = table;
  }

  async readAll(): Promise<CachedPolicy[]> {
    // PostgREST 기본 행 상한(1000) 대응 — range로 페이지네이션해 전량 수집(증분 정확성).
    const PAGE = 1000;
    const all: CachedPolicy[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await this.client
        .from(this.table)
        .select('*')
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`SupabaseCache.readAll: ${error.message}`);
      const rows = data ?? [];
      for (const r of rows) all.push(fromRow(r));
      if (rows.length < PAGE) break;
    }
    return all;
  }

  async getById(id: string): Promise<CachedPolicy | null> {
    const { data, error } = await this.client
      .from(this.table)
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(`SupabaseCache.getById: ${error.message}`);
    return data ? fromRow(data) : null;
  }

  async getByHash(hash: string): Promise<CachedPolicy | null> {
    const { data, error } = await this.client
      .from(this.table)
      .select('*')
      .eq('content_hash', hash)
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`SupabaseCache.getByHash: ${error.message}`);
    return data ? fromRow(data) : null;
  }

  async writeAll(policies: CachedPolicy[]): Promise<void> {
    const rows = policies.map(toRow);
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      let lastErr = '';
      let ok = false;
      // 청크별 재시도(일시적 statement timeout·혼잡 흡수). 지수 백오프.
      for (let attempt = 0; attempt < WRITE_RETRIES; attempt += 1) {
        const { error } = await this.client.from(this.table).upsert(chunk, { onConflict: 'id' });
        if (!error) {
          ok = true;
          break;
        }
        lastErr = error.message;
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      }
      if (!ok) throw new Error(`SupabaseCache.writeAll: ${lastErr}`);
    }
  }
}
/* c8 ignore stop */
