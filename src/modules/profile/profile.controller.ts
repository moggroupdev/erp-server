import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { type User } from 'src/utils/types';
import { AccessTokenGuard } from 'src/modules/auth/guards/access-token.guard';
import { RequestUser } from 'src/modules/auth/decorators/request-user.decorator';
import { ProfileService } from './profile.service';
import { UpdatePasswordDto } from './dto/update-password.dto';

@Controller('profile')
@UseGuards(AccessTokenGuard)
@ApiBearerAuth()
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  get(@RequestUser() user: User) {
    return this.profileService.get(user.id);
  }

  @Put('password')
  updatePassword(@RequestUser() user: User, @Body() dto: UpdatePasswordDto) {
    return this.profileService.updatePassword(user, dto);
  }
}
