import request from 'supertest';
import WikiRoutes from '../WikiRoutes';
import { buildTestApp } from './__fixtures__/buildTestApp';
import { csrfTestHeaders } from '../../middleware/__tests__/__fixtures__/csrfTestHelpers';

/**
 * #1629: `asset-upload` has one door. `POST /images/upload` was a second
 * upload path with no permission check, reachable anonymously; uploads go
 * through `/attachments/upload` and AttachmentManager.uploadAttachment.
 */
const mockEngine = {
  getManager: vi.fn(() => null),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
};

describe('#1629 no second upload path', () => {
  test('POST /images/upload is not a route', async () => {
    const app = buildTestApp({ withCsrf: true });
    new WikiRoutes(mockEngine).registerRoutes(app);
    await request(app)
      .post('/images/upload')
      .set(csrfTestHeaders())
      .attach('image', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'x.svg')
      .expect(404);
  });
});
