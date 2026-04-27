const { z } = require('zod');

const messageSchema = z.object({
  role: z.string().trim().min(1),
  content: z.string().trim().min(1, 'Message content cannot be empty').max(2500, 'Message content exceeds 2,500 characters'),
});

const bodySchema = z.object({
  prompt: z.string().trim().min(1, 'Prompt cannot be empty').max(2500, 'Prompt exceeds 2,500 characters').optional(),
  messages: z.array(messageSchema).min(1, 'messages must contain at least one item').optional(),
  model: z.string().trim().min(1).optional(),
  stream: z.boolean().optional(),
}).refine((body) => {
  if (typeof body.prompt === 'string' && body.prompt.trim().length > 0) {
    return true;
  }

  if (Array.isArray(body.messages) && body.messages.length > 0) {
    return body.messages.some((message) => message.content.trim().length > 0);
  }

  return false;
}, {
  message: 'Either prompt or messages is required',
});

module.exports = (req, res, next) => {
  try {
    bodySchema.parse(req.body);
    next();
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation Error', details: err.errors });
    }
    next(err);
  }
};
