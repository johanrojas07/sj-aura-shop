import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class RequestMergePhoneOtpDto {
  @IsString()
  @MinLength(8)
  @MaxLength(22)
  phone: string;
}

export class ConfirmMergePhoneOtpDto extends RequestMergePhoneOtpDto {
  @IsString()
  @IsNotEmpty()
  challengeId: string;

  @IsString()
  @MinLength(4)
  @MaxLength(12)
  code: string;
}
