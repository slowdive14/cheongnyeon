/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 검색 Edge Function URL (`<SUPABASE_URL>/functions/v1/search`). 미설정 시 인메모리 검색(dev/degrade). */
  readonly VITE_SEARCH_FN_URL?: string;
  /** Supabase anon(publishable) 키 — 클라이언트 공개 안전(RLS 전제). */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
