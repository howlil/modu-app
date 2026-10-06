export type ModuleCategory = 'files' | 'images' | 'developer' | 'productivity';

export type ModuleLayout =
  | 'file-transform'
  | 'text-transform'
  | 'generator'
  | 'focus';

export type ModuleCapability = 'storage' | 'files' | 'worker' | 'offline';

export interface ModuleDefinition {
  id: string;
  name: string;
  description: string;
  route: string;
  primaryCategory: ModuleCategory;
  group?: string;
  keywords: string[];
  tags: string[];
  layout: ModuleLayout;
  capabilities: ModuleCapability[];
  related?: string[];
}

export interface ModuleCategoryDefinition {
  id: ModuleCategory;
  name: string;
  description: string;
  route: string;
}
