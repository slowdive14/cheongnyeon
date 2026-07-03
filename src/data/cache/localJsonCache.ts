import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { CachedPolicy, PolicyCache } from './types';

/**
 * 로컬 JSON 캐시. PolicyCache 구현체(Phase 2 유일 구현체).
 * Firestore 교체 가능하도록 PolicyCache 인터페이스 뒤에 둔다.
 *
 * I/O를 가진 유일한 데이터 계층 — 순수 함수가 아니다. 그래서 ingest는 cache를
 * 주입받아 결정성을 유지한다(테스트는 인메모리 캐시 주입).
 */
export class LocalJsonCache implements PolicyCache {
  constructor(private readonly filePath: string) {}

  async readAll(): Promise<CachedPolicy[]> {
    try {
      const body = await readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(body) as unknown;
      return Array.isArray(parsed) ? (parsed as CachedPolicy[]) : [];
    } catch {
      // 파일 없음/깨짐 → 빈 스냅샷(throw 금지, 첫 적재 시나리오).
      return [];
    }
  }

  async getByHash(hash: string): Promise<CachedPolicy | null> {
    const all = await this.readAll();
    return all.find((p) => p.contentHash === hash) ?? null;
  }

  async getById(id: string): Promise<CachedPolicy | null> {
    const all = await this.readAll();
    return all.find((p) => p.id === id) ?? null;
  }

  async writeAll(policies: CachedPolicy[]): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(policies, null, 2), 'utf-8');
  }
}
