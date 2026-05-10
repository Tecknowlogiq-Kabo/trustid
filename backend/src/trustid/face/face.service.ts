import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LivenessTestResults } from '../common/interfaces/container.interface';
import type { TrustIdConfig } from '../config/trustid.config';
import { ContainerService } from '../container/container.service';
import { TrustIdHttpService } from '../http/trustid-http.service';

/**
 * FaceService — manages selfie upload and facial liveness verification.
 *
 * WHAT IS LIVENESS DETECTION?
 * TrustID uses "passive liveness detection" to verify the selfie is from a
 * real, live person — not a printed photo or a photo of a phone screen.
 *
 * "Passive" means the applicant doesn't have to do anything special (no blinking,
 * no turning their head). TrustID's AI analyses the image in the background.
 *
 * HOW IT WORKS:
 *   1. You upload a selfie using uploadApplicantPhoto()
 *   2. TrustID's AI compares it to the face on the uploaded ID document
 *   3. It also checks whether the selfie appears to be a live person
 *   4. After publishContainer() and processing, you get:
 *      - LivenessTestResults.IsLive: true if it's a real person
 *      - LivenessTestResults.Confidence: 0-100 score (higher = more confident)
 *
 * If IsLive is false, the verification outcome will be at best 'NeedsReview'
 * (never 'Passed'), because TrustID can't confirm it's a real person.
 */
@Injectable()
export class FaceService {
  constructor(
    private readonly http: TrustIdHttpService,
    private readonly containerService: ContainerService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Uploads the applicant's selfie photo to TrustID.
   *
   * This should be called BEFORE publishContainer(). Once the container is published,
   * TrustID will automatically compare this photo to the face on the uploaded ID.
   *
   * IMAGE REQUIREMENTS:
   *   - Clear, well-lit photo of the applicant's face
   *   - Face should be centred and unobstructed (no sunglasses, hats, masks)
   *   - Minimum resolution: 480×640 pixels recommended
   *   - Format: JPEG or PNG
   *
   * @param containerId - The container to attach this selfie to
   * @param photoBuffer - Raw bytes of the selfie image (taken from a file upload)
   */
  async uploadApplicantPhoto(
    containerId: string,
    photoBuffer: Buffer,
  ): Promise<void> {
    const config = this.configService.get<TrustIdConfig>('trustid')!;

    // Like document images, selfies are sent as binary data (not JSON)
    await this.http.postBinary(
      '/dataAccess/uploadApplicantPhoto/',
      photoBuffer,
      {
        __TT_ContainerId: containerId,
        __TT_DeviceId: config.deviceId,
      },
    );
  }

  /**
   * Retrieves the liveness test results for a container.
   *
   * Returns null if:
   *   - No selfie was uploaded for this container
   *   - The container hasn't been processed yet (still Pending)
   *
   * Typical usage: call this after receiving a ResultNotification webhook
   * to check whether the applicant passed the liveness check.
   *
   * @returns LivenessTestResults with IsLive (boolean) and Confidence (0-100 number),
   *          or null if liveness data isn't available
   */
  async getLivenessResults(
    containerId: string,
  ): Promise<LivenessTestResults | null> {
    const result = await this.containerService.retrieveContainer(containerId);

    // Use optional chaining (?.) because these fields may not exist if no selfie was uploaded
    return result.Container?.ApplicantPhoto?.LivenessTestResults ?? null;
  }

  /**
   * Simple boolean check: did the selfie pass liveness detection?
   * Returns false if no selfie was uploaded or if TrustID flagged it as potentially fake.
   */
  async isLive(containerId: string): Promise<boolean> {
    const liveness = await this.getLivenessResults(containerId);
    // If liveness is null (no selfie), we treat it as not live
    return liveness?.IsLive ?? false;
  }
}
