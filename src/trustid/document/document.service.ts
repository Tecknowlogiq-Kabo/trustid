import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CreateDocumentDto } from '../common/dto/create-document.dto';
import { ImageType } from '../common/enums/image-type.enum';
import type {
  CreateDocumentResponse,
  UploadImageResponse,
} from '../common/interfaces/container.interface';
import type { TrustIdConfig } from '../config/trustid.config';
import { TrustIdHttpService } from '../http/trustid-http.service';

/**
 * DocumentService — manages identity document records and image uploads within a container.
 *
 * TERMINOLOGY:
 *   Container = the top-level case (managed by ContainerService)
 *   Document  = a specific ID document inside the container (e.g. "a UK Passport")
 *   Image     = the actual photo of the document (front or back side)
 *
 * A single container can hold multiple documents (rare, but possible for
 * Right to Work checks where someone might provide both a passport and a visa).
 *
 * TYPICAL SEQUENCE:
 *   1. createDocument(containerId, DocumentType.Passport) → get DocumentId
 *   2. uploadFrontImage(containerId, documentId, frontBuffer)
 *   3. uploadBackImage(containerId, documentId, backBuffer) — only for two-sided docs
 *
 * Two-sided documents (require front AND back):
 *   - EU/EEA National ID Cards
 *   - UK Biometric Residence Permits (BRP)
 *   - Some driving licences
 *
 * Single-sided documents (front only is fine):
 *   - Passports (the photo page only)
 *   - UK driving licences (DVLA sends a full-face scan of the front)
 */
@Injectable()
export class DocumentService {
  constructor(
    private readonly http: TrustIdHttpService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Registers a document record inside a container.
   * This tells TrustID what type of ID to expect, which helps their AI know
   * what fields to extract (passport number, MRZ, etc.).
   *
   * Must be called BEFORE uploading any images — you need the DocumentId first.
   *
   * @param dto.containerId - The container this document belongs to
   * @param dto.documentType - Passport, DrivingLicence, NationalId, etc. (see DocumentType enum)
   * @param dto.mrz - Optional: the Machine-Readable Zone string if you've already read it
   *                   (e.g. from a chip reader). If omitted, TrustID will OCR it from the image.
   * @returns DocumentId — required for all subsequent image upload calls
   */
  async createDocument(
    dto: CreateDocumentDto,
  ): Promise<CreateDocumentResponse> {
    const config = this.configService.get<TrustIdConfig>('trustid')!;

    return this.http.post<CreateDocumentResponse>(
      '/dataAccess/createDocument/',
      {
        DeviceId: config.deviceId,
        ContainerId: dto.containerId,
        DocumentType: dto.documentType,
        Mrz: dto.mrz, // omitted from the request body if undefined
      },
    );
  }

  /**
   * Uploads a photo of the front face of the identity document.
   *
   * IMAGE REQUIREMENTS (from TrustID docs):
   *   - Format: JPEG or PNG
   *   - Resolution: at least 300 DPI is recommended
   *   - The whole document should be visible with no cut-off edges
   *   - Avoid glare, blur, or shadows covering the text/photo
   *
   * The image is sent as raw binary bytes (application/octet-stream), not base64.
   * This is more efficient for large image files.
   */
  async uploadFrontImage(
    containerId: string,
    documentId: string,
    imageBuffer: Buffer,
  ): Promise<UploadImageResponse> {
    return this.uploadImage(
      containerId,
      documentId,
      ImageType.DocumentFront,
      imageBuffer,
    );
  }

  /**
   * Uploads a photo of the back of the identity document.
   * Only needed for two-sided documents (EU ID cards, BRP cards, etc.).
   * Sending a back image for a passport won't cause an error but isn't necessary.
   */
  async uploadBackImage(
    containerId: string,
    documentId: string,
    imageBuffer: Buffer,
  ): Promise<UploadImageResponse> {
    return this.uploadImage(
      containerId,
      documentId,
      ImageType.DocumentBack,
      imageBuffer,
    );
  }

  /**
   * Fetches the details of a specific document from TrustID.
   * Returns the raw JSON document object including extracted fields and validation results.
   * Typically you'd call retrieveContainer() instead to get everything at once.
   */
  async retrieveDocument(
    containerId: string,
    documentId: string,
  ): Promise<unknown> {
    const config = this.configService.get<TrustIdConfig>('trustid')!;

    return this.http.post('/dataAccess/retrieveDocument/', {
      DeviceId: config.deviceId,
      ContainerId: containerId,
      DocumentId: documentId,
    });
  }

  /**
   * Downloads a previously uploaded image from TrustID.
   * Returns the raw image bytes as a Buffer.
   *
   * @param imageType - Which side to retrieve: DocumentFront or DocumentBack
   */
  async retrieveImage(
    containerId: string,
    documentId: string,
    imageType: ImageType,
  ): Promise<Buffer> {
    const config = this.configService.get<TrustIdConfig>('trustid')!;

    const data = await this.http.post<Buffer>('/dataAccess/retrieveImage/', {
      DeviceId: config.deviceId,
      ContainerId: containerId,
      DocumentId: documentId,
      ImageType: imageType,
    });

    // Normalise to Buffer regardless of how Axios returns the binary response
    return Buffer.isBuffer(data) ? data : Buffer.from(data, 'binary');
  }

  /**
   * Internal method shared by uploadFrontImage and uploadBackImage.
   * Handles the binary upload mechanics — the public methods just provide
   * the correct ImageType enum value.
   *
   * KEY DETAIL: TrustID image uploads work differently from normal JSON requests:
   *   - The body is raw binary data (the image bytes), NOT JSON
   *   - The Content-Type header must be 'application/octet-stream'
   *   - Metadata (container ID, document ID, image type) goes in the URL query string
   *
   * TrustIdHttpService.postBinary() handles these specifics automatically.
   */
  private async uploadImage(
    containerId: string,
    documentId: string,
    imageType: ImageType,
    imageBuffer: Buffer,
  ): Promise<UploadImageResponse> {
    const config = this.configService.get<TrustIdConfig>('trustid')!;

    const data = await this.http.postBinary(
      '/dataAccess/uploadImage/',
      imageBuffer,
      {
        // These query params tell TrustID which container, document, and side this image belongs to
        __TT_ContainerId: containerId,
        __TT_DocumentId: documentId,
        __TT_ImageType: imageType, // 'DocumentFront' or 'DocumentBack'
        __TT_DeviceId: config.deviceId,
      },
    );

    return data as UploadImageResponse;
  }
}
