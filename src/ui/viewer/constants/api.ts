export const API_ENDPOINTS = {
  SEARCH: '/api/search',
  OBSERVATIONS: '/api/observations',
  SUMMARIES: '/api/summaries',
  PROMPTS: '/api/prompts',
  OBSERVATION_DETAIL: (id: number) => `/api/observation/${id}`,
  SESSION_DETAIL: (id: number) => `/api/session/${id}`,
  PROMPT_DETAIL: (id: number) => `/api/prompt/${id}`,
  SETTINGS: '/api/settings',
  STATS: '/api/stats',
  PROCESSING_STATUS: '/api/processing-status',
  STREAM: '/stream',
} as const;
