export const cachePolicy = {
  shell: 'precache',
  lightweightModules: 'cache-when-visited',
  heavyEngines: 'cache-after-first-use',
  userData: 'never-cache-api'
} as const;
