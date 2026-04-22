import { Global, Module } from '@nestjs/common';
import { FirebaseService } from './firebase.service';
import { FirebaseHealthController } from './firebase-health.controller';

@Global()
@Module({
  controllers: [FirebaseHealthController],
  providers: [FirebaseService],
  exports: [FirebaseService],
})
export class FirebaseModule {}
