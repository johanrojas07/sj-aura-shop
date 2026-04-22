import {
  Controller,
  Get,
  UseGuards,
  Post,
  Query,
  Body,
  ValidationPipe,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import multer from 'multer';

const memoryStorage = multer.memoryStorage();

import { RolesGuard } from '../auth/roles.guard';
import { AdminService } from './admin.service';
import { Images } from './utils/images';
import { Product } from '../products/models/product.model';
import { AddProductImageDto } from './dto/add-image.dto';
import { ImageDto } from './dto/image.dto';
import { GetUser } from '../auth/utils/get-user.decorator';
import { EshopUser } from '../auth/models/user.model';

@Controller('api/admin')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get('/images')
  getImages(@GetUser() user: EshopUser): Promise<Images> {
    return this.adminService.getImages(user._id);
  }

  @Post('/images/add')
  async addImage(
    @GetUser() user: EshopUser,
    @Body() imageDto: ImageDto,
    @Query(ValidationPipe) addImageDto: AddProductImageDto,
  ): Promise<Images | Product> {
    return this.adminService.addImage(user._id, imageDto, addImageDto);
  }

  @Post('/images/upload')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage }))
  async uploadImage(
    @GetUser() user: EshopUser,
    @UploadedFile() file,
    @Query(ValidationPipe) addImageDto: AddProductImageDto,
  ): Promise<Images | Product> {
    return this.adminService.uploadImage(user._id, file, addImageDto);
  }

  @Post('/images/remove')
  async removeImage(
    @GetUser() user: EshopUser,
    @Body() imageDto: ImageDto,
    @Query(ValidationPipe) addImageDto: AddProductImageDto,
  ): Promise<Images | Product> {
    return this.adminService.removeImage(user._id, imageDto, addImageDto);
  }
}
