import { Injectable } from '@nestjs/common';

import { Cart } from './utils/cart';
import { GetCartChangeDto } from './dto/cart-change.dto';
import type { CartSyncLine } from './dto/sync-cart.dto';
import { CartModel } from './models/cart.model';
import { prepareCart } from '../shared/utils/prepareUtils';
import { ProductsService } from '../products/products.service';

const CART_PREPARE_OPTS = { keepAllSessionLines: true } as const;

const CART_SYNC_MAX_LINES = 80;

@Injectable()
export class CartService {
  constructor(private readonly productsService: ProductsService) {}

  /**
   * Sustituye el carrito en memoria a partir de líneas id+qty. Una sola petición coherente;
   * no depende de que el GET/ADD anterior haya reutilizado la misma sesión en el servidor.
   */
  async syncFromLines(
    session: { cart?: Cart; config?: unknown } | undefined,
    rawLines: CartSyncLine[] | null | undefined,
    lang: string,
  ): Promise<{ newCart: Cart; langCart: CartModel }> {
    if (!session) {
      const empty = new Cart({ items: [] });
      return { newCart: empty, langCart: prepareCart(empty, lang, undefined, CART_PREPARE_OPTS) };
    }
    const { config } = session;
    const list = Array.isArray(rawLines) ? rawLines : [];
    const byId = new Map<string, number>();
    for (const row of list) {
      const id = String((row as CartSyncLine)?.id ?? '').trim();
      if (!id) {
        continue;
      }
      const q = Math.max(0, Math.min(999, Math.floor(Number((row as CartSyncLine)?.qty) || 0)));
      if (q <= 0) {
        continue;
      }
      byId.set(id, q);
      if (byId.size > CART_SYNC_MAX_LINES) {
        break;
      }
    }
    const newCart = new Cart({ items: [] });
    for (const [id, qty] of byId) {
      try {
        const product = await this.productsService.getProductByIdForCart(id);
        if (!product) {
          continue;
        }
        newCart.add(product, id);
        if (qty > 1) {
          newCart.setLineQty(id, qty);
        }
      } catch {
        /* omitir línea */ void 0;
      }
    }
    return { newCart, langCart: prepareCart(newCart, lang, config, CART_PREPARE_OPTS) };
  }

  async getCart(session: { cart?: Cart; config?: unknown } | undefined, lang: string): Promise<CartModel> {
    if (!session) {
      return prepareCart(new Cart({ items: [] }), lang, undefined, CART_PREPARE_OPTS);
    }
    const { cart, config } = session;
    const savedCart = cart || new Cart({ items: [] });
    return prepareCart(savedCart, lang, config, CART_PREPARE_OPTS);
  }

  async addToCart(
    session: { cart?: Cart; config?: unknown } | undefined,
    getCartChangeDto: GetCartChangeDto,
    lang: string,
  ): Promise<{ newCart; langCart }> {
    if (!session) {
      const empty = new Cart({ items: [] });
      return { newCart: empty, langCart: prepareCart(empty, lang, undefined, CART_PREPARE_OPTS) };
    }
    const { cart, config } = session;
    const { id } = getCartChangeDto;
    const newCart: Cart = new Cart(cart || { items: [] });
    try {
      const product = await this.productsService.getProductByIdForCart(id);
      if (product) {
        newCart.add(product, id);
      }
      return { newCart, langCart: prepareCart(newCart, lang, config, CART_PREPARE_OPTS) };
    } catch {
      return { newCart, langCart: prepareCart(newCart, lang, config, CART_PREPARE_OPTS) };
    }
  }

  async removeFromCart(
    session: { cart?: Cart; config?: unknown } | undefined,
    getCartChangeDto: GetCartChangeDto,
    lang: string,
  ): Promise<{ newCart; langCart }> {
    if (!session) {
      const empty = new Cart({ items: [] });
      return { newCart: empty, langCart: prepareCart(empty, lang, undefined, CART_PREPARE_OPTS) };
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
          return { newCart: emptyCart, langCart: prepareCart(emptyCart, lang, config, CART_PREPARE_OPTS) };
        }
      }
      newCart.remove(id);
      return { newCart, langCart: prepareCart(newCart, lang, config, CART_PREPARE_OPTS) };
    } catch {
      return { newCart, langCart: prepareCart(newCart, lang, config, CART_PREPARE_OPTS) };
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
      return { newCart: empty, langCart: prepareCart(empty, lang, undefined, CART_PREPARE_OPTS) };
    }
    const { cart, config } = session;
    const newCart = new Cart(cart || { items: [] });
    const parsed = Number.parseInt(String(qtyRaw ?? '').trim(), 10);
    if (!Number.isFinite(parsed)) {
      return { newCart, langCart: prepareCart(newCart, lang, config, CART_PREPARE_OPTS) };
    }
    const qty = Math.max(0, Math.min(999, parsed));
    const lineExists = newCart.items.some((ci) => ci.id === id);
    if (!lineExists) {
      return { newCart, langCart: prepareCart(newCart, lang, config, CART_PREPARE_OPTS) };
    }
    newCart.setLineQty(id, qty);
    return { newCart, langCart: prepareCart(newCart, lang, config, CART_PREPARE_OPTS) };
  }
}
