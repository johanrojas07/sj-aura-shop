import { Injectable } from '@nestjs/common';

import { Cart } from './utils/cart';
import { GetCartChangeDto } from './dto/cart-change.dto';
import { CartModel } from './models/cart.model';
import { prepareCart } from '../shared/utils/prepareUtils';
import { ProductsService } from '../products/products.service';

@Injectable()
export class CartService {
  constructor(private readonly productsService: ProductsService) {}

  async getCart(session: { cart?: Cart; config?: unknown } | undefined, lang: string): Promise<CartModel> {
    if (!session) {
      return prepareCart(new Cart({ items: [] }), lang, undefined, { keepAllSessionLines: true });
    }
    const { cart, config } = session;
    const savedCart = cart || new Cart({ items: [] });
    return prepareCart(savedCart, lang, config, { keepAllSessionLines: true });
  }

  async addToCart(
    session: { cart?: Cart; config?: unknown } | undefined,
    getCartChangeDto: GetCartChangeDto,
    lang: string,
  ): Promise<{ newCart; langCart }> {
    if (!session) {
      const empty = new Cart({ items: [] });
      return { newCart: empty, langCart: prepareCart(empty, lang, undefined) };
    }
    const { cart, config } = session;
    const { id } = getCartChangeDto;
    const newCart: Cart = new Cart(cart || { items: [] });
    try {
      const product = await this.productsService.getProductByIdForCart(id);
      if (product) {
        newCart.add(product, id);
      }
      return { newCart, langCart: prepareCart(newCart, lang, config) };
    } catch {
      return { newCart, langCart: prepareCart(newCart, lang, config) };
    }
  }

  async removeFromCart(
    session: { cart?: Cart; config?: unknown } | undefined,
    getCartChangeDto: GetCartChangeDto,
    lang: string,
  ): Promise<{ newCart; langCart }> {
    if (!session) {
      const empty = new Cart({ items: [] });
      return { newCart: empty, langCart: prepareCart(empty, lang, undefined) };
    }
    const { cart, config } = session;
    const { id } = getCartChangeDto;
    const newCart = new Cart(cart || { items: [] });
    try {
      const product = await this.productsService.getProductByIdForCart(id);

      if (!product) {
        const itIsInCart = newCart.check(id);

        if (itIsInCart) {
          const emptyCart = new Cart({ items: [] });
          return { newCart: emptyCart, langCart: emptyCart };
        }
      }
      newCart.remove(id);
      return { newCart, langCart: prepareCart(newCart, lang, config) };
    } catch {
      return { newCart, langCart: prepareCart(newCart, lang, config) };
    }
  }

  async setLineQty(
    session: { cart?: Cart; config?: unknown } | undefined,
    id: string,
    qtyRaw: string,
    lang: string,
  ): Promise<{ newCart: Cart; langCart: CartModel }> {
    if (!session) {
      const empty = new Cart({ items: [] });
      return { newCart: empty, langCart: prepareCart(empty, lang, undefined) };
    }
    const { cart, config } = session;
    const newCart = new Cart(cart || { items: [] });
    const parsed = Number.parseInt(String(qtyRaw ?? '').trim(), 10);
    if (!Number.isFinite(parsed)) {
      return { newCart, langCart: prepareCart(newCart, lang, config) };
    }
    const qty = Math.max(0, Math.min(999, parsed));
    const lineExists = newCart.items.some((ci) => ci.id === id);
    if (!lineExists) {
      return { newCart, langCart: prepareCart(newCart, lang, config) };
    }
    newCart.setLineQty(id, qty);
    return { newCart, langCart: prepareCart(newCart, lang, config) };
  }
}
