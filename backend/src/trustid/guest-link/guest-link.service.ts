import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TrustIdHttpService } from '../http/trustid-http.service';
import { TrustIdConfig } from '../config/trustid.config';
import { CreateGuestLinkDto } from '../common/dto/create-guest-link.dto';
import { GuestLinkResponse } from '../common/interfaces/container.interface';

@Injectable()
export class GuestLinkService {
  constructor(
    private readonly http: TrustIdHttpService,
    private readonly configService: ConfigService,
  ) {}

  async createGuestLink(dto: CreateGuestLinkDto): Promise<GuestLinkResponse> {
    const config = this.configService.get<TrustIdConfig>('trustid')!;

    return this.http.post<GuestLinkResponse>('/guestLink/createGuestLink/', {
      DeviceId: config.deviceId,
      ContainerId: dto.containerId,
      RedirectUrl: dto.redirectUrl,
      ExpiryMinutes: dto.expiryMinutes,
    });
  }
}
