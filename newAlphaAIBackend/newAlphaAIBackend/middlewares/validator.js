const { z } = require('zod');

// Schema requires a string prompt, not empty, and max 2500 chars.
const promptSchema = z.object({
  prompt: z.string().trim().min(1, 'Prompt cannot be empty').max(2500, 'Prompt exceeds 2,500 characters')
});

module.exports = (req, res, next) => {
  try {
    // We only care about validating the body.prompt
    promptSchema.parse(req.body);
    next();
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation Error', details: err.errors });
    }
    next(err);
  }
};
