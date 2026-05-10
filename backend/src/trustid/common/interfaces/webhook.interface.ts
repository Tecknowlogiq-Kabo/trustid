export interface WebhookCallback {
  CallbackId: string;
  WorkflowName: string;
  WorkflowState: string;
  CallbackAt: string;
  CallbackUrl: string;
  RetryCounter: number;
  ErrorMessage?: string;
  WorkflowStorage: {
    ContainerId: string;
  };
}

export interface WebhookPayload {
  Callback: WebhookCallback;
  Response: {
    Success: boolean;
    Message: string;
    ContainerId: string;
    AutoReferred?: boolean;
  };
}
