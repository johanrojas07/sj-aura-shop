import {
  Body,
  Controller,
  Get,
  Header,
  Post,
  Query,
  ValidationPipe,
  Session,
  Headers,
} from '@nestjs/common';

import { CartService } from './cart.service';
import { GetCartChangeDto } from './dto/cart-change.dto';
import type { CartSyncBody } from './dto/sync-cart.dto';
import { CartModel } from './models/cart.model';

@Controller('api/cart')
export class CartController {
  constructor(private cartService: CartService) {}

  @Get()
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  getCart(
    @Session() session,
    @Headers('lang') lang: string,
  ): Promise<CartModel> {
    return this.cartService.getCart(session, (lang && String(lang).trim()) || 'es');
  }

  /** Sincroniza el carrito completo en un POST (líneas id+qty). Robusto si la sesión no se reutiliza entre peticiones. */
  @Post('/sync')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  async syncCart(
    @Session() session,
    @Body() body: CartSyncBody,
    @Headers('lang') lang: string,
  ): Promise<CartModel> {
    const lines = Array.isArray(body?.lines) ? body!.lines! : [];
    const { newCart, langCart } = await this.cartService.syncFromLines(
      session,
      lines,
      (lang && String(lang).trim()) || 'es',
    );
    if (session) {
      session.cart = newCart;
    }
    return langCart;
  }

  @Get('/add')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  async addToCart(
    @Session() session,
    @Query(ValidationPipe) getCartChangeDto: GetCartChangeDto,
    @Headers('lang') lang: string,
  ): Promise<CartModel> {
    const { newCart, langCart } = await this.cartService.addToCart(
      session,
      getCartChangeDto,
      lang,
    );
    if (session) {
      session.cart = newCart;
    }
    return langCart;
  }

  @Get('/remove')
  async removeFromCart(
    @Session() session,
    @Query(ValidationPipe) getCartChangeDto: GetCartChangeDto,
    @Headers('lang') lang: string,
  ): Promise<CartModel> {
    const { newCart, langCart } = await this.cartService.removeFromCart(
      session,
      getCartChangeDto,
      lang,
    );
    if (session) {
      session.cart = newCart;
    }
    return langCart;
  }

  /** Establece la cantidad de una línea (0 = quitar) en una sola petición. */
  @Get('/line-qty')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  async setLineQty(
    @Session() session,
    @Query('id') id: string,
    @Query('qty') qty: string,
    @Headers('lang') lang: string,
  ): Promise<CartModel> {
    const { newCart, langCart } = await this.cartService.setLineQty(session, id, qty, lang);
    if (session) {
      session.cart = newCart;
    }
    return langCart;
  }
}
