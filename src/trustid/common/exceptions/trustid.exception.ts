export class TrustIdException extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 502,
    public readonly trustIdError?: unknown,
  ) {
    super(message);
    this.name = 'TrustIdException';
  }
}
