/**
 * Test Harness UI Controller
 *
 * Serves the static Web UI files (index.html, style.css, app.js) for the
 * Sentinel Test Harness v2 directly from NestJS — no separate static server
 * needed, no CORS issues, no build-step asset-copy dependency.
 *
 * URLs served:
 *   GET /api/v1/test-harness-ui          → index.html
 *   GET /api/v1/test-harness-ui/style.css → style.css
 *   GET /api/v1/test-harness-ui/app.js    → app.js
 *
 * Source files live in:  apps/api/public/test-harness/
 *
 * ⚠️  DO NOT touch: apps/api/src/test-harness/ (backend module — services,
 * controller, repository). This file is intentionally separate.
 *
 * Created: 2026-08-08
 */

import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import * as path from 'path';

// Resolve the source public folder regardless of CWD or build output location.
// __dirname at runtime = apps/api/dist/  → go up one level → apps/api/
// then down to public/test-harness/
const UI_DIR = path.resolve(__dirname, '..', 'public', 'test-harness');

@Controller('test-harness-ui')
export class TestHarnessUiController {
  /** Main page */
  @Get()
  serveIndex(@Res() res: Response) {
    res.sendFile(path.join(UI_DIR, 'index.html'));
  }

  /** CSS */
  @Get('style.css')
  serveStyles(@Res() res: Response) {
    res.setHeader('Content-Type', 'text/css');
    res.sendFile(path.join(UI_DIR, 'style.css'));
  }

  /** JavaScript */
  @Get('app.js')
  serveAppJs(@Res() res: Response) {
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile(path.join(UI_DIR, 'app.js'));
  }
}
