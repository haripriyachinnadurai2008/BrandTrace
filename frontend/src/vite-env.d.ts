/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_ALLOW_ROLE_SWITCHER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

