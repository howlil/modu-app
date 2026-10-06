import Dexie, { type EntityTable } from 'dexie';

export interface AppSetting {
  key: string;
  value: unknown;
}

export interface RecentModule {
  id: string;
  openedAt: number;
}

export type ModuleDatabase = Dexie & {
  settings: EntityTable<AppSetting, 'key'>;
  recentModules: EntityTable<RecentModule, 'id'>;
};

export function createModuleDatabase(): ModuleDatabase {
  const db = new Dexie('module-db') as ModuleDatabase;

  db.version(1).stores({
    settings: 'key',
    recentModules: 'id, openedAt'
  });

  return db;
}
