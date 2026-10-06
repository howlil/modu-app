export interface LocalFileRef {
  id: string;
  name: string;
  size: number;
  type: string;
}

export interface LocalFileResult {
  fileName: string;
  blob: Blob;
}
