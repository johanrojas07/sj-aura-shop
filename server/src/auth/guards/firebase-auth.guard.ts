import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { FirebaseService } from '../../firebase/firebase.service';
import { AuthService } from '../auth.service';

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.firebase.isReady()) {
      throw new ServiceUnavailableException(
        'Firebase Admin no está disponible. Configura GOOGLE_APPLICATION_CREDENTIALS o ADC.',
      );
    }
    const req = context.switchToHttp().getRequest();
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) {
      throw new UnauthorizedException(
        'Se requiere Authorization: Bearer <Firebase ID token>.',
      );
    }
    try {
      const decoded = await this.firebase.auth.verifyIdToken(token);
      const user = await this.authService.getOrCreateUserFromFirebase(decoded);
      req.user = user;
      return true;
    } catch (err: unknown) {
      if (
        err instanceof UnauthorizedException ||
        err instanceof ServiceUnavailableException
      ) {
        throw err;
      }
      throw new UnauthorizedException('Token inválido o expirado.');
    }
  }
}
