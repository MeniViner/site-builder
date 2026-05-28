import { Router } from 'express';
import { actorFromRequest } from '../auth/apiKey.js';
import {
  batchReadSchema,
  batchWriteSchema,
  createSiteSchema,
  legacyBatchReadSchema,
  legacyBatchWriteSchema,
  legacyWriteSchema,
  parseOrBadRequest,
  patchDataSchema,
  putDataSchema,
} from '../validation/schemas.js';
import { badRequest } from '../utils/errors.js';

function expectedVersionFrom(req, body = {}) {
  if (body.expectedVersion !== undefined) return body.expectedVersion;
  const header = req.get('if-match');
  if (!header) return undefined;
  return Number(String(header).replace(/^W\//i, '').replace(/"/g, '').trim());
}

function requestMeta(req) {
  return {
    ip: req.ip,
    userAgent: req.get('user-agent') || '',
  };
}

export function createSiteRouter({ repository, legacyRepository }) {
  const router = Router();

  router.get('/sites', async (_req, res, next) => {
    try {
      const sites = await repository.listSites();
      res.json({ ok: true, sites });
    } catch (error) {
      next(error);
    }
  });

  router.post('/sites', async (req, res, next) => {
    try {
      const payload = parseOrBadRequest(createSiteSchema, req.body);
      const site = await repository.ensureSite({ ...payload, actor: actorFromRequest(req) });
      res.status(201).json({ ok: true, site });
    } catch (error) {
      next(error);
    }
  });

  router.get('/sites/:siteId', async (req, res, next) => {
    try {
      const site = await repository.getSite(req.params.siteId);
      res.json({ ok: true, site });
    } catch (error) {
      next(error);
    }
  });

  router.get('/sites/:siteId/data/:scope', async (req, res, next) => {
    try {
      const documents = await repository.listDocuments(req.params.siteId, req.params.scope);
      res.json({ ok: true, documents });
    } catch (error) {
      next(error);
    }
  });

  router.get('/sites/:siteId/data/:scope/:entityId', async (req, res, next) => {
    try {
      const document = await repository.getDocument(
        req.params.siteId,
        req.params.scope,
        decodeURIComponent(req.params.entityId),
      );
      res.json({ ok: true, document });
    } catch (error) {
      next(error);
    }
  });

  router.put('/sites/:siteId/data/:scope/:entityId', async (req, res, next) => {
    try {
      const body = parseOrBadRequest(putDataSchema, req.body);
      const document = await repository.replaceDocument({
        siteId: req.params.siteId,
        scope: req.params.scope,
        entityId: decodeURIComponent(req.params.entityId),
        data: body.data,
        expectedVersion: expectedVersionFrom(req, body),
        allowEmptyOverwrite: body.allowEmptyOverwrite === true || req.query.allowEmptyOverwrite === 'true',
        actor: actorFromRequest(req),
        metadata: requestMeta(req),
      });
      res.json({ ok: true, document });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/sites/:siteId/data/:scope/:entityId', async (req, res, next) => {
    try {
      const body = parseOrBadRequest(patchDataSchema, req.body);
      const document = await repository.patchDocument({
        siteId: req.params.siteId,
        scope: req.params.scope,
        entityId: decodeURIComponent(req.params.entityId),
        patch: body.patch ?? body.data,
        expectedVersion: expectedVersionFrom(req, body),
        allowEmptyOverwrite: body.allowEmptyOverwrite === true || req.query.allowEmptyOverwrite === 'true',
        actor: actorFromRequest(req),
        metadata: requestMeta(req),
      });
      res.json({ ok: true, document });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/sites/:siteId/data/:scope/:entityId', async (req, res, next) => {
    try {
      const document = await repository.softDeleteDocument({
        siteId: req.params.siteId,
        scope: req.params.scope,
        entityId: decodeURIComponent(req.params.entityId),
        expectedVersion: expectedVersionFrom(req, req.body || {}),
        actor: actorFromRequest(req),
        metadata: requestMeta(req),
      });
      res.json({ ok: true, document });
    } catch (error) {
      next(error);
    }
  });

  router.post('/sites/:siteId/data/batch-read', async (req, res, next) => {
    try {
      const body = parseOrBadRequest(batchReadSchema, req.body);
      const results = await repository.batchRead(req.params.siteId, body.items);
      res.json({ ok: true, results });
    } catch (error) {
      next(error);
    }
  });

  router.post('/sites/:siteId/data/batch-write', async (req, res, next) => {
    try {
      const body = parseOrBadRequest(batchWriteSchema, req.body);
      const results = await repository.batchWrite(req.params.siteId, body.operations, actorFromRequest(req));
      const hasFailure = results.some((result) => !result.ok);
      res.status(hasFailure ? 207 : 200).json({ ok: !hasFailure, results });
    } catch (error) {
      next(error);
    }
  });

  router.get('/sites/:siteId/legacy-object', async (req, res, next) => {
    try {
      const key = String(req.query.key || '').trim();
      if (!key) throw badRequest('key query parameter is required');
      const result = await legacyRepository.readLegacyObject(req.params.siteId, key);
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  });

  router.put('/sites/:siteId/legacy-object', async (req, res, next) => {
    try {
      const body = parseOrBadRequest(legacyWriteSchema, req.body);
      const result = await legacyRepository.writeLegacyObject({
        siteId: req.params.siteId,
        key: body.key,
        data: body.data,
        expectedVersion: expectedVersionFrom(req, body),
        allowEmptyOverwrite: body.allowEmptyOverwrite === true || req.query.allowEmptyOverwrite === 'true',
        actor: actorFromRequest(req),
        metadata: requestMeta(req),
      });
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  });

  router.post('/sites/:siteId/legacy/batch-read', async (req, res, next) => {
    try {
      const body = parseOrBadRequest(legacyBatchReadSchema, req.body);
      const results = [];
      for (const key of body.keys) {
        try {
          results.push({ ok: true, ...(await legacyRepository.readLegacyObject(req.params.siteId, key)) });
        } catch (error) {
          results.push({ ok: false, key, error: error.code || 'read_failed', message: error.message });
        }
      }
      res.json({ ok: results.every((result) => result.ok), results });
    } catch (error) {
      next(error);
    }
  });

  router.post('/sites/:siteId/legacy/batch-write', async (req, res, next) => {
    try {
      const body = parseOrBadRequest(legacyBatchWriteSchema, req.body);
      const results = [];
      for (const item of body.items) {
        try {
          results.push({
            ok: true,
            ...(await legacyRepository.writeLegacyObject({
              siteId: req.params.siteId,
              key: item.key,
              data: item.data,
              expectedVersion: item.expectedVersion,
              allowEmptyOverwrite: item.allowEmptyOverwrite === true,
              actor: actorFromRequest(req),
              metadata: requestMeta(req),
            })),
          });
        } catch (error) {
          results.push({ ok: false, key: item.key, error: error.code || 'write_failed', message: error.message });
        }
      }
      const hasFailure = results.some((result) => !result.ok);
      res.status(hasFailure ? 207 : 200).json({ ok: !hasFailure, results });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export default createSiteRouter;
