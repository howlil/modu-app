export type ModuleLayout = 'file-transform' | 'focus';

export interface ModuleDefinition {
  id: string;
  name: string;
  description: string;
  route: string;
  layout: ModuleLayout;
}
