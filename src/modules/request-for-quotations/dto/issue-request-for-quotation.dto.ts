import { IsDateString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class IssueRequestForQuotationDto {
  @IsDateString()
  @IsNotEmpty()
  @ApiProperty()
  responseDeadline: string;
}
