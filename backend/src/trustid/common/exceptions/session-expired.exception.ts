import { TrustIdException } from './trustid.exception';

export class SessionExpiredException extends TrustIdException {
  constructor() {
    super('TrustID session expired or invalid', 401);
    this.name = 'SessionExpiredException';
  }
}
