import { randomBytes } from 'node:crypto';

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import Stripe from 'stripe';

import { Order, OrderStatus } from './models/order.model';
import { EshopUser } from '../auth/models/user.model';
import { AuthService } from '../auth/auth.service';
import { OrderDto } from './dto/order.dto';
import { sendMsg } from '../shared/utils/email/mailer';
import { prepareCart } from '../shared/utils/prepareUtils';
import { CartModel } from '../cart/models/cart.model';
import { Translation } from '../translations/translation.model';
import { COL } from '../firebase/firebase-collections';
import { FirebaseService } from '../firebase/firebase.service';
import { docWithId } from '../firebase/firestore.utils';
import { WhatsAppOrderNotifyService } from './whatsapp-order-notify.service';

@Injectable()
export class OrdersService {
  private logger = new Logger('OrdersService');
  private stripeClient: Stripe | null = null;

  constructor(
    private readonly firebase: FirebaseService,
    private readonly whatsappOrderNotify: WhatsAppOrderNotifyService,
    private readonly authService: AuthService,
  ) {}

  private ordersCol() {
    return this.firebase.firestore.collection(COL.orders);
  }

  private getStripe(): Stripe {
    const secret = process.env.STRIPE_SECRETKEY;
    if (!secret) {
      throw new BadRequestException('Stripe no está configurado (STRIPE_SECRETKEY).');
    }
    if (!this.stripeClient) {
      this.stripeClient = new Stripe(secret, { apiVersion: '2020-08-27' });
    }
    return this.stripeClient;
  }

  private async getTranslation(lang: string): Promise<Translation | null> {
    const snap = await this.firebase.firestore
      .collection(COL.translations)
      .doc(lang)
      .get();
    if (!snap.exists) return null;
    return docWithId<Translation>(snap)!;
  }

  async getOrders(user: EshopUser): Promise<Order[]> {
    const q = await this.ordersCol().where('_user', '==', user._id).get();
    const list = q.docs.map((d) => docWithId<Order>(d)!);
    return list.sort((a, b) => (b.dateAdded ?? 0) - (a.dateAdded ?? 0));
  }

  async addOrder(
    orderDto: OrderDto,
    session,
    lang: string,
  ): Promise<{ error: string; result: Order; cart?: CartModel }> {
    const { cart, config } = session;
    const cartForLang = prepareCart(cart, lang, config);
    const orderId = await this.allocateUniqueOrderId(orderDto.phone);
    const payload = this.createOrder(
      orderDto,
      cartForLang,
      'PAYMENT_ON_DELIVERY',
      orderId,
    );
    await this.ordersCol().doc(orderId).set(payload);
    const newOrder = (await this.ordersCol().doc(orderId).get()).data() as Order;
    const fullOrder = { ...newOrder, orderId } as Order;
    try {
      const translations = await this.getTranslation(lang);
      this.sendmail(fullOrder.customerEmail, fullOrder, cartForLang, translations);
      if (process.env.ADMIN_EMAILS) {
        process.env.ADMIN_EMAILS.split(',')
          .filter(Boolean)
          .forEach((email) => {
            this.sendmail(email, fullOrder, cartForLang, translations);
          });
      }
    } catch (error: unknown) {
      const stack = error instanceof Error ? error.stack : String(error);
      this.logger.error(stack + ' Failed to send email');
    }
    void this.whatsappOrderNotify.sendOrderPendingTemplate(fullOrder);
    return { error: '', result: fullOrder };
  }

  async getAllOrders(): Promise<Order[]> {
    const snap = await this.ordersCol().get();
    return snap.docs
      .map((d) => docWithId<Order>(d)!)
      .sort((a, b) => (b.dateAdded ?? 0) - (a.dateAdded ?? 0));
  }

