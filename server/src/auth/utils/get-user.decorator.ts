import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { EshopUser } from '../models/user.model';

export const GetUser = createParamDecorator(
  (_data, ctx: ExecutionContext): EshopUser => {
    const req = ctx.switchToHttp().getRequest();
    return req.user;
  },
);
