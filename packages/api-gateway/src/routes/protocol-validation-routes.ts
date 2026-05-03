/**
 * Protocol Validation route — validates messages against protocol rules.
 * §1 Backend: Business logic in services, NOT here.
 */

import type { FastifyInstance } from 'fastify';
import { createProtocolValidationService } from '../services/architecture-services.js';
import type { Knex } from 'knex';
import { z } from 'zod';

const ValidateMessageSchema = z.object({
  connection_id: z.string().uuid(),
  message_id_primary: z.string().min(1),
  protocol_attrs: z.record(z.string(), z.unknown()).optional(),
  word_count: z.number().int().optional(),
}).strict();

export async function registerProtocolValidationRoutes(
  app: FastifyInstance,
  db: Knex,
): Promise<void> {
  const service = createProtocolValidationService(db);

  // POST /api/messages/validate — validate before creating
  app.post('/api/messages/validate', async (request, reply) => {
    const parsed = ValidateMessageSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues },
      });
    }

    const validationError = await service.validateMessage(
      parsed.data.connection_id,
      parsed.data,
    );

    if (validationError) {
      return reply.status(422).send({ error: validationError });
    }

    return { valid: true };
  });
}
