import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class RequestOrderPhoneOtpDto {
  @IsString()
  @IsNotEmpty()
  orderId: string;

  @IsString()
  @MinLength(8)
  @MaxLength(22)
  phone: string;
}

export class ConfirmOrderPhoneOtpDto extends RequestOrderPhoneOtpDto {
  @IsString()
  @IsNotEmpty()
  challengeId: string;

  @IsString()
  @MinLength(4)
  @MaxLength(12)
  code: string;
}
