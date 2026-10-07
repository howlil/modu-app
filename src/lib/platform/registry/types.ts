export type ModuleLayout = 'file-transform' | 'focus';

export interface ModuleDefinition {
  id: string;
  name: string;
  route: string;
  layout: ModuleLayout;
}
