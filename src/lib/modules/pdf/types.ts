export interface PdfInputFile {
  id: string;
  name: string;
  size: number;
  pageCount?: number;
}

export interface PdfMergeJob {
  files: PdfInputFile[];
  outputName: string;
}

export type PdfJobStatus = 'idle' | 'processing' | 'success' | 'error';
