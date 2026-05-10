import { ContainerStatus } from './container-status.enum';

export enum VerificationStatus {
  Draft = 'Draft',
  Submitted = 'Submitted',
  Complete = 'Complete',
}

export function toVerificationStatus(s: ContainerStatus): VerificationStatus {
  switch (s) {
    case ContainerStatus.Temp:
      return VerificationStatus.Draft;
    case ContainerStatus.Pending:
      return VerificationStatus.Submitted;
    case ContainerStatus.Archive:
      return VerificationStatus.Complete;
  }
}
