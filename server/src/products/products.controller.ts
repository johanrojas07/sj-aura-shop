import {
  Controller,
  Get,
  Param,
  Query,
  ValidationPipe,
  Delete,
  UseGuards,
  Post,
  Body,
  Patch,
  Headers,
} from '@nestjs/common';

import { ProductsService } from './products.service';
import { GetProductsDto } from './dto/get-products';
import { ProductsWithPagination, Product } from './models/product.model';
import { GetProductDto } from './dto/get-product';
import { Category } from './models/category.model';
import { FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { GetUser } from '../auth/utils/get-user.decorator';
import { EshopUser } from '../auth/models/user.model';

@Controller('api/products')
export class ProductsController {
  constructor(private productService: ProductsService) {}

  @Get()
  getProducts(
    @Query(ValidationPipe) getProductsDto: GetProductsDto,
    @Headers('lang') headerLang: string,
  ): Promise<ProductsWithPagination> {
    const lang = headerLang || getProductsDto.lang;
    return this.productService.getProducts(getProductsDto, lang);
  }

  @Get('/categories')
  getCategories(
    @Headers('lang') headerLang: string,
    @Query('lang') queryLang?: string,
  ): Promise<Category[]> {
    const lang = headerLang || queryLang || 'es';
    return this.productService.getCategories(lang);
  }

  @Get('/search')
  getproductsTtitles(
    @Query('query') query: string,
    @Headers('lang') headerLang: string,
    @Query('lang') queryLang?: string,
  ): Promise<string[]> {
    const lang = headerLang || queryLang || 'es';
    return this.productService.getProductsTitles(query, lang);
  }

  @Get('/search-preview')
  getSearchPreview(
    @Query('query') query: string,
    @Query('limit') limit: string,
    @Query('category') category?: string,
    @Query('categories') categories?: string,
    @Headers('lang') headerLang?: string,
    @Query('lang') queryLang?: string,
  ): Promise<Product[]> {
    const lang = headerLang || queryLang || 'es';
    const n = limit ? parseInt(limit, 10) : 10;
    return this.productService.getProductsSearchPreview(
      query,
      lang,
      n,
      category,
      categories,
    );
  }

  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Get('/all')
  getAllProducts(@Headers('lang') lang: string): Promise<Product[]> {
    return this.productService.getAllProducts(lang);
  }

  @Get('/:name')
  getProductByName(
    @Query() getProductDto: GetProductDto,
    @Param('name') name: string,
  ): Promise<Product> {
    return this.productService.getProductByName(name, getProductDto);
  }

  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Delete('/:name')
  deleteProductByName(@Param('name') name: string): Promise<void> {
    return this.productService.deleteProductByName(name);
  }

  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Post('/add')
  addProduct(@Body() productReq, @GetUser() user: EshopUser): Promise<void> {
    return this.productService.addProduct(productReq, user);
  }

  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Patch('/edit')
  editProduct(@Body() productReq): Promise<void> {
    return this.productService.editProduct(productReq);
  }

  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Get('/categories/all')
  getAllCategories(@Headers('lang') lang: string): Promise<any> {
    return this.productService.getAllCategories(lang);
  }

  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Patch('/categories/edit')
  editCategory(@Body() categoryReq): Promise<void> {
    return this.productService.editCategory(categoryReq);
  }

  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Delete('/categories/:name')
  deleteCategoryByName(@Param('name') name: string): Promise<void> {
    return this.productService.deleteCategoryByName(name);
  }
}
