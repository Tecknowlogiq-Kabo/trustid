export enum DocumentType {
  Passport = 1,
  DrivingLicence = 2,
  NationalId = 3,
  BRP = 4,
  Visa = 5,
}

export function parseDocumentType(label: string): DocumentType {
  switch (label) {
    case 'Passport':
      return DocumentType.Passport;
    case 'DrivingLicence':
      return DocumentType.DrivingLicence;
    case 'NationalId':
      return DocumentType.NationalId;
    case 'BRP':
      return DocumentType.BRP;
    case 'Visa':
      return DocumentType.Visa;
    default:
      throw new Error(`Unknown document type: ${label}`);
  }
}
