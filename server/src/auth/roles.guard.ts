import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';

@Injectable()
export class RolesGuard implements CanActivate {
  private roles = ['admin'];
  constructor() {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const roles = user?.roles ?? [];
    if (roles.filter((role) => this.roles.includes(role)).length) {
      return true;
    }

    throw new UnauthorizedException();
  }
}
