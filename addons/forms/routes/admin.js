import { Router } from 'express';
import { ApiContext, ApiError } from '../../../dist/src/context/ApiContext.js';
export default function adminRoutes(engine, _addon) {
    const router = Router();
    function fdm() {
        return engine.getManager('FormsDataManager');
    }
    // ── GET /addons/forms ─────────────────────────────────────────────────────
    router.get('/', async (req, res) => {
        void (async () => {
            try {
                const ctx = ApiContext.from(req, engine);
                ctx.requireAuthenticated();
                await ctx.requirePermission('admin-system'); // #1198: policy, not a role name
                const m = fdm();
                const definitions = m?.getAllDefinitions() ?? [];
                const formsWithCounts = await Promise.all(definitions.map(async (form) => ({
                    ...form,
                    submissionCount: await m.getSubmissionCount(form.id)
                })));
                res.render('forms-admin', {
                    currentUser: req.userContext,
                    forms: formsWithCounts,
                    query: req.query
                });
            }
            catch (err) {
                if (err instanceof ApiError) {
                    res.status(err.status).send(err.message);
                    return;
                }
                res.status(500).send(String(err));
            }
        })();
    });
    // ── GET /addons/forms/:formId/submissions ─────────────────────────────────
    router.get('/:formId/submissions', async (req, res) => {
        void (async () => {
            try {
                const ctx = ApiContext.from(req, engine);
                ctx.requireAuthenticated();
                await ctx.requirePermission('admin-system'); // #1198: policy, not a role name
                const m = fdm();
                const form = m?.getDefinition(String(req.params['formId']));
                if (!form) {
                    res.status(404).send('Form not found');
                    return;
                }
                const status = typeof req.query['status'] === 'string' ? req.query['status'] : undefined;
                let submissions = await m.getSubmissions(String(req.params['formId']));
                if (status)
                    submissions = submissions.filter(s => s.status === status);
                res.render('forms-submissions', {
                    currentUser: req.userContext,
                    form,
                    submissions,
                    filterStatus: status ?? 'all'
                });
            }
            catch (err) {
                if (err instanceof ApiError) {
                    res.status(err.status).send(err.message);
                    return;
                }
                res.status(500).send(String(err));
            }
        })();
    });
    // ── GET /addons/forms/:formId/submissions/:submissionId ───────────────────
    router.get('/:formId/submissions/:submissionId', async (req, res) => {
        void (async () => {
            try {
                const ctx = ApiContext.from(req, engine);
                ctx.requireAuthenticated();
                await ctx.requirePermission('admin-system'); // #1198: policy, not a role name
                const m = fdm();
                const form = m?.getDefinition(String(req.params['formId']));
                if (!form) {
                    res.status(404).send('Form not found');
                    return;
                }
                const submissions = await m.getSubmissions(String(req.params['formId']));
                const submission = submissions.find(s => s.id === String(req.params['submissionId']));
                if (!submission) {
                    res.status(404).send('Submission not found');
                    return;
                }
                res.render('forms-submission-detail', {
                    currentUser: req.userContext,
                    form,
                    submission
                });
            }
            catch (err) {
                if (err instanceof ApiError) {
                    res.status(err.status).send(err.message);
                    return;
                }
                res.status(500).send(String(err));
            }
        })();
    });
    // ── POST /addons/forms/:formId/submissions/:submissionId/status ───────────
    router.post('/:formId/submissions/:submissionId/status', async (req, res) => {
        void (async () => {
            try {
                const ctx = ApiContext.from(req, engine);
                ctx.requireAuthenticated();
                await ctx.requirePermission('admin-system'); // #1198: policy, not a role name
                const body = req.body;
                const status = typeof body['status'] === 'string' ? body['status'] : undefined;
                if (!status || !['pending', 'processed', 'rejected'].includes(status)) {
                    res.status(400).json({ ok: false, error: 'Invalid status' });
                    return;
                }
                const notes = typeof body['notes'] === 'string' ? body['notes'] : undefined;
                const m = fdm();
                const updated = await m?.updateStatus(String(req.params['submissionId']), String(req.params['formId']), status, notes);
                if (!updated) {
                    res.status(404).json({ ok: false, error: 'Submission not found' });
                    return;
                }
                res.json({ ok: true });
            }
            catch (err) {
                if (err instanceof ApiError) {
                    res.status(err.status).json({ ok: false, error: err.message });
                    return;
                }
                res.status(500).json({ ok: false, error: String(err) });
            }
        })();
    });
    return router;
}
//# sourceMappingURL=admin.js.map