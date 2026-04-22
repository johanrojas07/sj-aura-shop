import {
  Controller,
  Get,
  Query,
  ValidationPipe,
  Session,
  Headers,
} from '@nestjs/common';

import { CartService } from './cart.service';
import { GetCartChangeDto } from './dto/cart-change.dto';
import { CartModel } from './models/cart.model';

@Controller('api/cart')
export class CartController {
  constructor(private cartService: CartService) {}

  @Get()
  getCart(
    @Session() session,
    @Headers('lang') lang: string,
  ): Promise<CartModel> {
    return this.cartService.getCart(session, lang);
  }

  @Get('/add')
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
