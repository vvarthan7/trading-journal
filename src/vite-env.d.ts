/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
  readonly VITE_SIGN_IN_PATH?: string;
  /**
   * Base URL of the FastAPI broker proxy, e.g. https://your-service.onrender.com/api.
   * Unset in dev, where Vite proxies /api to http://127.0.0.1:8000.
   * The SmartAPI credentials deliberately do NOT live here — see backend/.env.example.
   */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
