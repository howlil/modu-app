export interface WorkerRequest<TPayload = unknown> {
  id: string;
  type: string;
  payload: TPayload;
}

export type WorkerResponse<TResult = unknown> =
  | {
      id: string;
      status: 'progress';
      progress: number;
    }
  | {
      id: string;
      status: 'success';
      result: TResult;
    }
  | {
      id: string;
      status: 'error';
      message: string;
    };
