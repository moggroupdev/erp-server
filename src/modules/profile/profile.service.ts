import bcrypt from 'bcryptjs';
import { and, eq, isNull } from 'drizzle-orm';
import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import { users } from 'src/database/schema';
import { type User } from 'src/utils/types';
import { translate } from 'src/utils/i18n/translate';
import { UpdatePasswordDto } from './dto/update-password.dto';

@Injectable()
export class ProfileService {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  public async get(userId: string) {
    const user = await this.db.query.users.findFirst({
      where: and(eq(users.id, userId), isNull(users.deletedAt)),
      columns: { password: false },
      with: { createdBy: { columns: { id: true, name: true } } },
    });

    if (!user)
      throw new UnauthorizedException(
        translate('Access denied: User does not exist.', 'تم رفض الوصول: المستخدم غير موجود.'),
      );

    return user;
  }

  public async updatePassword(user: User, dto: UpdatePasswordDto) {
    if (!user.password)
      throw new UnauthorizedException(translate('Invalid credentials.', 'بيانات الاعتماد غير صحيحة.'));

    const isCurrentValid = await bcrypt.compare(dto.currentPassword, user.password);
    if (!isCurrentValid)
      throw new UnauthorizedException(translate('Invalid credentials.', 'بيانات الاعتماد غير صحيحة.'));

    if (dto.newPassword === dto.currentPassword)
      throw new BadRequestException(
        translate(
          'New password must be different from the current password.',
          'يجب أن تكون كلمة المرور الجديدة مختلفة عن كلمة المرور الحالية.',
        ),
      );

    const hashedPassword = await bcrypt.hash(dto.newPassword, 12);

    const [updated] = await this.db
      .update(users)
      .set({ password: hashedPassword })
      .where(and(eq(users.id, user.id), isNull(users.deletedAt)))
      .returning({ id: users.id });

    if (!updated)
      throw new UnauthorizedException(
        translate('Access denied: User does not exist.', 'تم رفض الوصول: المستخدم غير موجود.'),
      );

    return {
      message: translate('Password updated successfully.', 'تم تحديث كلمة المرور بنجاح.'),
    };
  }
}