  async orderWithStripe(
    body,
    session,
    lang: string,
  ): Promise<{ error: string; result: Order | null; cart?: CartModel }> {
    const { cart, config } = session;
    const cartForLang = prepareCart(cart, lang, config);
    try {
      const stripe = this.getStripe();
      const charge = await stripe.charges.create({
        amount: Math.round(cartForLang.totalPrice * 100),
        currency: body.currency,
        description: 'Credit Card Payment',
        source: body.token.id,
        capture: false,
      });
      const requestOrder = { ...body, cardId: charge.id };
      const orderId = await this.allocateUniqueOrderId(requestOrder.phone);
      const payload = this.createOrder(
        requestOrder,
        cartForLang,
        'WITH_PAYMENT',
        orderId,
      );
      await this.ordersCol().doc(orderId).set(payload);
      const capturePayment = await stripe.charges.capture(charge.id);
      if (capturePayment) {
        const newOrder = (await this.ordersCol().doc(orderId).get()).data() as Order;
        const fullOrder = { ...newOrder, orderId } as Order;
        const translations = await this.getTranslation(lang);
        this.sendmail(
          fullOrder.customerEmail,
          fullOrder,
          cartForLang,
          translations,
        );
        if (process.env.ADMIN_EMAILS) {
          process.env.ADMIN_EMAILS.split(',')
            .filter(Boolean)
            .forEach((email) => {
              this.sendmail(email, fullOrder, cartForLang, translations);
            });
        }
        return { error: '', result: fullOrder };
      }
    } catch {
      return { error: 'ORDER_CREATION_FAIL', result: null };
    }
    return { error: 'ORDER_CREATION_FAIL', result: null };
  }

  async getOrderById(id: string): Promise<Order> {
    const snap = await this.ordersCol().doc(id).get();
    if (!snap.exists) {
      const q = await this.ordersCol().where('orderId', '==', id).limit(1).get();
      if (q.empty) return null as unknown as Order;
      return docWithId<Order>(q.docs[0])!;
    }
    return docWithId<Order>(snap)!;
  }

  /** Detalle: admin ve cualquier pedido; usuario solo el suyo (`_user`). */
  async getOrderForViewer(id: string, user: EshopUser): Promise<Order> {
    const order = await this.getOrderById(id);
    if (!order) {
      throw new NotFoundException('Pedido no encontrado.');
    }
    const admin = (user.roles || []).includes('admin');
    const uid = user._id;
    const owner =
      typeof (order as { _user?: string })._user === 'string' &&
      (order as { _user: string })._user === uid;
    if (admin || owner) {
      return order;
    }
    throw new ForbiddenException('No puedes ver este pedido.');
  }

  async updateOrder(reqOrder: Record<string, unknown>): Promise<Order> {
    const orderId = reqOrder.orderId as string;
    const ref = this.ordersCol().doc(orderId);
    const prevSnap = await ref.get();
    const prev = prevSnap.exists ? docWithId<Order>(prevSnap)! : null;

    await ref.set(reqOrder, { merge: true });
    let snap = await ref.get();
    let updated = docWithId<Order>(snap)!;

    const newStatus = reqOrder['status'] as OrderStatus | string | undefined;
    const userId = typeof updated._user === 'string' ? updated._user.trim() : '';
    const alreadyGranted = prev?.loyaltyPointsGranted === true;
    const wasCanceled = prev?.status === OrderStatus.CANCELED;
    const isCardOrder = updated.type === 'WITH_PAYMENT';
    const stripePaidPath =
      !isCardOrder ||
      prev?.status === OrderStatus.PAID ||
      prev?.status === OrderStatus.SHIPPING;
    if (
      newStatus === OrderStatus.COMPLETED &&
      prev?.status !== OrderStatus.COMPLETED &&
      userId &&
      !alreadyGranted &&
      !wasCanceled &&
      stripePaidPath &&
      updated.cart
    ) {
      const pts = this.loyaltyPointsForOrder(updated.cart as CartModel);
      if (pts > 0) {
        await this.authService.addLoyaltyPoints(userId, pts);
        await ref.set(
          {
            loyaltyPointsGranted: true,
            loyaltyPointsGrantedAmount: pts,
            loyaltyPointsGrantedAt: Date.now(),
          },
          { merge: true },
        );
        snap = await ref.get();
        updated = docWithId<Order>(snap)!;
      }
    }

    return updated;
  }

