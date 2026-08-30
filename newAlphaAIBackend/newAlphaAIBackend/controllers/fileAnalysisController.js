const { z } = require('zod');
const path = require('node:path');
const AIService = require('../services/AIService');
const { extractFile } = require('../services/FileExtractionService');
const { resolveFileType } = require('../services/fileTypes');
const { SYSTEM_PROMPT, buildUserPrompt } = require('../services/orgChartFilePrompt');
const FileImportError = require('../errors/FileImportError');
const logger = require('../utils/logger');
const config = require('../config');

const nodeSchema = z.lazy(() => z.object({
  id: z.string().trim().min(1).max(160),
  name: z.string().max(500),
  rank: z.string().max(500),
  role: z.string().max(1000),
  personalNumber: z.string().max(100),
  imageUrl: z.string().max(2000),
  children: z.array(nodeSchema).max(200),
}).strict());

const responseSchema = z.object({
  nodes: z.array(nodeSchema).min(1).max(500),
  warnings: z.array(z.string().max(2000)).max(100),
  summary: z.string().max(4000),
}).strict();

function parseModelResponse(content) {
  const trimmed = String(content || '').trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  let parsed;
  try {
    parsed = JSON.parse(withoutFence);
  } catch {
    throw new FileImportError('INVALID_AI_RESPONSE', 'The AI response was not valid JSON.', 502);
  }
  const result = responseSchema.safeParse(parsed);
  if (!result.success) {
    throw new FileImportError('INVALID_ORG_CHART_STRUCTURE', 'The AI response did not contain a valid Org Chart structure.', 502);
  }

  const seen = new Set();
  let nodeCount = 0;
  const visit = (nodes, depth) => {
    if (depth > 20) {
      throw new FileImportError('INVALID_ORG_CHART_STRUCTURE', 'The extracted Org Chart is too deeply nested.', 502);
    }
    nodes.forEach((node) => {
      nodeCount += 1;
      if (nodeCount > 500 || seen.has(node.id)) {
        throw new FileImportError('INVALID_ORG_CHART_STRUCTURE', 'The extracted Org Chart has too many or duplicate nodes.', 502);
      }
      seen.add(node.id);
      visit(node.children, depth + 1);
    });
  };
  visit(result.data.nodes, 1);
  return { ...result.data, nodeCount };
}

function logStage(event, req, metadata = {}) {
  logger.info(event, {
    requestId: req.requestId,
    ...metadata,
  });
}

async function withTimeout(promise, timeoutMs) {
  let timeoutId;
  const timeout = new Promise((resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(new FileImportError('TIMEOUT', 'File extraction timed out.', 504));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
}

exports.handleFileAnalysis = async (req, res, next) => {
  let stage = 'received';
  const startedAt = Date.now();
  try {
    if (!req.file) {
      throw new FileImportError('MALFORMED_FILE', 'A file is required.', 400);
    }
    const requestedModel = String(req.body?.model || '').trim();
    if (!requestedModel) {
      throw new FileImportError('FILE_MODEL_NOT_CONFIGURED', 'A dedicated file-capable model is required.', 400);
    }
    if (requestedModel.length > 160) {
      throw new FileImportError('FILE_MODEL_NOT_CONFIGURED', 'The requested model identifier is invalid.', 400);
    }
    const instruction = String(req.body?.instruction || '').trim();
    if (instruction.length > 4000) {
      throw new FileImportError('MALFORMED_FILE', 'The optional instruction is too long.', 400);
    }

    const originalExtension = path.extname(path.basename(String(req.file.originalname || ''))).toLowerCase();
    logStage('AI_FILE_IMPORT_RECEIVED', req, {
      extension: originalExtension,
      mimeType: req.file.mimetype,
      byteSize: req.file.size,
      requestedModel,
    });
    const fileType = resolveFileType(req.file);
    stage = 'validated';
    logStage('AI_FILE_VALIDATED', req, {
      extension: fileType.extension,
      mimeType: req.file.mimetype,
      byteSize: req.file.size,
      extractionStrategy: fileType.strategy,
    });

    const extractionStartedAt = Date.now();
    stage = 'extraction';
    logStage('AI_FILE_EXTRACTION_STARTED', req, { extractionStrategy: fileType.strategy });
    const extraction = await withTimeout(
      extractFile(req.file, fileType),
      config.ai.fileImportTimeoutMs,
    );
    logStage('AI_FILE_EXTRACTION_COMPLETED', req, {
      extractionStrategy: fileType.strategy,
      extractedCharacterCount: extraction.text?.length || 0,
      pageCount: extraction.metadata?.pageCount,
      sheetCount: extraction.metadata?.sheetCount,
      durationMs: Date.now() - extractionStartedAt,
    });

    const modelStartedAt = Date.now();
    stage = 'model_request';
    const prompt = buildUserPrompt(extraction.text, instruction);
    logStage('AI_FILE_MODEL_REQUEST_STARTED', req, { requestedModel });
    let modelResult;
    try {
      modelResult = await AIService.fetchFileAnalysis(
        requestedModel,
        SYSTEM_PROMPT,
        prompt,
        extraction.attachment,
      );
    } catch (error) {
      if (error instanceof FileImportError) throw error;
      throw new FileImportError('MODEL_REQUEST_FAILED', 'The AI model request failed.', 502);
    }
    logStage('AI_FILE_MODEL_REQUEST_COMPLETED', req, {
      requestedModel,
      resolvedModel: requestedModel,
      provider: modelResult.provider,
      durationMs: Date.now() - modelStartedAt,
    });

    stage = 'response_parse';
    const result = parseModelResponse(modelResult.content);
    logStage('AI_FILE_RESPONSE_PARSED', req, {
      nodeCount: result.nodeCount,
      warningCount: result.warnings.length,
      durationMs: Date.now() - startedAt,
    });

    res.json({
      requestId: req.requestId,
      modelUsed: requestedModel,
      provider: modelResult.provider,
      source: {
        extension: fileType.extension,
        mimeType: req.file.mimetype,
        byteSize: req.file.size,
        extractionStrategy: fileType.strategy,
        ...extraction.metadata,
      },
      result,
    });
  } catch (error) {
    error.requestId = req.requestId;
    error.failureStage = stage;
    next(error);
  }
};

exports.parseModelResponse = parseModelResponse;
