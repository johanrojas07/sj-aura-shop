import { Controller, Get } from '@nestjs/common';
import { FirebaseService } from './firebase.service';

@Controller('api/health')
export class FirebaseHealthController {
  constructor(private readonly firebase: FirebaseService) {}

  @Get('firebase')
  async firebaseHealth(): Promise<{
    adminReady: boolean;
    firestore: string;
    projectId?: string;
    message?: string;
  }> {
    const adminReady = this.firebase.isReady();
    if (!adminReady) {
      return {
        adminReady: false,
        firestore: 'disconnected',
        message: 'Firebase Admin no inicializado.',
      };
    }
    const chk = await this.firebase.checkFirestoreConnection();
    return {
      adminReady: true,
      firestore: chk.ok ? 'connected' : 'disconnected',
      projectId: this.firebase.getProjectId(),
      ...(chk.message && !chk.ok ? { message: chk.message } : {}),
    };
  }
}
