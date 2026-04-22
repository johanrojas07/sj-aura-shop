import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Session,
  Param,
  Patch,
  UnprocessableEntityException,
  Headers,
} from '@nestjs/common';
import { FirebaseAuthGuard } from '../auth/guards/firebase-auth.guard';

import { OrdersService } from './orders.service';
import { GetUser } from '../auth/utils/get-user.decorator';
import { EshopUser } from '../auth/models/user.model';
import { OrderDto } from './dto/order.dto';
import { Order } from './models/order.model';
import { RolesGuard } from '../auth/roles.guard';
import { Cart } from '../cart/utils/cart';
import { prepareCart } from '../shared/utils/prepareUtils';

@Controller('api/orders')
export class OrdersController {
  constructor(private ordersService: OrdersService) {}

  @UseGuards(FirebaseAuthGuard)
  @Get()
  getOrders(@GetUser() user: EshopUser) {
    return this.ordersService.getOrders(user);
  }

  @Post('/add')
  async addOrder(
    @Body() orderDto: OrderDto,
    @Session() session,
    @Headers('lang') lang: string,
  ): Promise<{ error: string; result: Order; cart: any }> {
    try {
      const successResult = await this.ordersService.addOrder(
        orderDto,
        session,
        lang,
      );
      if (successResult && !successResult.error) {
        const emptyCart = new Cart({ items: [] });
        session.cart = emptyCart;
        return { ...successResult, cart: emptyCart };
      } else {
        return {
          ...successResult,
          cart: prepareCart(session.cart, lang, session.config),
        };
      }
    } catch (e) {
      throw new UnprocessableEntityException();
    }
  }

  @Post('/stripe')
  async orderWithStripe(
    @Body() body,
    @Session() session,
    @Headers('lang') lang: string,
  ): Promise<{ error: string; result: Order; cart: any }> {
    try {
      const successResult = await this.ordersService.orderWithStripe(
        body,
        session,
        lang,
      );

      if (successResult && !successResult.error) {
        const emptyCart = new Cart({ items: [] });
        session.cart = emptyCart;
        return { ...successResult, cart: emptyCart };
      } else {
        return {
          ...successResult,
          cart: prepareCart(session.cart, lang, session.config),
        };
      }
    } catch (e) {
      throw new UnprocessableEntityException();
    }
  }

  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Get('/all')
  getAllOrders() {
    return this.ordersService.getAllOrders();
  }

  /** Detalle: dueño del pedido o administrador (no solo admin). */
  @UseGuards(FirebaseAuthGuard)
  @Get('/:id')
  getOrderForViewer(@Param('id') id: string, @GetUser() user: EshopUser) {
    return this.ordersService.getOrderForViewer(id, user);
  }

  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Patch()
  updateOrder(@Body() order) {
    return this.ordersService.updateOrder(order);
  }
}
