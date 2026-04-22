import { Injectable, Logger } from '@nestjs/common';

import type { Order } from './models/order.model';

/**
 * Notificación al cliente tras crear un pedido (WhatsApp Business / Cloud API).
 *
 * Flujo oficial Meta: el primer mensaje a un número suele exigir una plantilla
 * aprobada. Crea en Meta Business Manager una plantilla con UN cuerpo variable
 * {{1}} (texto) y pon su nombre en WHATSAPP_ORDER_TEMPLATE_NAME.
 *
 * Sin token / phone_number_id / nombre de plantilla: solo se registra en log
 * un enlace wa.me útil para pruebas o envío manual.
 */
@Injectable()
export class WhatsAppOrderNotifyService {
  private readonly logger = new Logger(WhatsAppOrderNotifyService.name);

  /** Dígitos internacionales sin + (ej. 573001234567). */
  normalizeToDigits(input: string | undefined): string | null {
    const d = (input || '').replace(/\D/g, '');
    if (d.length < 8) {
      return null;
    }
    if (d.length === 10 && d.startsWith('3')) {
      return `57${d}`;
    }
    return d;
  }

  /** Enlace para abrir WhatsApp con texto prellenado (no sustituye la API). */
  buildWaMeCustomerUrl(order: Order): string | null {
    const to = this.normalizeToDigits(order.customerPhone);
    if (!to) {
      return null;
    }
    const text = `Hola, confirmo mi pedido ${order.orderId} (${order.currency} ${order.amount}).`;
    return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
  }

  /**
   * Envía plantilla aprobada al teléfono del cliente (Cloud API).
   * La plantilla debe tener exactamente 1 variable de cuerpo {{1}}.
   */
  async sendOrderPendingTemplate(order: Order): Promise<void> {
    const to = this.normalizeToDigits(order.customerPhone);
    if (!to) {
      this.logger.warn('WhatsApp: teléfono del cliente no válido; omitido.');
      return;
    }

    const token = process.env.WHATSAPP_CLOUD_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID;
    const templateName = process.env.WHATSAPP_ORDER_TEMPLATE_NAME;

    if (!token || !phoneNumberId || !templateName) {
      const link = this.buildWaMeCustomerUrl(order);
      if (link) {
        this.logger.log(
          'WhatsApp Cloud API no configurada (WHATSAPP_*). Enlace manual / prueba: ' +
            link,
        );
      }
      return;
    }

    const version = process.env.WHATSAPP_GRAPH_API_VERSION || 'v21.0';
    const lang = process.env.WHATSAPP_ORDER_TEMPLATE_LANG || 'es';
    const summary = `${order.orderId} · ${order.amount} ${order.currency}`;

    const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;
    const body = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: lang },
        components: [
          {
            type: 'body',
            parameters: [{ type: 'text', text: summary }],
          },
        ],
      },
    };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const json: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        this.logger.warn(
          `WhatsApp API HTTP ${res.status}: ${JSON.stringify(json)}`,
        );
      } else {
        this.logger.log(`WhatsApp: plantilla enviada a ${to}`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`WhatsApp fetch error: ${msg}`);
    }
  }
}