  /** YYYYMMDD (fecha local del servidor). */
  private orderIdDatePart(): string {
    const now = new Date();
    return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  }

  /** Últimos 4 dígitos del teléfono; si no hay suficientes, 4 caracteres hex. */
  private phoneTailDigits(phone?: string): string {
    const d = (phone || '').replace(/\D/g, '');
    if (d.length >= 4) {
      return d.slice(-4);
    }
    return randomBytes(2).toString('hex').toUpperCase();
  }

  /**
   * Ej. 20260421-3009 o, si ya existe, 20260421-3009-2, 20260421-3009-3…
   * (mismo día + mismos 4 dígitos finales del teléfono).
   */
  private async allocateUniqueOrderId(phone?: string): Promise<string> {
    const datePart = this.orderIdDatePart();
    const tail = this.phoneTailDigits(phone);
    let counter = 0;
    const maxAttempts = 800;
    while (counter < maxAttempts) {
      const candidate =
        counter === 0
          ? `${datePart}-${tail}`
          : `${datePart}-${tail}-${counter + 1}`;
      const snap = await this.ordersCol().doc(candidate).get();
      if (!snap.exists) {
        return candidate;
      }
      counter += 1;
    }
    this.logger.error('allocateUniqueOrderId: demasiados intentos, usando id aleatorio');
    return `${datePart}-${tail}-${randomBytes(3).toString('hex').toUpperCase()}`;
  }

  /** Puntos otorgados por pedido: base + 1 pt cada LOYALTY_SPEND_PER_POINT unidades de total (tope LOYALTY_MAX_POINTS). */
  private loyaltyPointsForOrder(cart: CartModel): number {
    const total = Math.max(0, Number(cart.totalPrice) || 0);
    const base = Math.max(0, Math.floor(Number(process.env.LOYALTY_BASE_POINTS) || 15));
    const step = Math.max(1, Math.floor(Number(process.env.LOYALTY_SPEND_PER_POINT) || 50));
    const cap = Math.max(base, Math.floor(Number(process.env.LOYALTY_MAX_POINTS) || 2000));
    const fromSpend = Math.floor(total / step);
    return Math.min(cap, base + fromSpend);
  }

  private async applyLoyaltyForCompletedOrder(
    userId: string | undefined,
    cart: CartModel,
  ): Promise<void> {
    const uid = typeof userId === 'string' ? userId.trim() : '';
    if (!uid) {
      return;
    }
    const pts = this.loyaltyPointsForOrder(cart);
    await this.authService.addLoyaltyPoints(uid, pts);
  }

  private createOrder = (
    orderDto: OrderDto,
    cart: CartModel,
    type: string,
    orderId: string,
  ) => {
    const { addresses, currency, email, phone, userId, cardId, notes } =
      orderDto;
    const date = Date.now();
    const addUser = userId ? { _user: userId } : {};
    const addCard = cardId ? { cardId } : {};

    return {
      orderId,
      amount: cart.totalPrice,
      currency,
      dateAdded: date,
      cart,
      status: type === 'WITH_PAYMENT' ? OrderStatus.PAID : OrderStatus.NEW,
      type,
      notes,
      customerEmail: email,
      customerPhone: phone?.trim(),
      outcome: {
        seller_message: type,
      },
      addresses,
      ...addUser,
      ...addCard,
    };
  };

  private sendmail = async (
    email: string,
    order: Order,
    cart: CartModel,
    translations: Translation | null,
  ) => {
    const emailType = {
      subject: 'Order',
      cart,
      currency: order.currency,
      orderId: order.orderId,
      address: order.addresses[0],
      notes: order.notes,
      date: new Date(),
      customerPhone: order.customerPhone,
    };

    const mailSended = await sendMsg(email, emailType, translations);
    return mailSended;
  };
}
