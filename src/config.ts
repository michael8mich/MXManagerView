export type RuntimeConfig = {
  MFLOW_BASE_URL: string;
  MX_USE_REMOTE_API: string;
  MX_QUERY_URL: string;
  MX_WEBAPP_PROXY_URL: string;
  MX_PAGE_SIZE: number;
};

export let runtimeConfig: RuntimeConfig | null = null;

function getConfigFile(): string {
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    return '/mxmanv/config.local.json';
  }
  return '/mxmanv/config.prod.json';
}

export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  if (runtimeConfig) return runtimeConfig;
  let res = await fetch(getConfigFile());
  if (!res.ok) {
    // fallback to config.json
    res = await fetch('/mxmanv/config.json');
    if (!res.ok) throw new Error('Failed to load config.json');
  }
  const json = await res.json();

  // Always load MFLOW_BASE_URL from public config.json
  let mflowRes = await fetch('/mxmanv/config.json');
  let mflowJson = json;
  if (mflowRes.ok) {
    mflowJson = await mflowRes.json();
  }

  runtimeConfig = {
    MFLOW_BASE_URL: mflowJson.MFLOW_BASE_URL,
    MX_USE_REMOTE_API: json.MX_USE_REMOTE_API,
    MX_QUERY_URL: json.MX_QUERY_URL,
    MX_WEBAPP_PROXY_URL: json.MX_WEBAPP_PROXY_URL,
    MX_PAGE_SIZE: Number(json.MX_PAGE_SIZE)
  };
  return runtimeConfig;
}
