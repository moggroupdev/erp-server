import { Request } from 'express';
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { REQUEST_USER_KEY } from 'src/utils/constants';
import { User } from 'src/utils/types';

/**
 * A custom **parameter decorator** to extract the current authenticated user from the request.
 *
 * This decorator retrieves the JWT payload that was previously attached to the request
 * object (typically by an authentication guard) and makes it available as a route handler parameter.
 *
 * @returns {User} The current authenticated user
 *
 */
export const RequestUser = createParamDecorator((data, context: ExecutionContext): User => {
  const request = context.switchToHttp().getRequest<Request & { [REQUEST_USER_KEY]: User }>();
  return request[REQUEST_USER_KEY];
});
